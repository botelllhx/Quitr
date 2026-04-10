import { db } from '@repo/db'

// ─── Score de Recuperabilidade (por dívida) ───────────────────────────────────

/**
 * Algoritmo rules-based 0–100.
 * Fórmula: soma ponderada de 5 fatores.
 */
export async function calcularScoreRecuperabilidade(dividaId: string): Promise<number> {
  const divida = await db.divida.findUnique({
    where: { id: dividaId },
    include: {
      disparos: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      acordos: {
        orderBy: { createdAt: 'desc' },
      },
      devedor: {
        select: { acordosQuebrados: true },
      },
    },
  })

  if (!divida) return 50

  const hoje = new Date()

  // ── Fator 1: diasAtraso (peso 40%) ────────────────────────────────────────
  const diasAtraso = Math.max(
    0,
    Math.floor((hoje.getTime() - divida.dataVencimento.getTime()) / (1000 * 60 * 60 * 24))
  )
  const f1 =
    diasAtraso <= 15 ? 100
    : diasAtraso <= 30 ? 80
    : diasAtraso <= 60 ? 50
    : diasAtraso <= 90 ? 30
    : 10

  // ── Fator 2: respondeu última mensagem (peso 20%) ─────────────────────────
  const ultimaResposta = divida.disparos.find((d) => d.status === 'respondido')
  let f2 = 20
  if (ultimaResposta?.respondidoAt) {
    const diasDesdeResposta = Math.floor(
      (hoje.getTime() - ultimaResposta.respondidoAt.getTime()) / (1000 * 60 * 60 * 24)
    )
    f2 = diasDesdeResposta <= 7 ? 100 : diasDesdeResposta <= 30 ? 70 : 20
  }

  // ── Fator 3: tentativas sem resposta (peso 20%) ───────────────────────────
  const tentativasSemResposta = divida.disparos.filter(
    (d) => ['enviado', 'entregue', 'lido'].includes(d.status)
  ).length
  const f3 =
    tentativasSemResposta <= 2 ? 100
    : tentativasSemResposta <= 5 ? 60
    : 20

  // ── Fator 4: histórico de pagamento (peso 10%) ────────────────────────────
  const quitouAntes = divida.acordos.some((a) => a.status === 'quitado')
  const f4 = quitouAntes ? 100 : divida.devedor.acordosQuebrados > 0 ? 20 : 50

  // ── Fator 5: valor da dívida (peso 10%) ───────────────────────────────────
  const valorBRL = divida.valorAtualizado / 100
  const f5 =
    valorBRL < 500 ? 90
    : valorBRL < 2000 ? 70
    : valorBRL < 10000 ? 50
    : 30

  const score = Math.round(f1 * 0.4 + f2 * 0.2 + f3 * 0.2 + f4 * 0.1 + f5 * 0.1)
  return Math.min(100, Math.max(0, score))
}

// ─── Score de Contactabilidade (por devedor) ──────────────────────────────────

/**
 * Score 0–100 de quão fácil é contactar este devedor.
 */
