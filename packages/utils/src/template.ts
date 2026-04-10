/**
 * Interpola variáveis em templates de mensagem de cobrança.
 * Nunca executa strings como código — substituição simples via regex.
 */

export type InterpolationVars = {
  nome: string
  /** Valor formatado: ex. "R$ 1.234,56" */
  valor: string
  /** Data formatada: ex. "15/03/2024" */
  vencimento: string
  diasAtraso: number
  linkAcordo: string
  empresa: string
  telefoneEmpresa: string
}

export function interpolarTemplate(template: string, dados: InterpolationVars): string {
  return template
    .replace(/\{nome\}/g, dados.nome)
    .replace(/\{valor\}/g, dados.valor)
    .replace(/\{vencimento\}/g, dados.vencimento)
    .replace(/\{diasAtraso\}/g, String(dados.diasAtraso))
    .replace(/\{linkAcordo\}/g, dados.linkAcordo)
    .replace(/\{empresa\}/g, dados.empresa)
    .replace(/\{telefoneEmpresa\}/g, dados.telefoneEmpresa)
}
