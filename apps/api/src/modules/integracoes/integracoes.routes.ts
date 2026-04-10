import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../../middlewares/auth.middleware'
import {
  getWhatsAppIntegracao,
  salvarWhatsAppConfig,
  desativarWhatsAppIntegracao,
  createEvolutionClient,
} from './integracoes.service'

const whatsAppConfigSchema = z.object({
  apiUrl: z.string().url('URL inválida'),
  apiKey: z.string().min(1, 'API Key obrigatória'),
  instancia: z.string().min(1, 'Nome da instância obrigatório'),
})

export async function integracoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // GET /integracoes/whatsapp — retorna config atual (sem expor a apiKey completa)
  app.get('/whatsapp', async (request, reply) => {
    const { tenantId } = request.user
    const integracao = await getWhatsAppIntegracao(tenantId)

    if (!integracao) {
      return reply.status(200).send({ data: null })
    }

    const config = integracao.config as { apiUrl: string; apiKey: string; instancia: string }

    return reply.send({
      data: {
        id: integracao.id,
        ativa: integracao.ativa,
        apiUrl: config.apiUrl,
        // Mascarar a chave: mostrar apenas os últimos 4 caracteres
        apiKey: `${'*'.repeat(Math.max(0, config.apiKey.length - 4))}${config.apiKey.slice(-4)}`,
        instancia: config.instancia,
      },
    })
  })

  // PUT /integracoes/whatsapp — salva ou atualiza config
  app.put('/whatsapp', async (request, reply) => {
    const { tenantId } = request.user

    const parsed = whatsAppConfigSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: parsed.error.flatten(),
        },
      })
    }

    const integracao = await salvarWhatsAppConfig(tenantId, parsed.data)
    return reply.send({ data: { id: integracao.id, ativa: integracao.ativa } })
  })

  // DELETE /integracoes/whatsapp — desativa a integração
  app.delete('/whatsapp', async (request, reply) => {
    const { tenantId } = request.user
    await desativarWhatsAppIntegracao(tenantId)
    return reply.status(204).send()
  })

  // GET /integracoes/whatsapp/testar — testa a conexão com a instância
  app.get('/whatsapp/testar', async (request, reply) => {
    const { tenantId } = request.user

    try {
      const client = await createEvolutionClient(tenantId)
      const status = await client.obterStatus()

      return reply.send({
        data: {
          connected: status.connected,
          state: status.state,
        },
      })
    } catch (err) {
      return reply.status(502).send({
        error: {
          code: 'INTEGRATION_ERROR',
          message: err instanceof Error ? err.message : 'Erro ao conectar com Evolution API',
        },
      })
    }
  })
}
