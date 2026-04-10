import { Worker, Queue } from 'bullmq'
import { redisConnection } from '../modules/disparos/queue'
import { verificarAcordosVencidos } from '../modules/acordos/refatoracao.service'

const TZ_BRASILIA = 'America/Sao_Paulo'

const acordoVencidoQueue = new Queue('acordo-vencido', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 10,
  },
})

export async function iniciarAcordoVencidoJob(): Promise<void> {
  // Limpar jobs repetíveis anteriores
  const anteriores = await acordoVencidoQueue.getRepeatableJobs()
  for (const job of anteriores) {
    await acordoVencidoQueue.removeRepeatableByKey(job.key)
  }

  // Registrar cron às 09:00 BRT
  await acordoVencidoQueue.add(
    'verificar-acordos-vencidos',
    {},
    {
      repeat: {
        pattern: '0 9 * * *',
        tz: TZ_BRASILIA,
      },
    }
  )

  const worker = new Worker(
    'acordo-vencido',
    async () => {
      const inicio = Date.now()
      console.info('[acordo-vencido.job] Iniciando verificação de acordos vencidos...')

      const resultado = await verificarAcordosVencidos()

      const duracao = ((Date.now() - inicio) / 1000).toFixed(2)
      console.info(
        `[acordo-vencido.job] Concluído em ${duracao}s: ` +
          `${resultado.processados} processados, ` +
          `${resultado.inadimplentes} inadimplentes, ` +
          `${resultado.erros} erros`
      )
    },
    { connection: redisConnection, concurrency: 1 }
  )

  worker.on('completed', () => console.info('[acordo-vencido.job] Job concluído'))
  worker.on('failed', (_job, err) => console.error('[acordo-vencido.job] Job falhou:', err.message))

  console.info('[acordo-vencido.job] Cron registrado: 09:00 horário de Brasília (0 9 * * *)')
}
