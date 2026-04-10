import 'dotenv/config'
import { buildApp } from './app'

const app = buildApp()

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
  app.log.info(`API rodando em ${address}`)
})
