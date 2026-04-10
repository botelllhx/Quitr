/**
 * Webhook Autentique — recebe eventos de assinatura de documentos.
 *
 * Autentique envia POST para a URL configurada com o evento e o ID do documento.
 * Evento principal: document.signed — todos os signatários assinaram.
 *
 * Ref: https://docs.autentique.com.br/api/webhooks
 */

import type { FastifyInstance } from 'fastify'
import { db } from '@repo/db'
import { buscarDocumento } from '../../integrations/assinatura/autentique.client'
import { despacharMensagem } from '../../integrations/dispatch'

type AutentiqueWebhookPayload = {
  event: string              // ex: 'document.signed', 'document.viewed'
  document: {
    id: string
    name: string
  }
  author?: {
    email: string
    name: string
  }
}

export async function autentiqueWebhookPlugin(app: FastifyInstance) {
  app.post('/webhooks/autentique', async (request, reply) => {
    const payload = request.body as AutentiqueWebhookPayload

    if (!payload?.event || !payload?.document?.id) {
      return reply.status(400).send({ error: 'Payload inválido' })
    }

    try {
      if (payload.event === 'document.signed') {
        await processarDocumentoAssinado(payload.document.id, app)
      }
    } catch (err) {
      // Retorna 200 para o Autentique não reenviar indefinidamente
      app.log.error({ err, event: payload.event }, '[autentique.webhook] Erro ao processar evento')
    }

    return reply.status(200).send({ ok: true })
  })
}

// ─── Documento assinado ───────────────────────────────────────────────────────

async function processarDocumentoAssinado(autentiqueId: string, app: FastifyInstance) {
  // Buscar acordo pelo autentiqueId (campo documentoUrl usamos para armazenar o autentiqueId)
  const acordo = await db.acordo.findFirst({
    where: { documentoUrl: autentiqueId },
    include: {
      divida: {
        include: { devedor: true },
      },
    },
  })

  if (!acordo) {
    app.log.warn(`[autentique.webhook] Acordo não encontrado para documento ${autentiqueId}`)
    return
  }

  // Buscar URL do PDF assinado no Autentique
  let documentoUrl = autentiqueId
  try {
    const doc = await buscarDocumento(autentiqueId)
    if (doc.documentoUrl) {
      documentoUrl = doc.documentoUrl
    }
  } catch {
    // Se não conseguir buscar o PDF, mantém o ID como referência
    app.log.warn(`[autentique.webhook] Não foi possível buscar PDF do documento ${autentiqueId}`)
  }

  // Atualizar Acordo: status → assinado + URL do documento assinado
  await db.acordo.update({
    where: { id: acordo.id },
    data: {
      status: 'assinado',
      assinadoAt: new Date(),
      documentoUrl,
    },
  })

  // Notificar devedor que o acordo foi assinado
  const devedor = acordo.divida.devedor
  if (!devedor.optOut) {
    const mensagem =
      `Olá, ${devedor.nome}! Seu acordo foi assinado com sucesso. ` +
      `Agora é só efetuar o pagamento nas datas combinadas. Qualquer dúvida, entre em contato.`

    try {
      if (devedor.telefone) {
        await despacharMensagem('whatsapp', devedor.telefone, mensagem, acordo.tenantId)
      } else if (devedor.email) {
        await despacharMensagem('email', devedor.email, mensagem, acordo.tenantId)
      }
    } catch {
      app.log.warn(`[autentique.webhook] Falha ao notificar devedor ${devedor.id}`)
    }
  }
}
