import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '@repo/db'

/**
 * GIF transparente 1×1 px codificado em base64.
 * Retornado ao cliente sem cachear para garantir o disparo do rastreamento.
 */
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

/**
 * Ordem de progressão de status — nunca regredir.
 * 'respondido' fica acima de 'lido' pois é estado final de interação.
 */
const ORDEM_STATUS = ['pendente', 'enviado', 'entregue', 'lido', 'respondido', 'falhou']

export async function trackRoutes(app: FastifyInstance) {
  /**
   * GET /track/open/:disparoId
   *
   * Endpoint público chamado automaticamente pelo cliente de e-mail ao exibir a mensagem.
   * Atualiza o Disparo para status "lido" e retorna um pixel transparente 1×1.
   * Sem autenticação — identificação é feita pelo disparoId na URL.
   */
  app.get(
    '/track/open/:disparoId',
    async (
      request: FastifyRequest<{ Params: { disparoId: string } }>,
      reply: FastifyReply
    ) => {
      const { disparoId } = request.params

      // Processar assincronamente sem bloquear a resposta (o cliente não espera)
      setImmediate(async () => {
        try {
          const disparo = await db.disparo.findUnique({ where: { id: disparoId } })
          if (!disparo) return

          const indexAtual = ORDEM_STATUS.indexOf(disparo.status)
          const indexLido = ORDEM_STATUS.indexOf('lido')

          // Só avança para 'lido' se o status atual estiver antes
          if (indexAtual >= indexLido) return

          await db.disparo.update({
            where: { id: disparoId },
            data: { status: 'lido', lidoAt: new Date() },
          })

          app.log.debug({ disparoId }, '[track] e-mail aberto → status lido')
        } catch (err) {
          app.log.error({ err, disparoId }, '[track] erro ao atualizar status')
        }
      })

      // Resposta imediata com o pixel — sem cache para garantir novo disparo a cada abertura
      return reply
        .header('Content-Type', 'image/gif')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .send(PIXEL_GIF)
    }
  )
}
