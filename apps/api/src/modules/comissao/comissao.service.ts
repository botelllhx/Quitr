import { db } from '@repo/db'

// ─── Faixas de comissão padrão (configurável por tenant no futuro) ─────────────
// valorRecuperado em centavos
const FAIXAS = [
  { ate: 500_000, percentual: 5 },   // até R$5.000 → 5%
  { ate: 1_500_000, percentual: 7 }, // até R$15.000 → 7%
  { ate: Infinity, percentual: 9 },  // acima → 9%
]

function calcularPercentual(valorRecuperadoCentavos: number): number {
  const faixa = FAIXAS.find((f) => valorRecuperadoCentavos <= f.ate) ?? FAIXAS[FAIXAS.length - 1]!
  return faixa.percentual
}

// ─── Resumo por cobrador para um mês/ano ─────────────────────────────────────

export type ItemComissaoMensal = {
  cobradorId: string
  cobradorNome: string
  carteira: number
  valorRecuperado: number
  comissao: number
  percentual: number
  acordosFechados: number
  acordosQuebrados: number
}

export async function calcularComissaoMensal(
  tenantId: string,
  mes: number,
  ano: number
): Promise<ItemComissaoMensal[]> {
  const inicio = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 1)

  // Parcelas pagas no período
  const parcelas = await db.parcela.findMany({
    where: {
      pagoEm: { gte: inicio, lt: fim },
      status: 'paga',
      acordo: { tenantId, status: { not: 'cancelado' } },
    },
    select: {
      valor: true,
      acordo: {
        select: {
          status: true,
          divida: {
            select: {
              devedorId: true,
              devedor: { select: { cobradorId: true, nome: true } },
            },
          },
        },
      },
    },
  })

  // Acordos quebrados no período (inadimplentes)
  const quebrados = await db.acordo.findMany({
    where: {
      tenantId,
      status: 'inadimplente',
      inadimplenteAt: { gte: inicio, lt: fim },
    },
    select: {
      divida: { select: { devedor: { select: { cobradorId: true } } } },
    },
  })

  // Acordos fechados (ativo/assinado/quitado) criados no período
  const fechados = await db.acordo.findMany({
    where: {
      tenantId,
      status: { in: ['ativo', 'assinado', 'quitado'] },
      createdAt: { gte: inicio, lt: fim },
    },
    select: {
      divida: { select: { devedor: { select: { cobradorId: true } } } },
    },
  })

  // Carteira por cobrador (devedores ativos atribuídos)
  const carteiras = await db.devedor.groupBy({
    by: ['cobradorId'],
    where: { tenantId, cobradorId: { not: null }, deletedAt: null },
    _count: { id: true },
  })

  // Agrupa recuperado por cobrador
  const mapa = new Map<string, ItemComissaoMensal>()

  function ensureCobrador(id: string): ItemComissaoMensal {
    if (!mapa.has(id)) {
      mapa.set(id, {
        cobradorId: id,
        cobradorNome: id, // será substituído abaixo
        carteira: 0,
        valorRecuperado: 0,
        comissao: 0,
        percentual: 0,
        acordosFechados: 0,
        acordosQuebrados: 0,
      })
    }
    return mapa.get(id)!
  }

  for (const p of parcelas) {
    const cobradorId = p.acordo.divida.devedor.cobradorId
    if (!cobradorId) continue
    const item = ensureCobrador(cobradorId)
    item.valorRecuperado += p.valor
  }

  for (const q of quebrados) {
    const cobradorId = q.divida.devedor.cobradorId
    if (!cobradorId) continue
    ensureCobrador(cobradorId).acordosQuebrados++
  }

  for (const f of fechados) {
    const cobradorId = f.divida.devedor.cobradorId
    if (!cobradorId) continue
    ensureCobrador(cobradorId).acordosFechados++
  }

  for (const c of carteiras) {
    if (!c.cobradorId) continue
    const item = mapa.get(c.cobradorId)
    if (item) item.carteira = c._count.id
  }

  // Calcula comissão e percentual
  for (const item of mapa.values()) {
    item.percentual = calcularPercentual(item.valorRecuperado)
    item.comissao = Math.round((item.valorRecuperado * item.percentual) / 100)
  }

  return Array.from(mapa.values()).sort((a, b) => b.valorRecuperado - a.valorRecuperado)
}

// ─── Fechar mês: gera snapshot imutável ──────────────────────────────────────

export async function fecharComissaoMensal(
  tenantId: string,
  mes: number,
  ano: number
): Promise<{ id: string }> {
  const itens = await calcularComissaoMensal(tenantId, mes, ano)

  const totalRecuperado = itens.reduce((s, i) => s + i.valorRecuperado, 0)
  const totalComissao = itens.reduce((s, i) => s + i.comissao, 0)

  const fechamento = await db.fechamentoComissao.upsert({
    where: { tenantId_mes_ano: { tenantId, mes, ano } },
    create: {
      tenantId,
      mes,
      ano,
      status: 'fechado',
      totalRecuperado,
      totalComissao,
      fechadoAt: new Date(),
      itens: {
        create: itens.map((i) => ({
          cobradorId: i.cobradorId,
          cobradorNome: i.cobradorNome,
          valorRecuperado: i.valorRecuperado,
          comissao: i.comissao,
          percentual: i.percentual,
          acordosFechados: i.acordosFechados,
          acordosQuebrados: i.acordosQuebrados,
        })),
      },
    },
    update: {
      status: 'fechado',
      totalRecuperado,
      totalComissao,
      fechadoAt: new Date(),
    },
  })

  return { id: fechamento.id }
}

// ─── Histórico de fechamentos ─────────────────────────────────────────────────

export async function listarFechamentos(tenantId: string) {
  return db.fechamentoComissao.findMany({
    where: { tenantId },
    orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
    include: {
      itens: true,
    },
  })
}

// ─── Minha comissão (cobrador individual) ────────────────────────────────────

export async function minhaComissao(tenantId: string, cobradorId: string) {
  const agora = new Date()
  const mes = agora.getMonth() + 1
  const ano = agora.getFullYear()

  const itens = await calcularComissaoMensal(tenantId, mes, ano)
  const minha = itens.find((i) => i.cobradorId === cobradorId) ?? null

  // Minha carteira
  const devedores = await db.devedor.findMany({
    where: { tenantId, cobradorId, deletedAt: null },
    select: {
      id: true,
      nome: true,
      perfil: true,
      scoreContactabilidade: true,
      dividas: {
        where: { status: { in: ['em_aberto', 'em_negociacao'] }, deletedAt: null },
        select: { valorAtualizado: true, score: true },
      },
    },
    orderBy: { nome: 'asc' },
  })

  // Histórico de fechamentos do cobrador
  const historico = await db.comissaoItem.findMany({
    where: { cobradorId },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: {
      fechamento: { select: { mes: true, ano: true, status: true } },
    },
  })

  return { minha, devedores, historico, mes, ano }
}

// ─── Ranking tempo real ───────────────────────────────────────────────────────

export async function rankingComissao(tenantId: string) {
  const agora = new Date()
  const mes = agora.getMonth() + 1
  const ano = agora.getFullYear()

  const itens = await calcularComissaoMensal(tenantId, mes, ano)
  return itens
}
