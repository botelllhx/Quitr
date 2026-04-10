import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '@repo/db'

// ─── Tipos do payload da Evolution API ───────────────────────────────────────

type MessageKey = {
  remoteJid: string
  fromMe: boolean
  id: string
}

type MessageContent = {
  conversation?: string
  extendedTextMessage?: { text?: string }
  imageMessage?: { caption?: string }
}

type MessagesUpsertData = {
  key: MessageKey
  pushName?: string
  message?: MessageContent
  messageTimestamp?: number
}

type MessageUpdateData = {
  key: MessageKey
  update: {
    status?: string // DELIVERY_ACK | READ | PLAYED
  }
}

type EvolutionWebhookPayload = {
  event: string
  instance: string
  data: MessagesUpsertData | MessageUpdateData | unknown
}

// ─── Mapa de status da Evolution para nosso enum ─────────────────────────────

const evolutionStatusMap: Record<string, string> = {
  DELIVERY_ACK: 'entregue',
  READ: 'lido',
  PLAYED: 'lido', // mensagem de voz ouvida
}

// ─── Extrai texto da mensagem ─────────────────────────────────────────────────

function extrairTexto(msg?: MessageContent): string {
  if (!msg) return ''
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    ''
  )
}

// ─── Normaliza telefone do JID para formato E.164 ─────────────────────────────

function jidParaTelefone(jid: string): string {
  // JID formato: 5511999999999@s.whatsapp.net ou 5511999999999@g.us (grupo)
  return jid.replace(/@.+$/, '')
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function whatsappWebhookPlugin(fastify: FastifyInstance) {
  fastify.post(
    '/webhooks/whatsapp/:tenantId',
    async (
      request: FastifyRequest<{ Params: { tenantId: string }; Body: EvolutionWebhookPayload }>,
      reply: FastifyReply
    ) => {
      const { tenantId } = request.params
      const payload = request.body

      fastify.log.debug({ event: payload.event, tenantId }, '[whatsapp-webhook] recebido')

      try {
        switch (payload.event) {
          case 'messages.upsert':
            await handleMessagesUpsert(tenantId, payload.data as MessagesUpsertData, fastify)
            break

          case 'messages.update':
            await handleMessageUpdate(tenantId, payload.data as MessageUpdateData, fastify)
            break

          default:
            fastify.log.debug({ event: payload.event }, '[whatsapp-webhook] evento ignorado')
        }
      } catch (err) {
        fastify.log.error({ err, event: payload.event }, '[whatsapp-webhook] erro ao processar')
        // Sempre retorna 200 para o Evolution não retentar
      }

      return reply.status(200).send({ received: true })
    }
  )
}

// ─── Handler: mensagem recebida do devedor ────────────────────────────────────

async function handleMessagesUpsert(
  tenantId: string,
  data: MessagesUpsertData,
  fastify: FastifyInstance
) {
  // Ignorar mensagens enviadas por nós (fromMe = true)
  if (data.key.fromMe) return

  // Ignorar mensagens de grupos
  if (data.key.remoteJid.includes('@g.us')) return

  const telefone = jidParaTelefone(data.key.remoteJid)
  const texto = extrairTexto(data.message)

  if (!texto) return

  // Buscar devedor pelo telefone no tenant
  const devedor = await db.devedor.findFirst({
    where: { tenantId, telefone, deletedAt: null },
  })

  if (!devedor) {
    fastify.log.debug({ telefone, tenantId }, '[whatsapp-webhook] devedor não encontrado')
    return
  }

  // Buscar o último disparo enviado para este devedor (para marcar como respondido)
  const ultimoDisparo = await db.disparo.findFirst({
    where: {
      tenantId,
      divida: { devedorId: devedor.id },
      canal: 'whatsapp',
      status: { in: ['enviado', 'entregue', 'lido'] },
    },
    orderBy: { enviadoAt: 'desc' },
  })

  // Determinar a dividaId para registrar a resposta
  const dividaId = ultimoDisparo?.dividaId ?? (await getPrimeiraDividaAbertaOuNull(devedor.id, tenantId))

  // Registrar a resposta como disparo de entrada (canal whatsapp, sem etapa)
  // Só criamos o registro se houver uma dívida associável
  if (dividaId) {
    await db.disparo.create({
      data: {
        tenantId,
        dividaId,
        canal: 'whatsapp',
        conteudo: texto,
        status: 'respondido',
        tentativas: 0,
        externalId: data.key.id,
        // enviadoAt é null: esta mensagem foi recebida, não enviada por nós
        respondidoAt: data.messageTimestamp
          ? new Date(data.messageTimestamp * 1000)
          : new Date(),
      },
    })
  }

  // Marcar o último disparo enviado como respondido
  if (ultimoDisparo) {
    await db.disparo.update({
      where: { id: ultimoDisparo.id },
      data: { status: 'respondido', respondidoAt: new Date() },
    })
  }

  // Atualizar perfil comportamental do devedor para 'negociador' (mesmo sem dívida associável)
  await db.devedor.update({
    where: { id: devedor.id },
    data: { perfil: 'negociador' },
  })

  fastify.log.info(
    { devedorId: devedor.id, telefone },
    '[whatsapp-webhook] resposta registrada, perfil → negociador'
  )
}

// ─── Handler: atualização de status de mensagem enviada ─────────────────────

async function handleMessageUpdate(
  tenantId: string,
  data: MessageUpdateData,
  fastify: FastifyInstance
) {
  // Só nos interessa atualizar status de mensagens enviadas por nós
  if (!data.key.fromMe) return

  const newStatus = data.update?.status
  if (!newStatus) return

  const novoStatus = evolutionStatusMap[newStatus]
  if (!novoStatus) return

  // Buscar disparo pelo externalId
  const disparo = await db.disparo.findFirst({
    where: { tenantId, externalId: data.key.id },
  })

  if (!disparo) {
    fastify.log.debug({ externalId: data.key.id }, '[whatsapp-webhook] disparo não encontrado')
    return
  }

  // Não regredir status (enviado → entregue → lido)
  const ordem = ['pendente', 'enviado', 'entregue', 'lido', 'respondido']
  const indexAtual = ordem.indexOf(disparo.status)
  const indexNovo = ordem.indexOf(novoStatus)
  if (indexNovo <= indexAtual) return

  await db.disparo.update({
    where: { id: disparo.id },
    data: {
      status: novoStatus as 'entregue' | 'lido',
      entregueAt: novoStatus === 'entregue' ? new Date() : disparo.entregueAt,
      lidoAt: novoStatus === 'lido' ? new Date() : disparo.lidoAt,
    },
  })

  fastify.log.info(
    { disparoId: disparo.id, status: novoStatus },
    '[whatsapp-webhook] status atualizado'
  )
}

// ─── Utilitário ───────────────────────────────────────────────────────────────

async function getPrimeiraDividaAbertaOuNull(
  devedorId: string,
  tenantId: string
): Promise<string | null> {
  const divida = await db.divida.findFirst({
    where: {
      devedorId,
      tenantId,
      status: { in: ['em_aberto', 'em_negociacao'] },
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  })
  return divida?.id ?? null
}
