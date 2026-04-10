import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Webhook } from 'svix'
import { db } from '@repo/db'

// ─── Tipos dos eventos Clerk ──────────────────────────────────────────────────

type ClerkOrganizationCreatedEvent = {
  type: 'organization.created'
  data: {
    id: string
    name: string
    slug: string
    created_by: string // userId do criador
  }
}

type ClerkUserCreatedEvent = {
  type: 'user.created'
  data: {
    id: string
    email_addresses: Array<{ email_address: string; id: string }>
    first_name: string | null
    last_name: string | null
    primary_email_address_id: string
  }
}

type ClerkOrgMembershipCreatedEvent = {
  type: 'organizationMembership.created'
  data: {
    id: string
    role: string
    organization: { id: string; name: string }
    public_user_data: { user_id: string }
  }
}

type ClerkWebhookEvent =
  | ClerkOrganizationCreatedEvent
  | ClerkUserCreatedEvent
  | ClerkOrgMembershipCreatedEvent
  | { type: string; data: unknown }

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function clerkWebhookPlugin(fastify: FastifyInstance) {
  /**
   * Sobrescreve o parser JSON apenas neste escopo para capturar o rawBody
   * como string — necessário para a verificação de assinatura do svix.
   */
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, payload, done) => {
      const raw = payload as string
      try {
        const parsed = JSON.parse(raw) as unknown
        done(null, { _raw: raw, ...((parsed as object) ?? {}) })
      } catch {
        done(new Error('JSON inválido'))
      }
    }
  )

  fastify.post(
    '/webhooks/clerk',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const secret = process.env.CLERK_WEBHOOK_SECRET
      if (!secret) {
        fastify.log.error('CLERK_WEBHOOK_SECRET não configurado')
        return reply.status(500).send({ error: { code: 'CONFIG_ERROR', message: 'Webhook não configurado' } })
      }

      // ── Verificação de assinatura (svix) ────────────────────────────────────
      const svixId = request.headers['svix-id'] as string | undefined
      const svixTimestamp = request.headers['svix-timestamp'] as string | undefined
      const svixSignature = request.headers['svix-signature'] as string | undefined

      if (!svixId || !svixTimestamp || !svixSignature) {
        return reply.status(400).send({
          error: { code: 'MISSING_HEADERS', message: 'Headers svix ausentes' },
        })
      }

      const body = request.body as { _raw: string } & Record<string, unknown>
      const rawBody = body._raw

      let event: ClerkWebhookEvent
      try {
        const wh = new Webhook(secret)
        event = wh.verify(rawBody, {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        }) as ClerkWebhookEvent
      } catch (err) {
        fastify.log.warn({ err }, 'Assinatura do webhook Clerk inválida')
        return reply.status(400).send({
          error: { code: 'INVALID_SIGNATURE', message: 'Assinatura inválida' },
        })
      }

      fastify.log.info({ type: event.type }, 'Webhook Clerk recebido')

      // ── Handlers por tipo de evento ─────────────────────────────────────────
      try {
        switch (event.type) {
          case 'organization.created':
            await handleOrganizationCreated(event as ClerkOrganizationCreatedEvent)
            break

          case 'user.created':
            await handleUserCreated(event as ClerkUserCreatedEvent)
            break

          case 'organizationMembership.created':
            await handleMembershipCreated(event as ClerkOrgMembershipCreatedEvent)
            break

          default:
            fastify.log.debug({ type: event.type }, 'Evento Clerk ignorado')
        }
      } catch (err) {
        fastify.log.error({ err, type: event.type }, 'Erro ao processar webhook Clerk')
        return reply.status(500).send({
          error: { code: 'PROCESSING_ERROR', message: 'Erro interno ao processar evento' },
        })
      }

      return reply.status(200).send({ received: true })
    }
  )
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * organization.created → cria o Tenant no banco.
 * O clerkOrgId é a chave de correlação entre Clerk e nossa base.
 */
async function handleOrganizationCreated(event: ClerkOrganizationCreatedEvent) {
  const { id: clerkOrgId, name } = event.data

  const existing = await db.tenant.findUnique({ where: { clerkOrgId } })
  if (existing) return // idempotente

  await db.tenant.create({
    data: {
      clerkOrgId,
      nome: name,
      email: '', // será atualizado via settings do tenant
      plano: 'trial',
      ativo: true,
    },
  })
}

/**
 * user.created → registra o e-mail principal do usuário no metadata do Clerk.
 * Como não temos modelo User no banco (auth é 100% Clerk), apenas logamos.
 * Quando o usuário entrar em uma organização, handleMembershipCreated sincroniza.
 */
async function handleUserCreated(event: ClerkUserCreatedEvent) {
  const { id, email_addresses, first_name, last_name, primary_email_address_id } = event.data
  const primaryEmail = email_addresses.find((e) => e.id === primary_email_address_id)

  // Ponto de extensão: se no futuro houver modelo User, criá-lo aqui.
  // Por ora apenas logamos para auditoria.
  console.info('[clerk-webhook] user.created', {
    userId: id,
    email: primaryEmail?.email_address,
    nome: [first_name, last_name].filter(Boolean).join(' '),
  })
}

/**
 * organizationMembership.created → associa o usuário ao Tenant existente.
 * Se o Tenant ainda não foi criado (race condition), cria um placeholder.
 */
async function handleMembershipCreated(event: ClerkOrgMembershipCreatedEvent) {
  const { organization, public_user_data, role } = event.data
  const { id: clerkOrgId, name } = organization
  const isAdmin = role === 'org:admin'

  // Garante que o tenant existe
  const tenant = await db.tenant.upsert({
    where: { clerkOrgId },
    update: {},
    create: {
      clerkOrgId,
      nome: name,
      email: '',
      plano: 'trial',
      ativo: true,
    },
  })

  console.info('[clerk-webhook] organizationMembership.created', {
    tenantId: tenant.id,
    userId: public_user_data.user_id,
    role,
    isAdmin,
  })
}
