import { z } from 'zod'

export const CreateReguaSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  ativa: z.boolean().default(true),
  padrao: z.boolean().default(false),
})

export const UpdateReguaSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100).optional(),
  descricao: z.string().max(500).optional(),
  ativa: z.boolean().optional(),
  padrao: z.boolean().optional(),
})

export const EtapaSchema = z.object({
  id: z.string().optional(),
  diaOffset: z.number().int(),
  canal: z.enum(['whatsapp', 'email', 'sms']),
  mensagemTemplate: z.string().min(1, 'Template da mensagem é obrigatório'),
  condicao: z.enum(['sempre', 'semResposta', 'comResposta', 'naoAbriu']).default('sempre'),
  acao: z
    .enum(['enviarMensagem', 'gerarAcordo', 'negativar', 'protestar'])
    .default('enviarMensagem'),
  ordem: z.number().int().min(0),
})

export const SalvarEtapasSchema = z.object({
  etapas: z.array(EtapaSchema),
})

export type CreateReguaInput = z.infer<typeof CreateReguaSchema>
export type UpdateReguaInput = z.infer<typeof UpdateReguaSchema>
export type EtapaInput = z.infer<typeof EtapaSchema>
