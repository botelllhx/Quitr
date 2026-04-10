/**
 * Billing com Stripe.
 * Requer: pnpm add stripe --filter=api
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Stripe = require('stripe') as typeof import('stripe').default

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
  : null

import { db } from '@repo/db'

// ─── Planos ───────────────────────────────────────────────────────────────────

export const PLANOS = {
  starter: { nome: 'Starter', valor: 29700, devedoresMax: 200 },    // R$297
  pro: { nome: 'Pro', valor: 69700, devedoresMax: 1000 },           // R$697
  business: { nome: 'Business', valor: 149700, devedoresMax: null }, // R$1.497, ilimitado
} as const

export type PlanoId = keyof typeof PLANOS

function assertStripe(): asserts stripe is NonNullable<typeof stripe> {
  if (!stripe) {
    throw Object.assign(
      new Error('STRIPE_SECRET_KEY não configurada'),
      { statusCode: 503, code: 'STRIPE_NOT_CONFIGURED' }
    )
  }
}

// ─── Criar/obter cliente Stripe ───────────────────────────────────────────────

export async function obterOuCriarClienteStripe(tenantId: string): Promise<string> {
  assertStripe()

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true, email: true, nome: true },
  })
  if (!tenant) throw Object.assign(new Error('Tenant não encontrado'), { statusCode: 404 })

  if (tenant.stripeCustomerId) return tenant.stripeCustomerId

  const customer = await stripe.customers.create({
    email: tenant.email || undefined,
    name: tenant.nome || undefined,
    metadata: { tenantId },
  })

  await db.tenant.update({
    where: { id: tenantId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

// ─── Criar checkout de assinatura ────────────────────────────────────────────

export async function criarCheckout(tenantId: string, plano: PlanoId): Promise<{ url: string }> {
  assertStripe()

  const priceId = process.env[`STRIPE_PRICE_${plano.toUpperCase()}`]
  if (!priceId) {
    throw Object.assign(
      new Error(`STRIPE_PRICE_${plano.toUpperCase()} não configurada`),
      { statusCode: 503, code: 'STRIPE_PRICE_NOT_CONFIGURED' }
    )
  }

  const customerId = await obterOuCriarClienteStripe(tenantId)
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/settings/plano?success=true`,
    cancel_url: `${appUrl}/settings/plano?canceled=true`,
    metadata: { tenantId, plano },
  })

  await db.tenant.update({
    where: { id: tenantId },
    data: { stripePriceId: priceId },
  })

  return { url: session.url! }
}

// ─── Portal de autoatendimento ────────────────────────────────────────────────

export async function obterPortalCliente(tenantId: string): Promise<{ url: string }> {
  assertStripe()

  const customerId = await obterOuCriarClienteStripe(tenantId)
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings/plano`,
  })

  return { url: session.url }
}

// ─── Cancelar assinatura ──────────────────────────────────────────────────────

export async function cancelarAssinatura(tenantId: string): Promise<void> {
  assertStripe()

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true },
  })
  if (!tenant?.stripeCustomerId) return

  const subs = await stripe.subscriptions.list({ customer: tenant.stripeCustomerId, limit: 1 })
  const sub = subs.data[0]
  if (sub) {
    await stripe.subscriptions.cancel(sub.id)
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: { assinaturaStatus: 'cancelada' },
  })
}

// ─── Processar eventos de webhook ────────────────────────────────────────────

export async function processarWebhookStripe(
  payload: string | Buffer,
  signature: string
): Promise<void> {
  assertStripe()

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw Object.assign(new Error('STRIPE_WEBHOOK_SECRET não configurada'), { statusCode: 503 })
  }

  let event: import('stripe').Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch {
    throw Object.assign(new Error('Assinatura do webhook inválida'), { statusCode: 400 })
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as import('stripe').Stripe.Subscription
      const tenantId = sub.metadata.tenantId
      if (!tenantId) break

      const status =
        sub.status === 'active' ? 'ativa'
        : sub.status === 'past_due' ? 'inadimplente'
        : sub.status === 'canceled' ? 'cancelada'
        : 'trial'

      await db.tenant.update({
        where: { id: tenantId },
        data: {
          assinaturaStatus: status,
          plano: sub.metadata.plano ?? 'starter',
          stripePriceId: (sub.items.data[0]?.price.id) ?? undefined,
        },
      })
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as import('stripe').Stripe.Subscription
      const tenantId = sub.metadata.tenantId
      if (!tenantId) break
      await db.tenant.update({
        where: { id: tenantId },
        data: { assinaturaStatus: 'cancelada' },
      })
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as import('stripe').Stripe.Invoice
      const customerId = invoice.customer as string
      const tenant = await db.tenant.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      })
      if (tenant) {
        await db.tenant.update({
          where: { id: tenant.id },
          data: { assinaturaStatus: 'ativa' },
        })
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as import('stripe').Stripe.Invoice
      const customerId = invoice.customer as string
      const tenant = await db.tenant.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      })
      if (tenant) {
        await db.tenant.update({
          where: { id: tenant.id },
          data: { assinaturaStatus: 'inadimplente' },
        })
      }
      break
    }
  }
}
