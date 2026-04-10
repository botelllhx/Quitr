import type { FastifyReply, FastifyRequest } from 'fastify'
import '../lib/clerk.types'

/**
 * Middleware de isolamento de tenant.
 *
 * Quando a rota contém o parâmetro `:tenantId` na URL, verifica que ele
 * coincide com o `req.user.tenantId` da sessão autenticada.
 *
 * Deve ser usado APÓS o authMiddleware:
 *   preHandler: [authMiddleware, tenantMiddleware]
 *
 * Isso previne que um usuário do tenant A acesse dados do tenant B
 * mesmo que descubra um ID válido.
 */
export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const params = request.params as Record<string, string>
  const urlTenantId = params.tenantId

  if (!urlTenantId) return // rota sem :tenantId, nada a verificar

  if (!request.user) {
    // authMiddleware deve rodar antes; se user não existe, bloqueia
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Não autenticado' },
    })
  }

  if (urlTenantId !== request.user.tenantId) {
    return reply.status(403).send({
      error: {
        code: 'TENANT_MISMATCH',
        message: 'Acesso negado: você não pertence a esta organização',
      },
    })
  }
}
