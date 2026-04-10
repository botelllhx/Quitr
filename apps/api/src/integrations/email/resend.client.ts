/**
 * Cliente Resend (e-mail transacional).
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

type ResendPayload = {
  from: string
  to: string[]
  subject: string
  html: string
  headers?: Record<string, string>
}

type ResendResponse = { id?: string; error?: { message?: string } }

/**
 * Envia um e-mail via Resend.
 *
 * @param to          E-mail do destinatário
 * @param subject     Assunto da mensagem
 * @param html        Corpo em HTML (já renderizado)
 * @param from        Remetente — padrão: "Financeiro <cobranca@{APP_DOMAIN}>"
 * @param options.unsubscribeUrl  URL para o header List-Unsubscribe (opt-out com 1 clique)
 */
export async function enviarEmail(
  to: string,
  subject: string,
  html: string,
  from?: string,
  options?: { unsubscribeUrl?: string }
): Promise<{ id: string }> {
  // Avaliado em tempo de execução para pegar o valor correto de APP_DOMAIN após dotenv
  const remetente = from ?? `Financeiro <cobranca@${process.env.APP_DOMAIN ?? 'quitr.com.br'}>`
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY não configurado')

  const payload: ResendPayload = {
    from: remetente,
    to: [to],
    subject,
    html,
  }

  if (options?.unsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${options.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  const data = (await res.json()) as ResendResponse

  if (!res.ok) {
    throw new Error(`Resend API [${res.status}]: ${data.error?.message ?? res.statusText}`)
  }

  return { id: data.id ?? '' }
}
