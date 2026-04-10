import { Worker, Queue } from 'bullmq'
import { redisConnection } from '../modules/disparos/queue'
import { recalcularTodosOsScores } from '../modules/score/score.service'

const TZ_BRASILIA = 'America/Sao_Paulo'

const scoreQueue = new Queue('score-recalculo', {
  connection: redisConnection,
  defaultJobOptions: { removeOnComplete: 10, removeOnFail: 10 },
})

export async function iniciarScoreJob(): Promise<void> {
  const anteriores = await scoreQueue.getRepeatableJobs()
  for (const job of anteriores) {
    await scoreQueue.removeRepeatableByKey(job.key)
  }

  // Cron às 07:00 BRT
  await scoreQueue.add('recalcular-scores', {}, {
    repeat: { pattern: '0 7 * * *', tz: TZ_BRASILIA },
  })

  const worker = new Worker(
    'score-recalculo',
    async () => {
      const inicio = Date.now()
      console.info('[score.job] Iniciando recálculo de scores...')
      const resultado = await recalcularTodosOsScores()
      const duracao = ((Date.now() - inicio) / 1000).toFixed(2)
      console.info(
        `[score.job] Concluído em ${duracao}s: ` +
        `${resultado.dividas} dívidas, ${resultado.devedores} devedores`
      )
    },
    { connection: redisConnection, concurrency: 1 }
  )

  worker.on('failed', (_job, err) => console.error('[score.job] Falhou:', err.message))
  console.info('[score.job] Cron registrado: 07:00 horário de Brasília (0 7 * * *)')
}
