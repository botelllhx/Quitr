import type { FastifyReply, FastifyRequest } from 'fastify'
import { getAuth } from '@clerk/fastify'
import { db } from '@repo/db'
import '../lib/clerk.types'

/**
 * Middleware de autenticação — deve ser registrado como preHandler nas rotas protegidas
 * ou via `app.addHook('preHandler', authMiddleware)` no escopo autenticado.
 *
 * Valida o Bearer token via Clerk, extrai userId + orgId e injeta `req.user`.
 *
 * Fluxo:
 *   1. Clerk verifica a assinatura do JWT via CLERK_SECRET_KEY
 *   2. userId ausente → 401
 *   3. orgId ausente (usuário sem organização ativa) → 403
 *   4. req.user preenchido com { id, tenantId, papel }
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { userId, orgId, orgRole } = getAuth(request)

  if (!userId) {
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token inválido ou ausente',
      },
    })
  }

  if (!orgId) {
    return reply.status(403).send({
      error: {
        code: 'NO_TENANT',
        message: 'Nenhuma organização ativa na sessão. Selecione uma organização.',
      },
    })
  }

  // Garante que o tenant existe no banco (lazy creation pelo Clerk org ID)
  await db.tenant.upsert({
    where: { id: orgId },
    create: { id: orgId },
    update: {},
  })

  request.user = {
    id: userId,
    tenantId: orgId,
    papel: orgRole === 'org:admin' ? 'admin' : 'membro',
  }
}
