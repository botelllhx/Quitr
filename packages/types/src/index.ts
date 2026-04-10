// ─── API response shapes ──────────────────────────────────────────────────────

export type ApiSuccess<T> = {
  data: T
  meta?: {
    total: number
    page: number
    pageSize: number
  }
}

export type ApiError = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── Tenant ───────────────────────────────────────────────────────────────────

export type TenantContext = {
  tenantId: string
  clerkOrgId: string
  plano: string
}

// ─── Devedor ──────────────────────────────────────────────────────────────────

export type PerfilDevedor = 'pagador' | 'negligente' | 'negociador' | 'fantasma'

export type DevedorProfile = {
  id: string
  tenantId: string
  nome: string
  cpfCnpj: string
  email?: string | null
  telefone?: string | null
  perfil: PerfilDevedor
  optOut: boolean
  createdAt: Date
}

// ─── Dívida ───────────────────────────────────────────────────────────────────

export type StatusDivida =
  | 'em_aberto'
  | 'em_negociacao'
  | 'acordo_firmado'
  | 'quitada'
  | 'protestada'
  | 'negativada'

export type ScoreFaixa = 'verde' | 'amarelo' | 'vermelho'

export function getScoreFaixa(score: number): ScoreFaixa {
  if (score >= 70) return 'verde'
  if (score >= 40) return 'amarelo'
  return 'vermelho'
}

// ─── Régua ────────────────────────────────────────────────────────────────────

export type CanalEtapa = 'whatsapp' | 'email' | 'sms'
export type CondicaoEtapa = 'sempre' | 'semResposta' | 'comResposta' | 'naoAbriu'
export type AcaoEtapa = 'enviarMensagem' | 'gerarAcordo' | 'negativar' | 'protestar'

// ─── Template variables ───────────────────────────────────────────────────────

export type TemplateVars = {
  nome: string
  valor: string
  vencimento: string
  linkAcordo: string
  empresa: string
}

// ─── Disparo ──────────────────────────────────────────────────────────────────

export type StatusDisparo =
  | 'pendente'
  | 'enviado'
  | 'entregue'
  | 'lido'
  | 'respondido'
  | 'falhou'

// ─── Pagination ───────────────────────────────────────────────────────────────

export type PaginationParams = {
  page?: number
  pageSize?: number
}
