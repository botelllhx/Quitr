import { Worker, type Job } from 'bullmq'
import { db } from '@repo/db'
import {
  redisConnection,
  disparosQueue,
  disparosRetryQueue,
  type DisparoJobPayload,
} from './queue'
import { despacharMensagem } from '../../integrations/dispatch'

/**
 * Máximo de tentativas antes de marcar como FALHOU.
 * tentativa=0 → 1ª tentativa
 * tentativa=1 → 2ª (1º retry, delay 15min)
 * tentativa=2 → 3ª (2º retry, delay 1h)
 * tentativa=3 → FALHOU (spec: "tentativa >= 3 → FALHOU")
 */
const MAX_TENTATIVAS = 3

/** Delays de retry indexados por número da tentativa atual: 15min → 1h → 4h */
const RETRY_DELAYS_MS = [
  15 * 60 * 1000,   // tentativa 0 → próximo retry em 15min
  60 * 60 * 1000,   // tentativa 1 → próximo retry em 1h
  4 * 60 * 60 * 1000, // tentativa 2 → próximo retry em 4h
]

async function processarDisparo(job: Job<DisparoJobPayload>): Promise<void> {
  const { disparoId, canal, conteudo, tentativa, devedorId } = job.data

  // 1. Verificar se o disparo ainda existe e não está finalizado
  const disparo = await db.disparo.findUnique({ where: { id: disparoId } })
  if (!disparo) {
    await job.log(`Disparo ${disparoId} não encontrado — ignorando`)
    return
  }
  if (['enviado', 'entregue', 'lido', 'respondido'].includes(disparo.status)) {
    await job.log(`Disparo ${disparoId} já processado (status: ${disparo.status}) — ignorando`)
    return
  }
  if (disparo.status === 'falhou') {
    await job.log(`Disparo ${disparoId} já marcado como falhou — ignorando`)
    return
  }

  // 2. Buscar destinatário pelo canal
  const devedor = await db.devedor.findUnique({ where: { id: devedorId } })
  if (!devedor) throw new Error(`Devedor ${devedorId} não encontrado`)

  // Verificar opt-out (pode ter sido ativado após o enfileiramento)
  if (devedor.optOut) {
    await db.disparo.update({
      where: { id: disparoId },
      data: { status: 'falhou', falhouAt: new Date(), erroMsg: 'Devedor com opt-out ativo' },
    })
    await job.log(`Disparo ${disparoId} cancelado: devedor com opt-out`)
    return
  }

  const destinatario = canal === 'email' ? devedor.email : devedor.telefone
  if (!destinatario) {
    throw new Error(
      `Devedor ${devedorId} sem ${canal === 'email' ? 'e-mail' : 'telefone'} cadastrado`
    )
  }

  // 3. Enviar via integração correta
  try {
    const externalId = await despacharMensagem(canal, destinatario, conteudo, job.data.tenantId, {
      disparoId: job.data.disparoId,
      devedorId: job.data.devedorId,
      dividaId: job.data.dividaId,
    })

    // 4a. Sucesso: atualizar para ENVIADO + salvar externalId
    await db.disparo.update({
      where: { id: disparoId },
      data: {
        status: 'enviado',
        enviadoAt: new Date(),
        tentativas: tentativa + 1,
        externalId: externalId ?? null,
        erroMsg: null,
      },
    })

    await job.log(`Disparo ${disparoId} enviado via ${canal}. externalId: ${externalId ?? 'n/a'}`)
  } catch (err) {
    const erroMsg = err instanceof Error ? err.message : 'Erro desconhecido'

    // 4b. Spec: "tentativa >= 3 → FALHOU" (tentativa é 0-indexed)
    if (tentativa >= MAX_TENTATIVAS) {
      await db.disparo.update({
        where: { id: disparoId },
        data: {
          status: 'falhou',
          falhouAt: new Date(),
          tentativas: tentativa + 1,
          erroMsg,
        },
      })
      await job.log(
        `Disparo ${disparoId} FALHOU definitivamente após ${tentativa + 1} tentativas: ${erroMsg}`
      )
      return
    }

    // 4c. Ainda tem tentativas: enfileirar na 'disparos-retry' com delay
    const delay = RETRY_DELAYS_MS[tentativa] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
    const proximaTentativa = tentativa + 1

    await disparosRetryQueue.add(
      'retry',
      { ...job.data, tentativa: proximaTentativa },
      { delay }
    )

    await db.disparo.update({
      where: { id: disparoId },
      data: { tentativas: proximaTentativa, erroMsg },
    })

    await job.log(
      `Disparo ${disparoId} falhou (tentativa ${proximaTentativa}/${MAX_TENTATIVAS}). ` +
        `Retry em ${delay / 60000}min. Erro: ${erroMsg}`
    )
  }
}

// ─── Worker principal: fila 'disparos' (concorrência 5) ──────────────────────

export const disparosWorker = new Worker<DisparoJobPayload>('disparos', processarDisparo, {
  connection: redisConnection,
  concurrency: 5,
})

disparosWorker.on('completed', (job) => {
  console.info(`[disparos] Job ${job.id} concluído`)
})

disparosWorker.on('failed', (job, err) => {
  console.error(`[disparos] Job ${job?.id} falhou:`, err.message)
})

// ─── Worker de retry: fila 'disparos-retry' ──────────────────────────────────
// Jobs chegam aqui com delay (15min/1h/4h), depois são promovidos para a fila principal

export const disparosRetryWorker = new Worker<DisparoJobPayload>(
  'disparos-retry',
  async (job) => {
    await disparosQueue.add('retry-requeue', job.data)
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
)
