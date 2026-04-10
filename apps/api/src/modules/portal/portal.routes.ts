import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { buscarDadosPortal, aceitarAcordo } from './portal.service'

const aceitarBodySchema = z.object({
  numeroParcelas: z.number().int().min(1).max(3),
})

export async function portalRoutes(app: FastifyInstance) {
  /**
   * GET /portal/:token
   * Retorna dados do devedor, da dívida e opções de pagamento.
   * Rota pública — sem autenticação.
   */
  app.get<{ Params: { token: string } }>(
    '/portal/:token',
    async (request, reply) => {
      const { token } = request.params

      if (!token || token.length < 1) {
        return reply.status(400).send({
          error: { code: 'TOKEN_REQUIRED', message: 'Token obrigatório.' },
        })
      }

      const dados = await buscarDadosPortal(token)
      if (!dados) {
        return reply.status(404).send({
          error: { code: 'TOKEN_NOT_FOUND', message: 'Link inválido ou expirado.' },
        })
      }

      return reply.send({ data: dados })
    }
  )

  /**
   * POST /portal/:token/aceitar
   * Aceita o acordo e gera as cobranças no Asaas.
   * Rota pública — sem autenticação.
   */
  app.post<{ Params: { token: string } }>(
    '/portal/:token/aceitar',
    async (request, reply) => {
      const { token } = request.params

      const parsed = aceitarBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos',
            details: parsed.error.flatten(),
          },
        })
      }

      const { numeroParcelas } = parsed.data

      try {
        const resultado = await aceitarAcordo(token, { numeroParcelas })
        return reply.status(201).send({ data: resultado })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'

        if (msg === 'TOKEN_INVALIDO') {
          return reply.status(404).send({
            error: { code: 'TOKEN_NOT_FOUND', message: 'Link inválido ou expirado.' },
          })
        }

        if (msg === 'ACORDO_JA_EXISTE') {
          return reply.status(409).send({
            error: { code: 'ACORDO_JA_EXISTE', message: 'Já existe um acordo ativo para esta dívida.' },
          })
        }

        if (msg === 'PARCELAS_INVALIDAS') {
          return reply.status(400).send({
            error: { code: 'PARCELAS_INVALIDAS', message: 'Número de parcelas inválido.' },
          })
        }

        throw err
      }
    }
  )
}
