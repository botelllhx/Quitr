/**
 * Cliente Zenvia (SMS).
 * Docs: https://zenvia.com/developers/
 */

type ZenviaResponse = { id?: string; error?: { code?: string; message?: string } }

export async function sendSmsMessage(
  telefone: string,
  mensagem: string
): Promise<{ id: string }> {
  const apiKey = process.env.ZENVIA_API_KEY
  if (!apiKey) throw new Error('ZENVIA_API_KEY não configurado')

  const res = await fetch('https://api.zenvia.com/v2/channels/sms/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-TOKEN': apiKey,
    },
    body: JSON.stringify({
      from: 'QUITR',
      to: telefone,
      contents: [{ type: 'text', text: mensagem }],
    }),
  })

  const data = (await res.json()) as ZenviaResponse

  if (!res.ok) {
    throw new Error(`Zenvia API [${res.status}]: ${data.error?.message ?? res.statusText}`)
  }

  return { id: data.id ?? '' }
}
