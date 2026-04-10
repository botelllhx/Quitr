import type { FastifyInstance } from 'fastify'
import { db } from '@repo/db'
import { authMiddleware } from '../../middlewares/auth.middleware'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── GET /dashboard/metricas ──────────────────────────────────────────────
  app.get('/metricas', async (request) => {
    const { tenantId } = request.user
    const agora = new Date()
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
    const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
    const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59)

    // ── Total em aberto ───────────────────────────────────────────────────────
    const dividasAbertas = await db.divida.findMany({
      where: { tenantId, status: { in: ['em_aberto', 'em_negociacao'] }, deletedAt: null },
      select: { valorAtualizado: true },
    })
    const totalEmAbertoValor = dividasAbertas.reduce((s, d) => s + d.valorAtualizado, 0)

    // ── Recuperado no mês atual ───────────────────────────────────────────────
    const parcelasMes = await db.parcela.findMany({
      where: {
        pagoEm: { gte: inicioMes },
        status: 'paga',
        acordo: { tenantId },
      },
      select: { valor: true },
    })
    const recuperadoMes = parcelasMes.reduce((s, p) => s + p.valor, 0)

    // ── Recuperado no mês anterior ────────────────────────────────────────────
    const parcelasMesAnterior = await db.parcela.findMany({
      where: {
        pagoEm: { gte: inicioMesAnterior, lte: fimMesAnterior },
        status: 'paga',
        acordo: { tenantId },
      },
      select: { valor: true },
    })
    const recuperadoMesAnterior = parcelasMesAnterior.reduce((s, p) => s + p.valor, 0)
    const variacaoPercMesAnterior =
      recuperadoMesAnterior === 0
        ? 0
        : Math.round(((recuperadoMes - recuperadoMesAnterior) / recuperadoMesAnterior) * 100)

    // ── Taxa de recuperação ───────────────────────────────────────────────────
    const totalDividasAbertas = dividasAbertas.length
    const dividasQuitadasMes = await db.divida.count({
      where: { tenantId, status: 'quitada', updatedAt: { gte: inicioMes } },
    })
    const taxaRecuperacao =
      totalDividasAbertas + dividasQuitadasMes === 0
        ? 0
        : Math.round((dividasQuitadasMes / (totalDividasAbertas + dividasQuitadasMes)) * 100)

    // ── Acordos ativos ────────────────────────────────────────────────────────
    const acordosAtivos = await db.acordo.findMany({
      where: { tenantId, status: { in: ['ativo', 'assinado'] } },
      select: { valorTotal: true },
    })

    // ── Devedores por perfil ──────────────────────────────────────────────────
    const perfilCounts = await db.devedor.groupBy({
      by: ['perfil'],
      where: { tenantId, deletedAt: null },
      _count: { id: true },
    })
    const devedoresPorPerfil = Object.fromEntries(
      perfilCounts.map((p) => [p.perfil, p._count.id])
    ) as Record<string, number>

    // ── Evolução mensal (últimos 6 meses) ─────────────────────────────────────
    const evolucaoMensal: Array<{ mes: string; recuperado: number; emAberto: number }> = []
    for (let i = 5; i >= 0; i--) {
      const mesInicio = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
      const mesFim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 0, 23, 59, 59)
      const label = mesInicio.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })

      const [parcsPagas, dividasAbertasRef] = await Promise.all([
        db.parcela.findMany({
          where: { pagoEm: { gte: mesInicio, lte: mesFim }, status: 'paga', acordo: { tenantId } },
          select: { valor: true },
        }),
        db.divida.findMany({
          where: {
            tenantId,
            status: { in: ['em_aberto', 'em_negociacao'] },
            createdAt: { lte: mesFim },
            deletedAt: null,
          },
          select: { valorAtualizado: true },
        }),
      ])

      evolucaoMensal.push({
        mes: label,
        recuperado: parcsPagas.reduce((s, p) => s + p.valor, 0),
        emAberto: dividasAbertasRef.reduce((s, d) => s + d.valorAtualizado, 0),
      })
    }

    // ── Aging list ────────────────────────────────────────────────────────────
    const hoje = new Date()
    const dividasTodas = await db.divida.findMany({
      where: { tenantId, status: { in: ['em_aberto', 'em_negociacao'] }, deletedAt: null },
      select: { valorAtualizado: true, dataVencimento: true },
    })

    const aging = [
      { faixa: '0–30 dias', min: 0, max: 30, quantidade: 0, valor: 0 },
      { faixa: '31–60 dias', min: 31, max: 60, quantidade: 0, valor: 0 },
      { faixa: '61–90 dias', min: 61, max: 90, quantidade: 0, valor: 0 },
      { faixa: '90+ dias', min: 91, max: Infinity, quantidade: 0, valor: 0 },
    ]

    for (const d of dividasTodas) {
      const dias = Math.max(
        0,
        Math.floor((hoje.getTime() - new Date(d.dataVencimento).getTime()) / (1000 * 60 * 60 * 24))
      )
      const faixa = aging.find((f) => dias >= f.min && dias <= f.max)
      if (faixa) {
        faixa.quantidade++
        faixa.valor += d.valorAtualizado
      }
    }

    // ── Disparos por canal (últimos 30 dias) ─────────────────────────────────
    const inicio30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const disparos30d = await db.disparo.findMany({
      where: { tenantId, createdAt: { gte: inicio30d } },
      select: { canal: true, status: true },
    })

    const canalStats: Record<string, { enviados: number; respondidos: number }> = {
      whatsapp: { enviados: 0, respondidos: 0 },
      email: { enviados: 0, respondidos: 0 },
      sms: { enviados: 0, respondidos: 0 },
    }
    for (const d of disparos30d) {
      const c = canalStats[d.canal]
      if (!c) continue
      c.enviados++
      if (d.status === 'respondido') c.respondidos++
    }

    const disparosPorCanal = Object.fromEntries(
      Object.entries(canalStats).map(([canal, stats]) => [
        canal,
        {
          ...stats,
          taxaResposta:
            stats.enviados === 0 ? 0 : Math.round((stats.respondidos / stats.enviados) * 100),
        },
      ])
    )

    return {
      data: {
        totalEmAberto: { quantidade: dividasAbertas.length, valor: totalEmAbertoValor },
        recuperadoMes: {
          quantidade: parcelasMes.length,
          valor: recuperadoMes,
          variacaoPercMesAnterior,
        },
        taxaRecuperacao,
        acordosAtivos: {
          quantidade: acordosAtivos.length,
          valor: acordosAtivos.reduce((s, a) => s + a.valorTotal, 0),
        },
        devedoresPorPerfil,
        evolucaoMensal,
        agingList: aging.map(({ min: _min, max: _max, ...rest }) => rest),
        disparosPorCanal,
      },
    }
  })
}
