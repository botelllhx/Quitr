import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '@repo/db'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { refatorarAcordo } from './refatoracao.service'

const refatorarBodySchema = z.object({
  numeroParcelas: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

export async function acordosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── GET /acordos ─────────────────────────────────────────────────────────────
  app.get('/', async (request, reply) => {
    const { tenantId } = request.user

    const { status, devedorId, page = '1', limit = '20' } = request.query as Record<string, string>

    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)))
    const skip = (pageNum - 1) * limitNum

    const where: Record<string, unknown> = { tenantId }
    if (status) where.status = status
    if (devedorId) {
      where.divida = { devedor: { id: devedorId } }
    }

    const [acordos, total] = await Promise.all([
      db.acordo.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          divida: {
            select: {
              id: true,
              descricao: true,
              dataVencimento: true,
              devedor: { select: { id: true, nome: true } },
            },
          },
          parcelas: {
            select: { id: true, numero: true, valor: true, vencimento: true, status: true },
            orderBy: { numero: 'asc' },
          },
        },
      }),
      db.acordo.count({ where }),
    ])

    return reply.send({
      data: acordos,
      meta: { total, page: pageNum, pageSize: limitNum, totalPages: Math.ceil(total / limitNum) },
    })
  })

  // ─── GET /acordos/:id ─────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { tenantId } = request.user
    const { id } = request.params

    const acordo = await db.acordo.findFirst({
      where: { id, tenantId },
      include: {
        divida: {
          include: {
            devedor: {
              select: { id: true, nome: true, email: true, telefone: true, cpfCnpj: true },
            },
          },
        },
        parcelas: { orderBy: { numero: 'asc' } },
        cobrancas: { orderBy: { createdAt: 'asc' } },
        acordoAnterior: {
          select: { id: true, status: true, valorTotal: true, createdAt: true, tentativasRefatoracao: true },
        },
        acordosFilhos: {
          select: { id: true, status: true, valorTotal: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!acordo) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Acordo não encontrado.' },
      })
    }

    return reply.send({ data: acordo })
  })

  // ─── POST /acordos/:id/refatorar ──────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/refatorar', async (request, reply) => {
    const { tenantId } = request.user
    const { id } = request.params

    const parsed = refatorarBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: parsed.error.flatten() },
      })
    }

    try {
      const resultado = await refatorarAcordo(tenantId, id, { numeroParcelas: parsed.data.numeroParcelas })
      return reply.status(201).send({ data: resultado })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'

      const erros: Record<string, [number, string]> = {
        ACORDO_NAO_ENCONTRADO: [404, 'Acordo não encontrado.'],
        ACORDO_NAO_INADIMPLENTE: [409, 'Apenas acordos inadimplentes podem ser refatorados.'],
        LIMITE_REFATORACOES_ATINGIDO: [422, 'Limite de refatorações atingido para este devedor.'],
      }

      const [status, message] = erros[msg] ?? [500, null]
      if (message) {
        return reply.status(status).send({ error: { code: msg, message } })
      }
      throw err
    }
  })
}
