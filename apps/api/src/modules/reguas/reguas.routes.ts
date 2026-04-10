import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { CreateReguaSchema, UpdateReguaSchema, SalvarEtapasSchema } from './reguas.schema'
import * as service from './reguas.service'

export async function reguasRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // ── GET /reguas ────────────────────────────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const result = await service.listarReguas(request.user.tenantId)
    return reply.send(result)
  })

  // ── POST /reguas ───────────────────────────────────────────────────────────
  fastify.post('/', async (request, reply) => {
    const parsed = CreateReguaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
      })
    }
    const regua = await service.criarRegua(request.user.tenantId, parsed.data)
    return reply.status(201).send({ data: regua })
  })

  // ── GET /reguas/:id ────────────────────────────────────────────────────────
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const regua = await service.buscarRegua(request.user.tenantId, id)
    return reply.send({ data: regua })
  })

  // ── PATCH /reguas/:id ──────────────────────────────────────────────────────
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateReguaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
      })
    }
    const regua = await service.atualizarRegua(request.user.tenantId, id, parsed.data)
    return reply.send({ data: regua })
  })

  // ── DELETE /reguas/:id ─────────────────────────────────────────────────────
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await service.deletarRegua(request.user.tenantId, id)
    return reply.status(204).send()
  })

  // ── PUT /reguas/:id/etapas — salvar todas as etapas do builder ─────────────
  fastify.put('/:id/etapas', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = SalvarEtapasSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message },
      })
    }
    const regua = await service.salvarEtapas(request.user.tenantId, id, parsed.data.etapas)
    return reply.send({ data: regua })
  })
}