export async function calcularScoreContactabilidade(devedorId: string): Promise<number> {
  const devedor = await db.devedor.findUnique({
    where: { id: devedorId },
    include: {
      contatos: { where: { status: { not: 'invalido' } } },
      dividas: {
        include: {
          disparos: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      },
    },
  })

  if (!devedor) return 50

  const hoje = new Date()

  // Todos os contatos (do modelo ContatoDevedor + telefone/email nativos do devedor)
  const contatosNativos = [devedor.telefone, devedor.email].filter(Boolean).length
  const contatosBureau = devedor.contatos.length
  const totalContatos = contatosNativos + contatosBureau

  // ── Fator 1: total de contatos (peso 30%) ─────────────────────────────────
  const f1 = totalContatos === 0 ? 10 : totalContatos === 1 ? 50 : totalContatos === 2 ? 80 : 100

  // ── Fator 2: contatos confirmados % (peso 30%) ────────────────────────────
  // Contatos nativos são considerados 100% confirmados; bureau considera só "ativo"
  const contatosAtivos = devedor.contatos.filter((c) => c.status === 'ativo').length
  const totalParaPerc = totalContatos
  const percAtivos = totalParaPerc > 0 ? (contatosNativos + contatosAtivos) / totalParaPerc : 0
  const f2 = Math.round(percAtivos * 100)

  // ── Fator 3: último contato respondeu (peso 20%) ──────────────────────────
  const todosDisparos = devedor.dividas.flatMap((d) => d.disparos)
  const ultimaResposta = todosDisparos.find((d) => d.status === 'respondido')
  const f3 = ultimaResposta ? 100 : 0

  // ── Fator 4: dias sem contato (peso 20%) ─────────────────────────────────
  const ultimoDisparo = todosDisparos
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

  let f4 = 10
  if (ultimoDisparo) {
    const diasSemContato = Math.floor(
      (hoje.getTime() - new Date(ultimoDisparo.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    f4 =
      diasSemContato < 7 ? 100
      : diasSemContato < 30 ? 60
      : diasSemContato < 60 ? 30
      : 10
  }

  const score = Math.round(f1 * 0.3 + f2 * 0.3 + f3 * 0.2 + f4 * 0.2)
  return Math.min(100, Math.max(0, score))
}

// ─── Recomendação combinada ───────────────────────────────────────────────────

export type RecomendacaoAcao =
  | 'regua_leve_acordo_imediato'
  | 'buscar_contato_bureau'
  | 'regua_rapida_negativar'
  | 'vender_carteira'

export function recomendarAcao(
  scoreRecuperabilidade: number,
  scoreContactabilidade: number
): RecomendacaoAcao {
  const altoR = scoreRecuperabilidade >= 50
  const altoC = scoreContactabilidade >= 50

  if (altoR && altoC)  return 'regua_leve_acordo_imediato'
  if (altoR && !altoC) return 'buscar_contato_bureau'
  if (!altoR && altoC) return 'regua_rapida_negativar'
  return 'vender_carteira'
}

export const RECOMENDACAO_LABELS: Record<RecomendacaoAcao, { label: string; desc: string; color: string }> = {
  regua_leve_acordo_imediato: {
    label: 'Acordo imediato',
    desc: 'Alta recuperabilidade e contactabilidade. Propor acordo com desconto.',
    color: 'text-green-700 bg-green-50 border-green-200',
  },
  buscar_contato_bureau: {
    label: 'Buscar novo contato',
    desc: 'Boa chance de receber, mas difícil contatar. Vale consultar bureau.',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  regua_rapida_negativar: {
    label: 'Régua rápida + negativar',
    desc: 'Fácil contato, mas baixa recuperabilidade. Pressionar e negativar logo.',
    color: 'text-orange-700 bg-orange-50 border-orange-200',
  },
  vender_carteira: {
    label: 'Vender carteira',
    desc: 'Baixa recuperabilidade e contactabilidade. Custo > retorno estimado.',
    color: 'text-red-700 bg-red-50 border-red-200',
  },
}

// ─── Recalcular todos os scores (chamado pelo job diário) ─────────────────────

export async function recalcularTodosOsScores(): Promise<{ dividas: number; devedores: number }> {
  // Dividas ativas → recalcular scoreRecuperabilidade
  const dividas = await db.divida.findMany({
    where: {
      status: { in: ['em_aberto', 'em_negociacao'] },
      deletedAt: null,
    },
    select: { id: true, devedorId: true },
  })

  let dividasAtualizadas = 0
  const devedoresSet = new Set<string>()

  for (const divida of dividas) {
    try {
      const score = await calcularScoreRecuperabilidade(divida.id)
      await db.divida.update({ where: { id: divida.id }, data: { score } })
      devedoresSet.add(divida.devedorId)
      dividasAtualizadas++
    } catch {
      // Log mas continua
    }
  }

  // Devedores únicos → recalcular scoreContactabilidade
  let devedoresAtualizados = 0
  for (const devedorId of devedoresSet) {
    try {
      const scoreContactabilidade = await calcularScoreContactabilidade(devedorId)
      await db.devedor.update({ where: { id: devedorId }, data: { scoreContactabilidade } })
      devedoresAtualizados++
    } catch {
      // Log mas continua
    }
  }

  return { dividas: dividasAtualizadas, devedores: devedoresAtualizados }
}
