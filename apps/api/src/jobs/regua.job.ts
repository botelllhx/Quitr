import { Worker } from 'bullmq'
import { db } from '@repo/db'
import type { Disparo } from '@repo/db'
import {
  formatCurrency,
  formatDate,
  interpolarTemplate,
  calcularDiasOffset,
} from '@repo/utils'
import { disparosQueue, reguaQueue, redisConnection } from '../modules/disparos/queue'
import type { DisparoJobPayload } from '../modules/disparos/queue'

const TZ_BRASILIA = 'America/Sao_Paulo'

/** Regra CDC: máximo de 3 contatos por semana por devedor */
const MAX_CONTATOS_SEMANA = 3

// ─── Lógica principal ─────────────────────────────────────────────────────────

export async function executarReguaDiaria(): Promise<void> {
  const inicioExecucao = Date.now()
  let dividasProcessadas = 0
  let disparosEnfileirados = 0
  let erros = 0

  console.info('[regua.job] Iniciando execução da régua diária...')

  // 1. Buscar todos os tenants ativos
  const tenants = await db.tenant.findMany({ where: { ativo: true } })
  console.info(`[regua.job] ${tenants.length} tenant(s) ativo(s)`)

  for (const tenant of tenants) {
    // 2. Buscar dívidas abertas (sem soft-delete, com devedor e régua)
    const dividas = await db.divida.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ['em_aberto', 'em_negociacao'] },
        deletedAt: null,
      },
      include: {
        devedor: true,
        regua: {
          where: { ativa: true },
          include: { etapas: { orderBy: { ordem: 'asc' } } },
        },
      },
    })

    // Régua padrão do tenant (fallback para dívidas sem régua ou com régua inativa)
    const reguaPadrao = await db.regua.findFirst({
      where: { tenantId: tenant.id, padrao: true, ativa: true },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
    })

    // IDs de todas as dívidas agrupadas por devedor (para checar limite semanal)
    const dividasPorDevedor = new Map<string, string[]>()
    for (const d of dividas) {
      const lista = dividasPorDevedor.get(d.devedorId) ?? []
      lista.push(d.id)
      dividasPorDevedor.set(d.devedorId, lista)
    }

    for (const divida of dividas) {
      dividasProcessadas++
      try {
        // 3a. Resolver régua ativa para esta dívida
        const regua = divida.regua ?? reguaPadrao
        if (!regua || regua.etapas.length === 0) continue

        // 3b. Calcular diasAtraso (pode ser negativo para pré-vencimento)
        const diasAtraso = calcularDiasOffset(divida.dataVencimento)

        // 3c. Verificar opt-out global do devedor
        if (divida.devedor.optOut) continue

        // 3d. Verificar limite semanal de contatos (CDC: máx 3/semana/devedor)
        const semanaPassada = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const idsDevedorDividas = dividasPorDevedor.get(divida.devedorId) ?? [divida.id]
        const disparosSemana = await db.disparo.count({
          where: {
            dividaId: { in: idsDevedorDividas },
            createdAt: { gte: semanaPassada },
            status: { not: 'falhou' },
          },
        })
        if (disparosSemana >= MAX_CONTATOS_SEMANA) continue

        // 3e. Buscar último disparo da dívida (para checar condição da etapa)
        const ultimoDisparo = await db.disparo.findFirst({
          where: { dividaId: divida.id },
          orderBy: { createdAt: 'desc' },
        })

        // 3f. Processar cada etapa elegível
        for (const etapa of regua.etapas) {
          // Etapa ainda não chegou ao seu gatilho de dia
          if (etapa.diaOffset > diasAtraso) continue

          // Já existe disparo pendente/enviado para esta etapa nesta dívida
          const jaDisparado = await db.disparo.findFirst({
            where: {
              dividaId: divida.id,
              etapaId: etapa.id,
              status: { notIn: ['falhou'] },
            },
          })
          if (jaDisparado) continue

          // Verificar condição da etapa
          if (!avaliarCondicao(etapa.condicao as CondicaoEtapa, ultimoDisparo)) continue

          // Interpolar template com dados reais
          const linkAcordo = divida.acordoToken
            ? `${process.env.APP_URL ?? 'https://app.quitr.com.br'}/acordo/${divida.acordoToken}`
            : ''

          const conteudo = interpolarTemplate(etapa.mensagemTemplate, {
            nome: divida.devedor.nome,
            valor: formatCurrency(divida.valorAtualizado),
            vencimento: formatDate(divida.dataVencimento),
            diasAtraso,
            linkAcordo,
            empresa: tenant.nome || 'Empresa',
            telefoneEmpresa: tenant.telefoneEmpresa ?? '',
          })

          // Criar registro de Disparo com status PENDENTE
          const disparo = await db.disparo.create({
            data: {
              tenantId: tenant.id,
              dividaId: divida.id,
              etapaId: etapa.id,
              canal: etapa.canal,
              conteudo,
              status: 'pendente',
              tentativas: 0,
            },
          })

          // Enfileirar job na fila 'disparos'
          const payload: DisparoJobPayload = {
            disparoId: disparo.id,
            tenantId: tenant.id,
            devedorId: divida.devedorId,
            dividaId: divida.id,
            canal: etapa.canal as DisparoJobPayload['canal'],
            conteudo,
            tentativa: 0,
          }
          await disparosQueue.add('enviar', payload)
          disparosEnfileirados++
        }
      } catch (err) {
        erros++
        console.error(
          `[regua.job] Erro ao processar dívida ${divida.id}:`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  const duracao = ((Date.now() - inicioExecucao) / 1000).toFixed(2)
  console.info(
    `[regua.job] Régua executada em ${duracao}s: ` +
      `${dividasProcessadas} dívidas processadas, ` +
      `${disparosEnfileirados} disparos enfileirados, ` +
      `${erros} erros`
  )
}

// ─── Avaliação de condição da etapa ───────────────────────────────────────────

type CondicaoEtapa = 'sempre' | 'semResposta' | 'comResposta' | 'naoAbriu'

function avaliarCondicao(
  condicao: CondicaoEtapa,
  ultimoDisparo: Disparo | null
): boolean {
  switch (condicao) {
    case 'sempre':
      return true

    case 'semResposta':
      // Dispara se não há histórico ou o último não foi respondido
      if (!ultimoDisparo) return true
      return ultimoDisparo.status !== 'respondido'

    case 'comResposta':
      // Dispara apenas se houve resposta ao último contato
      if (!ultimoDisparo) return false
      return ultimoDisparo.status === 'respondido'

    case 'naoAbriu':
      // Dispara se o último não foi lido nem respondido
      if (!ultimoDisparo) return true
      return !['lido', 'respondido'].includes(ultimoDisparo.status)

    default:
      return true
  }
}

// ─── Agendamento do cron via BullMQ ──────────────────────────────────────────

let reguaWorker: Worker | null = null

export async function iniciarReguaJob(): Promise<void> {
  // Limpar jobs repetíveis anteriores para evitar duplicatas ao reiniciar
  const repetiveisAnteriores = await reguaQueue.getRepeatableJobs()
  for (const job of repetiveisAnteriores) {
    await reguaQueue.removeRepeatableByKey(job.key)
  }

  // Registrar job diário às 08:05 no horário de Brasília
  await reguaQueue.add(
    'executar-regua-diaria',
    {},
    {
      repeat: {
        pattern: '5 8 * * *',
        tz: TZ_BRASILIA,
      },
    }
  )

  // Worker que processa o job da régua (concorrência 1 — só uma execução por vez)
  reguaWorker = new Worker(
    'regua-diaria',
    async () => {
      await executarReguaDiaria()
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  )

  reguaWorker.on('completed', () => {
    console.info('[regua.job] Job diário concluído')
  })

  reguaWorker.on('failed', (_job, err) => {
    console.error('[regua.job] Job diário falhou:', err.message)
  })

  console.info('[regua.job] Cron registrado: 08:05 horário de Brasília (5 8 * * *)')
}
