import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { clerkPlugin } from '@clerk/fastify'
import { clerkWebhookPlugin } from './modules/webhooks/clerk.webhook'
import { devedoresRoutes } from './modules/devedores/devedores.routes'

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
  app.register(clerkPlugin)

  // ─── Webhook Clerk (rota pública — verificação via svix) ─────────────────
  // Registrado em escopo isolado para usar o content-type parser de string.
  app.register(clerkWebhookPlugin)

  // ─── Módulos de negócio ───────────────────────────────────────────────────
  app.register(devedoresRoutes, { prefix: '/devedores' })

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
