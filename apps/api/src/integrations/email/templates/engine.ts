import { cobrancaTemplate } from './cobranca'
import { acordoTemplate } from './acordo'

// ─── Tipos de variáveis por template ─────────────────────────────────────────

export type CobrancaVars = {
  nome: string
  empresa: string
  logoUrl: string
  valor: string
  vencimento: string
  diasAtraso: string
  linkAcordo: string
  pixelUrl: string
  optOutUrl: string
  telefoneEmpresa: string
}

export type AcordoVars = {
  nome: string
  empresa: string
  logoUrl: string
  valor: string
  desconto: string
  valorFinal: string
  numeroParcelas: string
  valorEntrada: string
  valorParcela: string
  linkAcordo: string
  pixelUrl: string
  optOutUrl: string
  validadeHoras: string
}

// ─── Interpolador ─────────────────────────────────────────────────────────────

/**
 * Substitui {{chave}} no template pelas variáveis fornecidas.
 * Variáveis inexistentes ou vazias ficam como string vazia.
 *
 * Suporte a blocos condicionais simples:
 *   {{#chave}} ... {{/chave}}  → exibe se valor não-vazio
 *   {{^chave}} ... {{/chave}}  → exibe se valor vazio
 */
function interpolar(template: string, vars: Record<string, string>): string {
  // Blocos {{#key}} ... {{/key}} — exibe se valor presente
  let result = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => (vars[key] ? content : '')
  )

  // Blocos {{^key}} ... {{/key}} — exibe se valor ausente/vazio
  result = result.replace(
    /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => (!vars[key] ? content : '')
  )

  // Variáveis simples {{key}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')

  return result
}

// ─── Funções de render ────────────────────────────────────────────────────────

export function renderCobranca(vars: CobrancaVars): string {
  return interpolar(cobrancaTemplate, vars as Record<string, string>)
}

export function renderAcordo(vars: AcordoVars): string {
  return interpolar(acordoTemplate, vars as Record<string, string>)
}

// ─── Fallback: texto simples → HTML básico ────────────────────────────────────

/** Converte texto plano (com quebras de linha) em HTML seguro para e-mail. */
export function textoParaHtml(texto: string): string {
  const escaped = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111827;background:#f3f4f6">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    ${escaped}
  </div>
</body>
</html>`
}
