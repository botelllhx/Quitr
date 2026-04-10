import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { clerkPlugin } from '@clerk/fastify'
import { clerkWebhookPlugin } from './modules/webhooks/clerk.webhook'
import { whatsappWebhookPlugin } from './modules/webhooks/whatsapp.webhook'
import { asaasWebhookPlugin } from './modules/webhooks/asaas.webhook'
import { autentiqueWebhookPlugin } from './modules/webhooks/autentique.webhook'
import { devedoresRoutes } from './modules/devedores/devedores.routes'
import { reguasRoutes } from './modules/reguas/reguas.routes'
import { integracoesRoutes } from './modules/integracoes/integracoes.routes'
import { trackRoutes } from './modules/track/track.routes'
import { portalRoutes } from './modules/portal/portal.routes'
import { acordosRoutes } from './modules/acordos/acordos.routes'
import { comissaoRoutes } from './modules/comissao/comissao.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { relatoriosRoutes } from './modules/relatorios/relatorios.routes'
import { billingRoutes } from './modules/billing/billing.routes'

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  })

  // ─── Plugins de segurança ─────────────────────────────────────────────────
  app.register(cors, {
    origin: process.env.APP_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  app.register(helmet, {
    contentSecurityPolicy: false,
  })

  // ─── Clerk (valida tokens em todas as rotas que usarem getAuth) ───────────
  // O plugin decora o request com os dados do token; a verificação do acesso
  // é feita pelo authMiddleware nos preHandlers de cada rota protegida.
  app.register(clerkPlugin, {
    publishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  })

  // ─── Webhook Clerk (rota pública — verificação via svix) ─────────────────
  // Registrado em escopo isolado para usar o content-type parser de string.
  app.register(clerkWebhookPlugin)

  // ─── Webhook WhatsApp (público — sem auth) ────────────────────────────────
  app.register(whatsappWebhookPlugin)

  // ─── Webhook Asaas (público — validação via token no header) ─────────────
  app.register(asaasWebhookPlugin)

  // ─── Webhook Autentique (público — sem validação de assinatura v1) ────────
  app.register(autentiqueWebhookPlugin)

  // ─── Tracking de e-mail (público — pixel 1×1) ────────────────────────────
  app.register(trackRoutes)

  // ─── Portal público do devedor (acordoToken — sem auth) ──────────────────
  app.register(portalRoutes)

  // ─── Módulos de negócio ───────────────────────────────────────────────────
  app.register(devedoresRoutes, { prefix: '/devedores' })
  app.register(reguasRoutes, { prefix: '/reguas' })
  app.register(integracoesRoutes, { prefix: '/integracoes' })
  app.register(acordosRoutes, { prefix: '/acordos' })
  app.register(comissaoRoutes, { prefix: '/comissao' })
  app.register(dashboardRoutes, { prefix: '/dashboard' })
  app.register(relatoriosRoutes, { prefix: '/relatorios' })
  app.register(billingRoutes)

  // ─── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ─── Tratamento global de erros ───────────────────────────────────────────
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    app.log.error(error)

    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: error.validation,
        },
      })
    }

    const statusCode = error.statusCode ?? 500
    const isClientError = statusCode < 500

    return reply.status(statusCode).send({
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: isClientError ? error.message : 'Erro interno do servidor',
      },
    })
  })

  return app
}
