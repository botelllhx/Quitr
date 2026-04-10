// ─── Tipo do usuário autenticado ──────────────────────────────────────────────

export type AuthUser = {
  /** Clerk userId */
  id: string
  /** Clerk orgId — equivale ao tenantId no banco */
  tenantId: string
  /** Papel dentro da organização */
  papel: 'admin' | 'membro'
}

// ─── Augmentação do FastifyRequest ────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Preenchido pelo authMiddleware após validação do token Clerk.
     * Disponível em todas as rotas que usam `preHandler: [authMiddleware]`
     * ou que registram o hook globalmente via `addHook('preHandler', authMiddleware)`.
     */
    user: AuthUser
  }
}
