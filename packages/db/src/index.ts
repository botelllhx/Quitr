import { PrismaClient, Prisma } from '@prisma/client'

// ─── Base client ─────────────────────────────────────────────────────────────

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, 'error', 'warn']
        : ['error'],
  })
}

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Injeta `deletedAt: null` no where apenas se o campo não foi explicitamente informado.
 * Usa cast via `unknown` porque os tipos do Prisma (DateTimeNullableFilter, etc.)
 * não são compatíveis com constraints genéricas sob `exactOptionalPropertyTypes`.
 */
function withoutDeleted<T>(args: T): T {
  const a = args as unknown as { where?: Record<string, unknown> }
  if (a.where === undefined || !('deletedAt' in a.where)) {
    const next = { ...(args as object), where: { ...(a.where ?? {}), deletedAt: null } }
    return next as T
  }
  return args
}

// ─── Soft delete extension ────────────────────────────────────────────────────
// Devedor e Divida possuem `deletedAt`. Esta extensão:
//   - Filtra registros deletados automaticamente em leituras
//   - Expõe métodos `.softDelete()`, `.softDeleteMany()`, `.restore()` nos models

const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',

  query: {
    devedor: {
      findMany({ args, query }) {
        return query(withoutDeleted(args) as typeof args)
      },
      findFirst({ args, query }) {
        return query(withoutDeleted(args) as typeof args)
      },
      findFirstOrThrow({ args, query }) {
        return query(withoutDeleted(args) as typeof args)
      },
      count({ args, query }) {
        return query(withoutDeleted(args) as typeof args)
      },
    },
    divida: {
      findMany({ args, query }) {
        return query(withoutDeleted(args) as typeof args)
      },
      findFirst({ args, query }) {
        return query(withoutDeleted(args) as typeof args)
      },
      findFirstOrThrow({ args, query }) {
        return query(withoutDeleted(args) as typeof args)
      },
      count({ args, query }) {
        return query(withoutDeleted(args) as typeof args)
      },
    },
  },

  model: {
    devedor: {
      /**
       * Soft delete: marca `deletedAt` ao invés de remover do banco.
       * Para exclusão permanente use `db.$queryRaw` ou remova a extensão no contexto.
       */
      async softDelete(id: string) {
        const ctx = Prisma.getExtensionContext(this)
        const client = ctx as unknown as PrismaClient['devedor']
        return client.update({ where: { id }, data: { deletedAt: new Date() } })
      },

      async softDeleteMany(where: Prisma.DevedorWhereInput) {
        const ctx = Prisma.getExtensionContext(this)
        const client = ctx as unknown as PrismaClient['devedor']
        return client.updateMany({ where, data: { deletedAt: new Date() } })
      },

      /** Restaura um devedor soft-deletado. */
      async restore(id: string) {
        const ctx = Prisma.getExtensionContext(this)
        const client = ctx as unknown as PrismaClient['devedor']
        return client.update({ where: { id }, data: { deletedAt: null } })
      },
    },

    divida: {
      async softDelete(id: string) {
        const ctx = Prisma.getExtensionContext(this)
        const client = ctx as unknown as PrismaClient['divida']
        return client.update({ where: { id }, data: { deletedAt: new Date() } })
      },

      async softDeleteMany(where: Prisma.DividaWhereInput) {
        const ctx = Prisma.getExtensionContext(this)
        const client = ctx as unknown as PrismaClient['divida']
        return client.updateMany({ where, data: { deletedAt: new Date() } })
      },

      async restore(id: string) {
        const ctx = Prisma.getExtensionContext(this)
        const client = ctx as unknown as PrismaClient['divida']
        return client.update({ where: { id }, data: { deletedAt: null } })
      },
    },
  },
})

// ─── Singleton ────────────────────────────────────────────────────────────────

type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>

function createExtendedClient() {
  return createPrismaClient().$extends(softDeleteExtension)
}

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? createExtendedClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export * from '@prisma/client'
export type { ExtendedPrismaClient }
