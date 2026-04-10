import { db } from '@repo/db'
import { randomUUID } from 'crypto'
import { despacharMensagem } from '../../integrations/dispatch'

// ─── Verificar acordos vencidos (job diário) ──────────────────────────────────

/**
 * Busca acordos ativos com parcelas vencidas há mais de N dias
 * (N = tenant.diasToleranciaQuebraAcordo) e os marca como INADIMPLENTE.
 *
 * Chamado pelo job de acordo-vencido às 09:00 BRT.
 */
export async function verificarAcordosVencidos(): Promise<{
  processados: number
  inadimplentes: number
  erros: number
}> {
  let processados = 0
  let inadimplentes = 0
  let erros = 0

  const tenants = await db.tenant.findMany({ where: { ativo: true } })

  for (const tenant of tenants) {
    // Datas de corte por tenant (tolerância configurável)
    const corte = new Date()
    corte.setDate(corte.getDate() - tenant.diasToleranciaQuebraAcordo)

    // Acordos ativos ou assinados com pelo menos uma parcela pendente vencida
    const acordosAtivos = await db.acordo.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ['ativo', 'assinado'] },
        parcelas: {
          some: {
            status: 'pendente',
            vencimento: { lt: corte },
          },
        },
      },
      include: {
        divida: {
          include: { devedor: true },
        },
        parcelas: true,
      },
    })

    for (const acordo of acordosAtivos) {
      processados++
      try {
        await marcarComoInadimplente(acordo, tenant)
        inadimplentes++
      } catch (err) {
        erros++
        console.error(
          `[acordo-vencido] Erro ao processar acordo ${acordo.id}:`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  return { processados, inadimplentes, erros }
}

// ─── Marcar acordo como inadimplente ─────────────────────────────────────────

async function marcarComoInadimplente(
  acordo: Awaited<ReturnType<typeof db.acordo.findFirst>> & {
    divida: { devedor: { nome: string; email: string | null; telefone: string | null; optOut: boolean; acordosQuebrados: number; id: string; tenantId: string } }
    parcelas: { id: string; status: string }[]
  },
  tenant: { id: string; nome: string; email: string; jurosMensais: { toNumber(): number } }
) {
  if (!acordo) return

  // 1. Marcar acordo como inadimplente + cancelar parcelas pendentes
  await db.$transaction([
    db.acordo.update({
      where: { id: acordo.id },
      data: { status: 'inadimplente', inadimplenteAt: new Date() },
    }),
    db.parcela.updateMany({
      where: { acordoId: acordo.id, status: 'pendente' },
      data: { status: 'cancelada' },
    }),
  ])

  // 2. Incrementar acordosQuebrados do devedor
  const novoTotal = acordo.divida.devedor.acordosQuebrados + 1
  const novoPerfil = novoTotal >= 2 ? 'reincidente' : undefined

  await db.devedor.update({
    where: { id: acordo.divida.devedor.id },
    data: {
      acordosQuebrados: novoTotal,
      ...(novoPerfil ? { perfil: novoPerfil } : {}),
    },
  })

  // 3. Notificar devedor (WhatsApp se tiver telefone, e-mail se não)
  if (!acordo.divida.devedor.optOut) {
    const mensagemDevedor =
      `Olá, ${acordo.divida.devedor.nome}! Infelizmente seu acordo com ${tenant.nome || 'nossa empresa'} ` +
      `foi cancelado por falta de pagamento. Entre em contato para regularizar sua situação.`

    try {
      if (acordo.divida.devedor.telefone) {
        await despacharMensagem(
          'whatsapp',
          acordo.divida.devedor.telefone,
          mensagemDevedor,
          acordo.tenantId
        )
      } else if (acordo.divida.devedor.email) {
        await despacharMensagem(
          'email',
          acordo.divida.devedor.email,
          mensagemDevedor,
          acordo.tenantId
        )
      }
    } catch {
      // Falha na notificação não bloqueia o processo de quebra
      console.warn(`[acordo-vencido] Falha ao notificar devedor ${acordo.divida.devedor.id}`)
    }
  }

  // 4. Notificar credor via e-mail (se tenant tem e-mail configurado)
  if (tenant.email) {
    const mensagemCredor =
      `Acordo ${acordo.id} marcado como inadimplente. ` +
      `Devedor: ${acordo.divida.devedor.nome}. ` +
      `Acesse o painel para refatorar ou negativar.`

    try {
      await despacharMensagem('email', tenant.email, mensagemCredor, tenant.id)
    } catch {
      console.warn(`[acordo-vencido] Falha ao notificar credor ${tenant.id}`)
    }
  }
}

// ─── Refatorar acordo ─────────────────────────────────────────────────────────

export type RefatorarOpcoes = {
  numeroParcelas: 1 | 2 | 3
}

export type ResultadoRefatoracao = {
  novoAcordoId: string
  novoValorTotal: number
  novoToken: string
}

/**
 * Refatora um acordo inadimplente: recalcula o saldo, aplica multa de quebra
 * e gera um novo Acordo + Parcelas + token de portal.
 *
 * Lança erro se o limite de refatorações do tenant foi atingido.
 */
export async function refatorarAcordo(
  tenantId: string,
  acordoId: string,
  opcoes: RefatorarOpcoes
): Promise<ResultadoRefatoracao> {
  const [acordo, tenant] = await Promise.all([
    db.acordo.findFirst({
      where: { id: acordoId, tenantId },
      include: {
        parcelas: true,
        divida: { include: { devedor: true } },
      },
    }),
    db.tenant.findUnique({ where: { id: tenantId } }),
  ])

  if (!acordo) throw new Error('ACORDO_NAO_ENCONTRADO')
  if (!tenant) throw new Error('TENANT_NAO_ENCONTRADO')
  if (acordo.status !== 'inadimplente') throw new Error('ACORDO_NAO_INADIMPLENTE')

  // Verificar limite de refatorações
  if (acordo.tentativasRefatoracao >= tenant.limiteRefatoracoes) {
    throw new Error('LIMITE_REFATORACOES_ATINGIDO')
  }

  // Calcular saldo devedor:
  // 1. Parcelas não pagas
  const parcelasNaoPagas = acordo.parcelas.filter((p) => p.status !== 'paga')
  const saldoParcelas = parcelasNaoPagas.reduce((acc, p) => acc + p.valor, 0)

  // 2. Juros pro-rata sobre o período de inadimplência
  const inadimplenteAt = acordo.inadimplenteAt ?? new Date()
  const diasInadimplencia = Math.max(
    0,
    Math.floor((Date.now() - inadimplenteAt.getTime()) / (1000 * 60 * 60 * 24))
  )
  const jurosMensais = Number(tenant.jurosMensais)
  const jurosValor = Math.round(saldoParcelas * (jurosMensais / 100) * (diasInadimplencia / 30))

  // 3. Multa de quebra sobre o saldo total
  const multaQuebraAcordo = Number(tenant.multaQuebraAcordo)
  const multaValor = Math.round((saldoParcelas + jurosValor) * (multaQuebraAcordo / 100))

  const novoValorTotal = saldoParcelas + jurosValor + multaValor

  // Gerar novo token de portal
  const novoToken = randomUUID()
  const novoTokenExp = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72h

  // Calcular valor de cada parcela (última absorve o resto do arredondamento)
  const valorParcelaPadrao = Math.floor(novoValorTotal / opcoes.numeroParcelas)
  const restoCentavos = novoValorTotal - valorParcelaPadrao * opcoes.numeroParcelas

  // Criar novo Acordo + Parcelas + atualizar Divida em transação
  const novoAcordo = await db.$transaction(async (tx) => {
    const criado = await tx.acordo.create({
      data: {
        tenantId,
        dividaId: acordo.dividaId,
        valorTotal: novoValorTotal,
        valorEntrada: 0,
        numeroParcelas: opcoes.numeroParcelas,
        status: 'pendente',
        tentativasRefatoracao: acordo.tentativasRefatoracao + 1,
        acordoAnteriorId: acordoId,
      },
    })

    // Parcelas — 1ª vence em 3 dias, demais mensalmente
    const vencimentoPrimeira = new Date()
    vencimentoPrimeira.setDate(vencimentoPrimeira.getDate() + 3)

    for (let i = 1; i <= opcoes.numeroParcelas; i++) {
      const venc = new Date(vencimentoPrimeira)
      venc.setMonth(venc.getMonth() + (i - 1))
      const valor = i === opcoes.numeroParcelas
        ? valorParcelaPadrao + restoCentavos
        : valorParcelaPadrao

      await tx.parcela.create({
        data: {
          acordoId: criado.id,
          numero: i,
          valor,
          vencimento: venc,
          status: 'pendente',
        },
      })
    }

    // Atualizar token da dívida e manter status em_negociacao
    await tx.divida.update({
      where: { id: acordo.dividaId },
      data: {
        status: 'em_negociacao',
        acordoToken: novoToken,
        acordoTokenExp: novoTokenExp,
      },
    })

    return criado
  })

  return {
    novoAcordoId: novoAcordo.id,
    novoValorTotal,
    novoToken,
  }
}
