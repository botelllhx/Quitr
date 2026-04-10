/**
 * Cliente Evolution API (WhatsApp self-hosted).
 * Docs: https://doc.evolution-api.com
 */

export type EvolutionConfig = {
  apiUrl: string
  apiKey: string
  instancia: string
}

type SendTextResponse = {
  key?: { id?: string }
  status?: string
}

type InstanceStatusResponse = {
  instance?: {
    state?: string
  }
}

type VerifyNumberResponse = {
  exists?: boolean
  jid?: string
}

export class EvolutionClient {
  constructor(private config: EvolutionConfig) {}

  private get headers() {
    return {
      'Content-Type': 'application/json',
      apikey: this.config.apiKey,
    }
  }

  private get baseUrl() {
    // Remove trailing slash for safety
    return this.config.apiUrl.replace(/\/$/, '')
  }

  async enviarTexto(telefone: string, mensagem: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/message/sendText/${this.config.instancia}`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          number: telefone,
          text: mensagem,
          delay: 1200,
        }),
      }
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Evolution API [${res.status}]: ${body}`)
    }

    const data = (await res.json()) as SendTextResponse
    return data.key?.id ?? ''
  }

  async verificarNumero(telefone: string): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/chat/whatsappNumbers/${this.config.instancia}`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ numbers: [telefone] }),
      }
    )

    if (!res.ok) return false

    const data = (await res.json()) as VerifyNumberResponse[]
    return data[0]?.exists === true
  }

  async obterStatus(): Promise<{ connected: boolean; state: string }> {
    const res = await fetch(
      `${this.baseUrl}/instance/connectionState/${this.config.instancia}`,
      { method: 'GET', headers: this.headers }
    )

    if (!res.ok) {
      return { connected: false, state: 'error' }
    }

    const data = (await res.json()) as InstanceStatusResponse
    const state = data.instance?.state ?? 'unknown'
    return { connected: state === 'open', state }
  }
}

/** Cria um EvolutionClient a partir das variáveis de ambiente (fallback global) */
export function createEvolutionClientFromEnv(): EvolutionClient {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instancia = process.env.EVOLUTION_INSTANCE ?? 'default'

  if (!apiUrl || !apiKey) {
    throw new Error('EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurado')
  }

  return new EvolutionClient({ apiUrl, apiKey, instancia })
}
