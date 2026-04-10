import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../../middlewares/auth.middleware'
import {
  criarCheckout,
  obterPortalCliente,
  cancelarAssinatura,
  processarWebhookStripe,
  PLANOS,
  type PlanoId,
} from './stripe.service'

const checkoutBodySchema = z.object({
  plano: z.enum(['starter', 'pro', 'business']),
})

export async function billingRoutes(app: FastifyInstance) {
  // ─── POST /webhooks/stripe — escopo isolado com parser de buffer ──────────
  // O Stripe webhook requer o body raw (Buffer) para validar a assinatura HMAC.
  // Registrado em escopo filho para não sobrescrever o parser JSON global.
  app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => { done(null, body) }
    )

    webhookScope.post('/webhooks/stripe', async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string
      if (!signature) {
        return reply.status(400).send({
          error: { code: 'NO_SIGNATURE', message: 'stripe-signature ausente' },
        })
      }
      try {
        await processarWebhookStripe(request.body as Buffer, signature)
        return reply.status(200).send({ received: true })
      } catch (err) {
        const e = err as Error & { statusCode?: number }
        return reply.status(e.statusCode ?? 500).send({ error: { message: e.message } })
      }
    })
  })

  // ─── Rotas autenticadas ───────────────────────────────────────────────────
  app.register(async (sub) => {
    sub.addHook('preHandler', authMiddleware)

    // GET /billing/planos
    sub.get('/planos', async () => {
      return { data: PLANOS }
    })

    // POST /billing/checkout
    sub.post('/checkout', async (request, reply) => {
      const parsed = checkoutBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'plano inválido' },
        })
      }
      const result = await criarCheckout(request.user.tenantId, parsed.data.plano as PlanoId)
      return reply.send({ data: result })
    })

    // POST /billing/portal
    sub.post('/portal', async (request) => {
      const result = await obterPortalCliente(request.user.tenantId)
      return { data: result }
    })

    // DELETE /billing/assinatura
    sub.delete('/assinatura', async (request, reply) => {
      await cancelarAssinatura(request.user.tenantId)
      return reply.status(204).send()
    })
  }, { prefix: '/billing' })
}
