/**
 * Webhook Asaas — recebe confirmações de pagamento e vencimentos.
 *
 * Segurança: Asaas envia o header "asaas-access-token" com o token configurado no
 * painel (ASAAS_WEBHOOK_SECRET). Rejeitamos qualquer request sem esse header válido.
 *
 * Ref: https://docs.asaas.com/docs/notificacoes-de-eventos
 */

import type { FastifyInstance } from 'fastify'
import { db } from '@repo/db'
import { despacharMensagem } from '../../integrations/dispatch'
import { verificarAcordosVencidos } from '../acordos/refatoracao.service'

type AsaasEventPayment = {
  id: string           // ID da cobrança no Asaas
  status: string
  customer: string
  value: number
  paymentDate?: string
  billingType: string
}

type AsaasWebhookPayload = {
  event: string        // ex: 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE'
  payment: AsaasEventPayment
}

export async function asaasWebhookPlugin(app: FastifyInstance) {
  app.post('/webhooks/asaas', async (request, reply) => {
    // ── Validação do token ────────────────────────────────────────────────────
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET
    const tokenHeader = (request.headers['asaas-access-token'] as string | undefined)?.trim()

    if (webhookSecret && tokenHeader !== webhookSecret) {
      return reply.status(401).send({ error: 'Token inválido' })
    }

    const payload = request.body as AsaasWebhookPayload
    const { event, payment } = payload

    if (!event || !payment?.id) {
      return reply.status(400).send({ error: 'Payload inválido' })
    }

    try {
      if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
        await processarPagamentoConfirmado(payment)
      } else if (event === 'PAYMENT_OVERDUE') {
        await processarPagamentoVencido(payment)
      }
      // Outros eventos ignorados silenciosamente
    } catch (err) {
      // Loga mas retorna 200 para o Asaas não reenviar indefinidamente
      app.log.error({ err, event, asaasId: payment?.id }, '[asaas.webhook] Erro ao processar evento')
    }

    return reply.status(200).send({ ok: true })
  })
}

// ─── Pagamento confirmado ─────────────────────────────────────────────────────

async function processarPagamentoConfirmado(payment: AsaasEventPayment) {
  // Buscar cobrança pelo ID do Asaas
  const cobranca = await db.cobranca.findUnique({
    where: { asaasId: payment.id },
    include: {
      parcela: true,
      acordo: {
        include: {
          parcelas: true,
          divida: {
            include: { devedor: true },
          },
        },
      },
    },
  })

  if (!cobranca) {
    console.warn(`[asaas.webhook] Cobrança não encontrada: ${payment.id}`)
    return
  }

  const { acordo } = cobranca

  // ── 1. Atualizar cobrança e parcela como pagas ─────────────────────────────
  const pagoEm = payment.paymentDate ? new Date(payment.paymentDate) : new Date()

  await db.$transaction([
    db.cobranca.update({
      where: { id: cobranca.id },
      data: { status: 'confirmed', pagoEm },
    }),
    ...(cobranca.parcela
      ? [
          db.parcela.update({
            where: { id: cobranca.parcela.id },
            data: { status: 'paga', pagoEm },
          }),
        ]
      : []),
  ])

  // ── 2. Verificar se todas as parcelas estão pagas ─────────────────────────
  const parcelasAtualizadas = await db.parcela.findMany({
    where: { acordoId: acordo.id },
  })

  // A parcela já foi atualizada para 'paga' na transação acima — recarregamos todas
  const todasPagas = parcelasAtualizadas.every((p) => p.status === 'paga')

  if (todasPagas) {
    await db.$transaction([
      db.acordo.update({
        where: { id: acordo.id },
        data: { status: 'quitado' },
      }),
      db.divida.update({
        where: { id: acordo.dividaId },
        data: { status: 'quitada' },
      }),
    ])

    // Atualizar perfil do devedor → pagador (cumpriu o acordo)
    await db.devedor.update({
      where: { id: acordo.divida.devedor.id },
      data: { perfil: 'pagador' },
    })
  }

  // ── 3. Notificar devedor ──────────────────────────────────────────────────
  const devedor = acordo.divida.devedor
  if (!devedor.optOut) {
    const parcelaNumero = cobranca.parcela?.numero ?? 1
    const totalParcelas = acordo.numeroParcelas

    const mensagem = todasPagas
      ? `Olá, ${devedor.nome}! Seu acordo foi quitado com sucesso. Parabéns! 🎉`
      : `Olá, ${devedor.nome}! Recebemos o pagamento da parcela ${parcelaNumero}/${totalParcelas}. Obrigado!`

    try {
      if (devedor.telefone) {
        await despacharMensagem('whatsapp', devedor.telefone, mensagem, acordo.tenantId)
      } else if (devedor.email) {
        await despacharMensagem('email', devedor.email, mensagem, acordo.tenantId)
      }
    } catch {
      // Falha na notificação não deve afetar o processamento
      console.warn(`[asaas.webhook] Falha ao notificar devedor ${devedor.id}`)
    }
  }
}

// ─── Pagamento vencido ────────────────────────────────────────────────────────

async function processarPagamentoVencido(payment: AsaasEventPayment) {
  const cobranca = await db.cobranca.findUnique({
    where: { asaasId: payment.id },
    include: { parcela: true },
  })

  if (!cobranca) return

  // Marcar a cobrança e a parcela como vencidas
  await db.$transaction([
    db.cobranca.update({
      where: { id: cobranca.id },
      data: { status: 'overdue' },
    }),
    ...(cobranca.parcela
      ? [
          db.parcela.update({
            where: { id: cobranca.parcela.id },
            data: { status: 'vencida' },
          }),
        ]
      : []),
  ])

  // O job diário (acordo-vencido.job) cuida de marcar o Acordo como INADIMPLENTE
  // após a tolerância configurada. Para tolerância zero, acionamos imediatamente.
  if (cobranca.parcela) {
    const acordo = await db.acordo.findUnique({
      where: { id: cobranca.parcela.acordoId },
      select: { tenantId: true },
    })
    const tenant = acordo
      ? await db.tenant.findUnique({ where: { id: acordo.tenantId }, select: { diasToleranciaQuebraAcordo: true } })
      : null

    if (tenant?.diasToleranciaQuebraAcordo === 0) {
      await verificarAcordosVencidos()
    }
  }
}
