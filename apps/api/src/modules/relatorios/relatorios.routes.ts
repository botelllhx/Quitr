import type { FastifyInstance } from 'fastify'
import { db } from '@repo/db'
import { authMiddleware } from '../../middlewares/auth.middleware'

export async function relatoriosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── GET /relatorios/aging ─────────────────────────────────────────────────
  // ?formato=csv → CSV download   (default: JSON)
  app.get('/aging', async (request, reply) => {
    const { tenantId } = request.user
    const { formato } = request.query as { formato?: string }

    const hoje = new Date()

    const dividas = await db.divida.findMany({
      where: { tenantId, status: { in: ['em_aberto', 'em_negociacao'] }, deletedAt: null },
      orderBy: { dataVencimento: 'asc' },
      include: {
        devedor: { select: { nome: true, cpfCnpj: true, scoreContactabilidade: true } },
        disparos: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    })

    function faixa(diasAtraso: number): string {
      if (diasAtraso <= 30) return '0–30 dias'
      if (diasAtraso <= 60) return '31–60 dias'
      if (diasAtraso <= 90) return '61–90 dias'
      return '90+ dias'
    }

    const rows = dividas.map((d) => {
      const diasAtraso = Math.max(
        0,
        Math.floor((hoje.getTime() - new Date(d.dataVencimento).getTime()) / (1000 * 60 * 60 * 24))
      )
      return {
        devedor: d.devedor.nome,
        cpfCnpj: d.devedor.cpfCnpj ?? '',
        valorOriginal: d.valorOriginal,
        valorAtualizado: d.valorAtualizado,
        dataVencimento: new Date(d.dataVencimento).toLocaleDateString('pt-BR'),
        diasAtraso,
        faixa: faixa(diasAtraso),
        status: d.status,
        scoreRecuperabilidade: d.score,
        scoreContactabilidade: d.devedor.scoreContactabilidade,
        ultimoContato: d.disparos[0]
          ? new Date(d.disparos[0].createdAt).toLocaleDateString('pt-BR')
          : '',
      }
    })

    if (formato === 'csv') {
      const headers = [
        'Devedor', 'CPF/CNPJ', 'Valor Original (R$)', 'Valor Atualizado (R$)',
        'Data Vencimento', 'Dias Atraso', 'Faixa', 'Status',
        'Score Recup.', 'Score Contact.', 'Último Contato',
      ]

      const csvLines = [
        headers.join(';'),
        ...rows.map((r) =>
          [
            `"${r.devedor}"`,
            r.cpfCnpj,
            (r.valorOriginal / 100).toFixed(2).replace('.', ','),
            (r.valorAtualizado / 100).toFixed(2).replace('.', ','),
            r.dataVencimento,
            r.diasAtraso,
            `"${r.faixa}"`,
            r.status,
            r.scoreRecuperabilidade,
            r.scoreContactabilidade,
            r.ultimoContato,
          ].join(';')
        ),
      ]

      const dataStr = new Date().toISOString().slice(0, 10)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="aging-list-quitr-${dataStr}.csv"`)
      return reply.send('\uFEFF' + csvLines.join('\n')) // BOM para Excel
    }

    return reply.send({ data: rows, meta: { total: rows.length } })
  })
}
