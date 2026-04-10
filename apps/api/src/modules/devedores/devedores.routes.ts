import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../middlewares/auth.middleware'
import {
  CreateDevedorSchema,
  UpdateDevedorSchema,
  ImportarDevedoresSchema,
  ListarDevedoresQuerySchema,
} from './devedores.schema'
import * as service from './devedores.service'

export async function devedoresRoutes(fastify: FastifyInstance) {
  // Todas as rotas deste plugin exigem autenticação
  fastify.addHook('preHandler', authMiddleware)

  // ── GET /devedores ──────────────────────────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const parsed = ListarDevedoresQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
      })
    }
    const result = await service.listarDevedores(request.user.tenantId, parsed.data)
    return reply.send(result)
  })

  // ── POST /devedores/importar ────────────────────────────────────────────────
  // Registrado ANTES de /:id para que "importar" não seja capturado como parâmetro
  fastify.post('/importar', async (request, reply) => {
    const parsed = ImportarDevedoresSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
      })
    }
    const result = await service.importarDevedores(
      request.user.tenantId,
      parsed.data.devedores
    )
    return reply.send({ data: result })
  })

  // ── GET /devedores/:id ─────────────────────────────────────────────────────
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const devedor = await service.buscarDevedor(request.user.tenantId, id)
    return reply.send({ data: devedor })
  })

  // ── POST /devedores ────────────────────────────────────────────────────────
  fastify.post('/', async (request, reply) => {
    const parsed = CreateDevedorSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
      })
    }
    const devedor = await service.criarDevedor(request.user.tenantId, parsed.data)
    return reply.status(201).send({ data: devedor })
  })

  // ── PATCH /devedores/:id ───────────────────────────────────────────────────
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateDevedorSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
      })
    }
    const devedor = await service.atualizarDevedor(request.user.tenantId, id, parsed.data)
    return reply.send({ data: devedor })
  })

  // ── DELETE /devedores/:id ─────────────────────────────────────────────────
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await service.softDeleteDevedor(request.user.tenantId, id)
    return reply.status(204).send()
  })
}
