import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { format, differenceInDays, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { TemplateVars } from '@repo/types'

const TZ_BRASILIA = 'America/Sao_Paulo'

// ─── Datas ────────────────────────────────────────────────────────────────────

export function toBrasiliaDate(date: Date): Date {
  return toZonedTime(date, TZ_BRASILIA)
}

export function formatDate(date: Date, fmt = 'dd/MM/yyyy'): string {
  return formatInTimeZone(date, TZ_BRASILIA, fmt, { locale: ptBR })
}

export function isWithinBusinessHours(date: Date): boolean {
  const zonedDate = toZonedTime(date, TZ_BRASILIA)
  const hour = zonedDate.getHours()
  return hour >= 8 && hour < 20
}

export function getDiasAtraso(dataVencimento: Date): number {
  const today = toZonedTime(new Date(), TZ_BRASILIA)
  const vencimento = toZonedTime(dataVencimento, TZ_BRASILIA)
  return Math.max(0, differenceInDays(today, vencimento))
}

export { addDays, format }

// ─── Valores monetários ───────────────────────────────────────────────────────

/** Formata centavos em BRL, ex: 15000 → "R$ 150,00" */
export function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100)
}

/** Converte string "150,00" ou "150.00" para centavos */
export function parseCurrencyToCents(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  return Math.round(parseFloat(normalized) * 100)
}

// ─── Cálculos financeiros ─────────────────────────────────────────────────────

/**
 * Calcula valor atualizado com multa (uma vez) + juros pro rata mensais.
 * Todos os valores em centavos. Percentuais como decimais (ex: 2 para 2%).
 */
export function calcularValorAtualizado(
  valorOriginal: number,
  multaPercentual: number,
  jurosMensais: number,
  diasAtraso: number
): number {
  if (diasAtraso <= 0) return valorOriginal
  const multa = valorOriginal * (multaPercentual / 100)
  const mesesAtraso = diasAtraso / 30
  const juros = valorOriginal * (jurosMensais / 100) * mesesAtraso
  return Math.round(valorOriginal + multa + juros)
}

// ─── Templates de mensagem ────────────────────────────────────────────────────

/** Interpola variáveis em template. Nunca executa como código. */
export function interpolateTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{nome\}/g, vars.nome)
    .replace(/\{valor\}/g, vars.valor)
    .replace(/\{vencimento\}/g, vars.vencimento)
    .replace(/\{linkAcordo\}/g, vars.linkAcordo)
    .replace(/\{empresa\}/g, vars.empresa)
}

// ─── Strings / CPF / CNPJ ────────────────────────────────────────────────────

export function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return value
}

export function sanitizeCpfCnpj(value: string): string {
  return value.replace(/\D/g, '')
}

// ─── Score de recuperabilidade ────────────────────────────────────────────────

export type ScoreInput = {
  diasAtraso: number
  respondeuUltimaMensagem: boolean
  tentativasSemResposta: number
  pagouAnteriormente: boolean
  valorOriginal: number
}

export function calcularScore(input: ScoreInput): number {
  // Dias em atraso: 40% — quanto mais dias, menor a nota
  const maxDias = 360
  const diasScore = Math.max(0, 1 - input.diasAtraso / maxDias) * 100
  const diasPeso = diasScore * 0.4

  // Respondeu última mensagem: 20%
  const respondeuScore = input.respondeuUltimaMensagem ? 100 : 0
  const respondeuPeso = respondeuScore * 0.2

  // Tentativas sem resposta: 20% — muitas tentativas = nota baixa
  const maxTentativas = 10
  const tentativasScore = Math.max(0, 1 - input.tentativasSemResposta / maxTentativas) * 100
  const tentativasPeso = tentativasScore * 0.2

  // Histórico de pagamento: 10%
  const historicoPeso = (input.pagouAnteriormente ? 60 : 0) * 0.1

  // Valor da dívida: 10% — dívidas maiores têm peso ligeiramente menor
  const maxValor = 100_000_00 // R$ 100.000 em centavos
  const valorScore = Math.max(0, 1 - input.valorOriginal / maxValor) * 100
  const valorPeso = valorScore * 0.1

  const total = diasPeso + respondeuPeso + tentativasPeso + historicoPeso + valorPeso
  return Math.round(Math.min(100, Math.max(0, total)))
}

// ─── Retry com backoff exponencial ───────────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}
