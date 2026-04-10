import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

// ─── Conexão Redis compartilhada ──────────────────────────────────────────────

export const redisConnection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // obrigatório para BullMQ
  enableReadyCheck: false,
})

redisConnection.on('error', (err) => {
  console.error('[Redis] Erro de conexão:', err.message)
})

// ─── Shape do job de disparo ──────────────────────────────────────────────────

export type DisparoJobPayload = {
  disparoId: string
  tenantId: string
  devedorId: string
  dividaId: string
  canal: 'whatsapp' | 'email' | 'sms'
  conteudo: string
  tentativa: number
}

// ─── Filas ────────────────────────────────────────────────────────────────────

/**
 * Fila principal de envio de mensagens.
 * Concorrência: 5 workers simultâneos.
 */
export const disparosQueue = new Queue<DisparoJobPayload>('disparos', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 }, // manter os 1000 últimos jobs completos
    removeOnFail: { count: 500 },
  },
})

/**
 * Fila de retentativas com delay exponencial.
 * Alimentada pelo worker quando um job falha mas ainda tem tentativas restantes.
 */
export const disparosRetryQueue = new Queue<DisparoJobPayload>('disparos-retry', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
  },
})

/**
 * Fila para o job diário da régua (cron interno).
 */
export const reguaQueue = new Queue('regua-diaria', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 10,
  },
})
