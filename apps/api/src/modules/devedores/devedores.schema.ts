import { z } from 'zod'

// ─── Primitivos reutilizáveis ─────────────────────────────────────────────────

/** Telefone no formato E.164: +[código país][número], 10–15 dígitos totais */
const telefoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{9,14}$/, 'Telefone deve estar no formato E.164 (ex: +5511999999999)')

/**
 * CPF: 11 dígitos numéricos
 * CNPJ: 14 dígitos numéricos
 * Armazenado sem formatação no banco.
 */
const cpfCnpjSchema = z
  .string()
  .regex(/^\d{11}$|^\d{14}$/, 'CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos')
  .optional()

const enderecoSchema = z
  .object({
    cep: z.string().max(8).optional(),
    logradouro: z.string().max(255).optional(),
    numero: z.string().max(10).optional(),
    complemento: z.string().max(100).optional(),
    bairro: z.string().max(100).optional(),
    cidade: z.string().max(100).optional(),
    estado: z.string().length(2, 'Estado deve ter 2 letras (ex: SP)').optional(),
  })
  .optional()

// ─── Schemas principais ───────────────────────────────────────────────────────

export const CreateDevedorSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
  telefone: telefoneSchema,
  email: z.string().email('E-mail inválido').max(255).optional(),
  cpfCnpj: cpfCnpjSchema,
  tipo: z.enum(['PF', 'PJ']).default('PF'),
  endereco: enderecoSchema,
})

/** Todos os campos são opcionais na atualização */
export const UpdateDevedorSchema = CreateDevedorSchema.partial()

/** Importação em lote — array de devedores com os mesmos campos do CreateDevedor */
export const ImportarDevedoresSchema = z.object({
  devedores: z
    .array(CreateDevedorSchema)
    .min(1, 'Informe ao menos 1 devedor')
    .max(1000, 'Limite de 1.000 devedores por importação'),
})

/** Query params para listagem */
export const ListarDevedoresQuerySchema = z.object({
  busca: z.string().max(100).optional(),
  perfil: z.enum(['pagador', 'negligente', 'negociador', 'fantasma']).optional(),
  status: z
    .enum(['em_aberto', 'em_negociacao', 'acordo_firmado', 'quitada', 'protestada', 'negativada'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
})

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type CreateDevedorInput = z.infer<typeof CreateDevedorSchema>
export type UpdateDevedorInput = z.infer<typeof UpdateDevedorSchema>
export type ImportarDevedoresInput = z.infer<typeof ImportarDevedoresSchema>
export type ListarDevedoresQuery = z.infer<typeof ListarDevedoresQuerySchema>
