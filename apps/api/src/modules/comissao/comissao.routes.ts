import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../../middlewares/auth.middleware'
import {
  calcularComissaoMensal,
  fecharComissaoMensal,
  listarFechamentos,
  minhaComissao,
  rankingComissao,
} from './comissao.service'

const fecharBodySchema = z.object({
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2024),
})

export async function comissaoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── GET /comissao/equipe — resumo do mês atual ───────────────────────────
  app.get('/equipe', async (request) => {
    const { tenantId } = request.user
    const query = request.query as { mes?: string; ano?: string }
    const agora = new Date()
    const mes = query.mes ? parseInt(query.mes) : agora.getMonth() + 1
    const ano = query.ano ? parseInt(query.ano) : agora.getFullYear()

    const itens = await calcularComissaoMensal(tenantId, mes, ano)
    const totalRecuperado = itens.reduce((s, i) => s + i.valorRecuperado, 0)
    const totalComissao = itens.reduce((s, i) => s + i.comissao, 0)

    return { data: itens, meta: { mes, ano, totalRecuperado, totalComissao } }
  })

  // ─── GET /comissao/meu — dashboard individual do cobrador logado ──────────
  app.get('/meu', async (request) => {
    const { tenantId, id: cobradorId } = request.user
    const result = await minhaComissao(tenantId, cobradorId)
    return { data: result }
  })

  // ─── GET /comissao/historico — fechamentos anteriores ─────────────────────
  app.get('/historico', async (request) => {
    const { tenantId } = request.user
    const fechamentos = await listarFechamentos(tenantId)
    return { data: fechamentos }
  })

  // ─── GET /comissao/ranking — ranking tempo real ───────────────────────────
  app.get('/ranking', async (request) => {
    const { tenantId } = request.user
    const ranking = await rankingComissao(tenantId)
    return { data: ranking }
  })

  // ─── POST /comissao/fechar — gestor fecha o mês ───────────────────────────
  app.post('/fechar', async (request, reply) => {
    const { tenantId, papel } = request.user

    if (papel !== 'admin') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Apenas administradores podem fechar o mês' },
      })
    }

    const parsed = fecharBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'mes e ano são obrigatórios', details: parsed.error.issues },
      })
    }

    const { mes, ano } = parsed.data
    const result = await fecharComissaoMensal(tenantId, mes, ano)
    return reply.status(201).send({ data: result })
  })
}
