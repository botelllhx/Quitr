import 'dotenv/config'
import { buildApp } from './app'

// ─── Workers BullMQ (iniciam automaticamente ao importar) ─────────────────────
import './modules/disparos/worker'

// ─── Job cron da régua ────────────────────────────────────────────────────────
import { iniciarReguaJob } from './jobs/regua.job'
import { iniciarAcordoVencidoJob } from './jobs/acordo-vencido.job'
import { iniciarScoreJob } from './jobs/score.job'
import { iniciarComissaoFechamentoJob } from './jobs/comissao-fechamento.job'

const app = buildApp()

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

app
  .listen({ port: PORT, host: HOST })
  .then(async (address) => {
    app.log.info(`API rodando em ${address}`)
    try {
      await iniciarReguaJob()
    } catch (e) {
      app.log.error({ err: e }, '[regua.job] Falha ao registrar cron — verifique REDIS_URL')
    }
    try {
      await iniciarAcordoVencidoJob()
    } catch (e) {
      app.log.error({ err: e }, '[acordo-vencido.job] Falha ao registrar cron — verifique REDIS_URL')
    }
    try {
      await iniciarScoreJob()
    } catch (e) {
      app.log.error({ err: e }, '[score.job] Falha ao registrar cron — verifique REDIS_URL')
    }
    try {
      await iniciarComissaoFechamentoJob()
    } catch (e) {
      app.log.error({ err: e }, '[comissao.job] Falha ao registrar cron — verifique REDIS_URL')
    }
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
