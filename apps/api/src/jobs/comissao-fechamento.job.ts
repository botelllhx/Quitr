import { Worker, Queue } from 'bullmq'
import { redisConnection } from '../modules/disparos/queue'
import { db } from '@repo/db'
import { fecharComissaoMensal } from '../modules/comissao/comissao.service'

const TZ_BRASILIA = 'America/Sao_Paulo'

const comissaoQueue = new Queue('comissao-fechamento', {
  connection: redisConnection,
  defaultJobOptions: { removeOnComplete: 10, removeOnFail: 10 },
})

export async function iniciarComissaoFechamentoJob(): Promise<void> {
  const anteriores = await comissaoQueue.getRepeatableJobs()
  for (const job of anteriores) {
    await comissaoQueue.removeRepeatableByKey(job.key)
  }

  // Cron às 06:00 BRT dia 1 de cada mês
  await comissaoQueue.add('fechar-comissao', {}, {
    repeat: { pattern: '0 6 1 * *', tz: TZ_BRASILIA },
  })

  const worker = new Worker(
    'comissao-fechamento',
    async () => {
      // Fecha o mês anterior (o cron roda no dia 1 do mês atual)
      const agora = new Date()
      const mesAnterior = agora.getMonth() === 0 ? 12 : agora.getMonth()
      const anoRef = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear()

      console.info(`[comissao.job] Fechando comissão ${mesAnterior}/${anoRef}...`)

      // Busca todos os tenants ativos
      const tenants = await db.tenant.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
      })

      let fechados = 0
      for (const tenant of tenants) {
        try {
          await fecharComissaoMensal(tenant.id, mesAnterior, anoRef)
          fechados++
        } catch (err) {
          console.error(`[comissao.job] Falha tenant ${tenant.id}:`, err)
        }
      }

      console.info(`[comissao.job] Fechamento concluído: ${fechados}/${tenants.length} tenants`)
    },
    { connection: redisConnection, concurrency: 1 }
  )

  worker.on('failed', (_job, err) => console.error('[comissao.job] Falhou:', err.message))
  console.info('[comissao.job] Cron registrado: 06:00 BRT dia 1 de cada mês (0 6 1 * *)')
}
