/**
 * Cliente Asaas — geração de cobranças Pix e boleto.
 * Docs: https://docs.asaas.com/reference
 *
 * Valores: Asaas trabalha em BRL decimal (ex: 150.00), não centavos.
 * O banco armazena em centavos; converter antes de chamar estas funções.
 */

const BASE_URL = process.env.ASAAS_ENV === 'sandbox'
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3'

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY
  if (!key) throw new Error('ASAAS_API_KEY não configurado')
  return key
}

async function asaasRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: getApiKey(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = (await res.json()) as T & { errors?: { description: string }[] }

  if (!res.ok) {
    const msgs = (data as any).errors?.map((e: any) => e.description).join('; ')
    throw new Error(`Asaas API [${res.status}] ${path}: ${msgs ?? res.statusText}`)
  }

  return data
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

type AsaasCliente = {
  id: string
  name: string
  cpfCnpj?: string
}

type AsaasListResponse<T> = {
  data: T[]
  totalCount: number
}

type AsaasCobranca = {
  id: string
  status: string
  bankSlipUrl?: string        // link do boleto
  invoiceUrl?: string         // link da fatura
}

type AsaasPix = {
  encodedImage: string        // base64 PNG do QR code
  payload: string             // string EMV copia-e-cola
  expirationDate: string
}

// ─── Cliente Asaas (customer) ─────────────────────────────────────────────────

type DevedorInput = {
  nome: string
  cpfCnpj?: string | null
  email?: string | null
  telefone?: string | null
}

/**
 * Busca cliente existente no Asaas pelo CPF/CNPJ ou cria um novo.
 * Retorna o ID do customer no Asaas.
 */
export async function buscarOuCriarClienteAsaas(devedor: DevedorInput): Promise<string> {
  // Tenta buscar por CPF/CNPJ se disponível
  if (devedor.cpfCnpj) {
    const lista = await asaasRequest<AsaasListResponse<AsaasCliente>>(
      'GET',
      `/customers?cpfCnpj=${encodeURIComponent(devedor.cpfCnpj)}&limit=1`
    )

    if (lista.data.length > 0) {
      return lista.data[0].id
    }
  }

  // Cria novo cliente
  const cliente = await asaasRequest<AsaasCliente>('POST', '/customers', {
    name: devedor.nome,
    cpfCnpj: devedor.cpfCnpj ?? undefined,
    email: devedor.email ?? undefined,
    mobilePhone: devedor.telefone ?? undefined,
  })

  return cliente.id
}

// ─── Pix ──────────────────────────────────────────────────────────────────────

type ResultadoPix = {
  asaasId: string
  pixCopiaECola: string
  pixQrCodeImg: string   // base64 PNG
}

/**
 * Cria uma cobrança Pix no Asaas.
 *
 * @param clienteId   ID do customer no Asaas
 * @param valorBRL    Valor em BRL decimal (ex: 150.00) — NÃO em centavos
 * @param descricao   Descrição do pagamento
 */
export async function criarCobrancaPix(
  clienteId: string,
  valorBRL: number,
  descricao: string
): Promise<ResultadoPix> {
  const cobranca = await asaasRequest<AsaasCobranca>('POST', '/payments', {
    customer: clienteId,
    billingType: 'PIX',
    value: valorBRL,
    description: descricao,
    dueDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().split('T')[0],
  })

  const pix = await asaasRequest<AsaasPix>(
    'GET',
    `/payments/${cobranca.id}/pixQrCode`
  )

  return {
    asaasId: cobranca.id,
    pixCopiaECola: pix.payload,
    pixQrCodeImg: pix.encodedImage,
  }
}

// ─── Boleto ───────────────────────────────────────────────────────────────────

type ResultadoBoleto = {
  asaasId: string
  linkPagamento: string
}

/**
 * Cria um boleto no Asaas.
 *
 * @param clienteId   ID do customer no Asaas
 * @param valorBRL    Valor em BRL decimal
 * @param descricao   Descrição
 * @param vencimento  Data de vencimento (Date)
 */
export async function criarCobrancaBoleto(
  clienteId: string,
  valorBRL: number,
  descricao: string,
  vencimento: Date
): Promise<ResultadoBoleto> {
  const cobranca = await asaasRequest<AsaasCobranca>('POST', '/payments', {
    customer: clienteId,
    billingType: 'BOLETO',
    value: valorBRL,
    description: descricao,
    dueDate: vencimento.toISOString().split('T')[0],
  })

  const link = cobranca.bankSlipUrl ?? cobranca.invoiceUrl ?? ''

  return {
    asaasId: cobranca.id,
    linkPagamento: link,
  }
}

// ─── Cancelar cobrança ────────────────────────────────────────────────────────

/** Cancela uma cobrança no Asaas pelo ID. */
export async function cancelarCobranca(asaasId: string): Promise<void> {
  await asaasRequest<unknown>('DELETE', `/payments/${asaasId}`)
}

// ─── Utilitário ───────────────────────────────────────────────────────────────

/** Converte centavos (int) → BRL decimal (ex: 15000 → 150.00) */
export function centavosParaBRL(centavos: number): number {
  return Math.round(centavos) / 100
}
