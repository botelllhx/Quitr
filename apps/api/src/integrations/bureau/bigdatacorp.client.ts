/**
 * Cliente Big Data Corp — enriquecimento de contatos por CPF/CNPJ.
 * Documentação: https://developers.bigdatacorp.com.br
 */

const BASE_URL = process.env.BIGDATACORP_BASE_URL ?? 'https://plataforma.bigdatacorp.com.br'
const API_KEY = process.env.BIGDATACORP_API_KEY ?? ''

export type Telefonebureau = {
  numero: string   // E.164 sem +, ex: "5511999990000"
  tipo: 'celular' | 'fixo' | 'desconhecido'
  score: number    // 0–100 de confiança
}

export type EmailBureau = {
  email: string
  score: number
}

export type ContatosBureau = {
  telefones: Telefonebureau[]
  emails: EmailBureau[]
}

async function fetchWithRetry(url: string, options: RequestInit, tentativas = 2): Promise<Response> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status >= 500 && i < tentativas - 1) continue
      return res
    } catch (err) {
      if (i === tentativas - 1) throw err
    }
  }
  throw new Error('Todas as tentativas falharam')
}

/**
 * Busca telefones e e-mails associados a um CPF ou CNPJ.
 * Retorna listas vazias em caso de CPF não encontrado (404).
 */
export async function buscarContatosPorCpf(cpfOuCnpj: string): Promise<ContatosBureau> {
  const doc = cpfOuCnpj.replace(/\D/g, '')

  const res = await fetchWithRetry(
    `${BASE_URL}/pessoas`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AccessToken': API_KEY,
      },
      body: JSON.stringify({
        q: `doc{${doc}}`,
        Datasets: 'phones_and_emails',
      }),
    }
  )

  if (res.status === 404) {
    return { telefones: [], emails: [] }
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`BigDataCorp retornou ${res.status}: ${body.slice(0, 200)}`)
  }

  // Estrutura esperada (simplificada para o dataset phones_and_emails):
  // { PhoneData: [{ PhoneNumber, PhoneType, Rank }], EmailData: [{ Email, EmailRank }] }
  const data = await res.json() as {
    PhoneData?: Array<{ PhoneNumber: string; PhoneType?: string; Rank?: number }>
    EmailData?: Array<{ Email: string; EmailRank?: number }>
  }

  const telefones: Telefonebureau[] = (data.PhoneData ?? []).map((p) => ({
    numero: p.PhoneNumber.replace(/\D/g, ''),
    tipo: p.PhoneType === 'CELULAR' ? 'celular' : p.PhoneType === 'FIXO' ? 'fixo' : 'desconhecido',
    score: Math.min(100, Math.max(0, Math.round((p.Rank ?? 50) * 100))),
  }))

  const emails: EmailBureau[] = (data.EmailData ?? []).map((e) => ({
    email: e.Email,
    score: Math.min(100, Math.max(0, Math.round((e.EmailRank ?? 50) * 100))),
  }))

  return { telefones, emails }
}
