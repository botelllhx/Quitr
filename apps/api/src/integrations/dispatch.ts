import { db } from '@repo/db'
import { formatCurrency, formatDate, calcularDiasOffset } from '@repo/utils'
import { createEvolutionClient } from '../modules/integracoes/integracoes.service'
import { enviarEmail } from './email/resend.client'
import {
  renderCobranca,
  renderAcordo,
  textoParaHtml,
  type CobrancaVars,
  type AcordoVars,
} from './email/templates/engine'
import { sendSmsMessage } from './sms/zenvia.client'

type Canal = 'whatsapp' | 'email' | 'sms'

type DespachoCtx = {
  disparoId?: string
  devedorId?: string
  dividaId?: string
}

const API_URL = process.env.API_URL ?? 'http://localhost:3001'
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'

/**
 * Despacha uma mensagem pelo canal correto.
 * Para e-mail com ctx.disparoId: busca dados do DB e renderiza o template HTML completo.
 * Para WhatsApp: usa a configuração da integração do tenant.
 * Retorna o externalId da mensagem no provedor (se disponível).
 */
export async function despacharMensagem(
  canal: Canal,
  destinatario: string,
  conteudo: string,
  tenantId: string,
  ctx?: DespachoCtx
): Promise<string | undefined> {
  switch (canal) {
    case 'whatsapp': {
      const client = await createEvolutionClient(tenantId)
      const messageId = await client.enviarTexto(destinatario, conteudo)
      return messageId || undefined
    }

    case 'email': {
      if (ctx?.disparoId && ctx.dividaId && ctx.devedorId) {
        const { html, subject, from, unsubscribeUrl } = await prepararEmail(
          ctx.disparoId,
          ctx.dividaId,
          ctx.devedorId,
          tenantId
        )
        const { id } = await enviarEmail(destinatario, subject, html, from, { unsubscribeUrl })
        return id || undefined
      }

      // Fallback: conteúdo texto plano sem template completo
      const { id } = await enviarEmail(
        destinatario,
        'Aviso de cobrança',
        textoParaHtml(conteudo)
      )
      return id || undefined
    }

    case 'sms': {
      const { id } = await sendSmsMessage(destinatario, conteudo)
      return id || undefined
    }
  }
}

// ─── Preparação do e-mail com template ───────────────────────────────────────

async function prepararEmail(
  disparoId: string,
  dividaId: string,
  devedorId: string,
  tenantId: string
): Promise<{ html: string; subject: string; from: string; unsubscribeUrl: string }> {
  const [divida, devedor, tenant, disparo] = await Promise.all([
    db.divida.findUnique({ where: { id: dividaId } }),
    db.devedor.findUnique({ where: { id: devedorId } }),
    db.tenant.findUnique({ where: { id: tenantId } }),
    db.disparo.findUnique({
      where: { id: disparoId },
      include: { etapa: true },
    }),
  ])

  if (!divida || !devedor || !tenant) {
    throw new Error(`Dados incompletos para renderizar e-mail (disparoId=${disparoId})`)
  }

  const diasAtraso = calcularDiasOffset(divida.dataVencimento)
  const empresa = tenant.nome || 'Empresa'
  const pixelUrl = `${API_URL}/track/open/${disparoId}`
  const optOutUrl = `${APP_URL}/optout/${devedor.id}`
  const logoUrl = '' // extensível — adicionar campo logoUrl ao Tenant futuramente

  const linkAcordo = divida.acordoToken
    ? `${APP_URL}/acordo/${divida.acordoToken}`
    : APP_URL

  const from = `${empresa} <cobranca@${process.env.APP_DOMAIN ?? 'quitr.com.br'}>`

  // Usar template de acordo se a etapa tem ação 'gerarAcordo' E existe um acordo real no banco
  const isAcordoEtapa = disparo?.etapa?.acao === 'gerarAcordo'
  const acordo = isAcordoEtapa
    ? await db.acordo.findFirst({ where: { dividaId }, orderBy: { createdAt: 'desc' } })
    : null

  // Só usa o template de acordo se há um acordo com desconto real (valorTotal < valorAtualizado)
  const isAcordo = acordo !== null && acordo.valorTotal < divida.valorAtualizado

  if (isAcordo && acordo) {
    const valorOriginal = formatCurrency(divida.valorOriginal)
    const valorFinalNum = acordo.valorTotal
    const descontoNum = divida.valorAtualizado - valorFinalNum
    const numParcelas = acordo.numeroParcelas
    const valorEntradaNum = acordo.valorEntrada ?? 0
    const valorParcelaNum = numParcelas > 0
      ? Math.ceil((valorFinalNum - valorEntradaNum) / numParcelas)
      : valorFinalNum

    const vars: AcordoVars = {
      nome: devedor.nome,
      empresa,
      logoUrl,
      valor: valorOriginal,
      desconto: formatCurrency(Math.max(0, descontoNum)),
      valorFinal: formatCurrency(valorFinalNum),
      numeroParcelas: String(numParcelas),
      valorEntrada: valorEntradaNum > 0 ? formatCurrency(valorEntradaNum) : '',
      valorParcela: formatCurrency(valorParcelaNum),
      linkAcordo,
      pixelUrl,
      optOutUrl,
      validadeHoras: '72',
    }

    return {
      html: renderAcordo(vars),
      subject: `Proposta exclusiva de acordo — ${empresa}`,
      from,
      unsubscribeUrl: optOutUrl,
    }
  }

  // Template padrão de cobrança
  const vars: CobrancaVars = {
    nome: devedor.nome,
    empresa,
    logoUrl,
    valor: formatCurrency(divida.valorAtualizado),
    vencimento: formatDate(divida.dataVencimento),
    diasAtraso: String(Math.max(0, diasAtraso)),
    linkAcordo,
    pixelUrl,
    optOutUrl,
    telefoneEmpresa: tenant.telefoneEmpresa ?? '',
  }

  return {
    html: renderCobranca(vars),
    subject: `Pendência financeira — ${empresa}`,
    from,
    unsubscribeUrl: optOutUrl,
  }
}
