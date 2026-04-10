/**
 * Cliente Autentique — geração e assinatura digital de documentos.
 * Autentique expõe uma API GraphQL em https://api.autentique.com.br/v2/graphql
 *
 * Referência: https://docs.autentique.com.br/api/
 */

const BASE_URL = 'https://api.autentique.com.br/v2/graphql'

function getApiKey(): string {
  const key = process.env.AUTENTIQUE_API_KEY
  if (!key) throw new Error('AUTENTIQUE_API_KEY não configurado')
  return key
}

async function autentiqueRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }

  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.map((e) => e.message).join('; ') ?? res.statusText
    throw new Error(`Autentique API: ${msg}`)
  }

  return json.data as T
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AutentiqueSignatario = {
  email: string
  nome?: string
  acoes?: ('SIGN' | 'APPROVE' | 'WITNESS')[]
}

export type DocumentoCriado = {
  id: string
  linkAssinatura: string  // link para o signatário assinar
}

export type DocumentoStatus = {
  id: string
  status: string          // 'PENDING' | 'SIGNED' | 'CANCELLED'
  assinadoEm?: string     // ISO string se assinado
  documentoUrl?: string   // URL do PDF assinado
}

// ─── Criar documento ──────────────────────────────────────────────────────────

/**
 * Cria um documento no Autentique e adiciona os signatários.
 * Retorna o ID do documento e o link de assinatura para o primeiro signatário.
 */
export async function criarDocumento(params: {
  nome: string
  html: string
  signatarios: AutentiqueSignatario[]
}): Promise<DocumentoCriado> {
  const mutation = `
    mutation CriarDocumento($document: DocumentInput!, $signatories: [SignatoryInput!]!) {
      createDocument(document: $document, signatories: $signatories) {
        id
        name
        signatories {
          public_id
          email
          link {
            short_link
          }
          action {
            name
          }
        }
      }
    }
  `

  const data = await autentiqueRequest<{
    createDocument: {
      id: string
      name: string
      signatories: Array<{
        public_id: string
        email: string
        link: { short_link: string }
        action: { name: string }
      }>
    }
  }>(mutation, {
    document: {
      name: params.nome,
      content: params.html,
      content_type: 'HTML',
    },
    signatories: params.signatarios.map((s) => ({
      email: s.email,
      name: s.nome ?? '',
      action: s.acoes?.[0] ?? 'SIGN',
      send_email: true,
    })),
  })

  const doc = data.createDocument
  const linkAssinatura = doc.signatories[0]?.link?.short_link ?? ''

  return { id: doc.id, linkAssinatura }
}

// ─── Buscar documento ─────────────────────────────────────────────────────────

/** Busca o status e o link do PDF de um documento pelo ID. */
export async function buscarDocumento(id: string): Promise<DocumentoStatus> {
  const query = `
    query BuscarDocumento($id: UUID!) {
      document(id: $id) {
        id
        status {
          name
        }
        files {
          signed
        }
        signatures {
          signed {
            created_at
          }
        }
      }
    }
  `

  const data = await autentiqueRequest<{
    document: {
      id: string
      status: { name: string }
      files?: { signed?: string }
      signatures: Array<{ signed?: { created_at: string } }>
    }
  }>(query, { id })

  const doc = data.document
  const status = doc.status.name // 'PENDING' | 'SIGNED' | 'CANCELLED'

  // Data em que todos assinaram (última assinatura)
  const assinaturas = doc.signatures.filter((s) => s.signed?.created_at)
  const assinadoEm = assinaturas.length > 0
    ? assinaturas.sort((a, b) =>
        new Date(b.signed!.created_at).getTime() - new Date(a.signed!.created_at).getTime()
      )[0].signed!.created_at
    : undefined

  return {
    id: doc.id,
    status,
    assinadoEm,
    documentoUrl: doc.files?.signed,
  }
}

// ─── Template HTML do acordo ──────────────────────────────────────────────────

export type AcordoTemplateVars = {
  // Partes
  credorNome: string
  credorCnpj?: string
  devedorNome: string
  devedorCpfCnpj?: string
  devedorEmail?: string
  // Dívida
  dividaDescricao?: string
  valorOriginal: string         // formatado (ex: "R$ 1.500,00")
  valorAtualizado: string
  dataVencimentoOriginal: string
  diasAtraso: number
  // Acordo
  valorTotal: string
  desconto?: string             // ex: "15%"
  numeroParcelas: number
  valorParcela: string
  parcelas: Array<{ numero: number; valor: string; vencimento: string }>
  dataAcordo: string            // data de geração do documento
  // Cláusulas
  multaInadimplencia?: string   // ex: "10%"
  foro?: string                 // ex: "Foro da Comarca de São Paulo"
}

/** Gera o HTML do acordo para envio ao Autentique. */
export function gerarHtmlAcordo(vars: AcordoTemplateVars): string {
  const parcelasRows = vars.parcelas
    .map(
      (p) =>
        `<tr>
          <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center;">${p.numero}</td>
          <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;">${p.valor}</td>
          <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center;">${p.vencimento}</td>
        </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Instrumento Particular de Confissão de Dívida e Acordo de Pagamento</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; max-width: 800px; margin: 0 auto; padding: 40px 32px; line-height: 1.6; }
    h1 { font-size: 16px; font-weight: bold; text-align: center; text-transform: uppercase; margin-bottom: 4px; }
    h2 { font-size: 13px; font-weight: bold; border-bottom: 1px solid #374151; padding-bottom: 4px; margin-top: 24px; }
    .info-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 16px; margin: 12px 0; }
    .info-block p { margin: 4px 0; }
    .highlight { font-weight: bold; color: #1d4ed8; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
    th { background: #374151; color: white; padding: 8px; text-align: center; }
    .clause { margin: 8px 0; text-align: justify; }
    .clause span { font-weight: bold; }
    .signature-block { margin-top: 60px; }
    .signature-line { border-top: 1px solid #111; width: 280px; text-align: center; padding-top: 4px; font-size: 11px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
    .footer { margin-top: 32px; font-size: 10px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  </style>
</head>
<body>
  <h1>Instrumento Particular de Confissão de Dívida<br>e Acordo de Pagamento</h1>
  <p style="text-align:center;color:#6b7280;font-size:11px;">Gerado em ${vars.dataAcordo}</p>

  <h2>1. Das Partes</h2>
  <div class="info-block">
    <p><strong>CREDOR:</strong> ${vars.credorNome}${vars.credorCnpj ? `, inscrito no CNPJ sob nº ${vars.credorCnpj}` : ''}</p>
    <p><strong>DEVEDOR:</strong> ${vars.devedorNome}${vars.devedorCpfCnpj ? `, inscrito no CPF/CNPJ sob nº ${vars.devedorCpfCnpj}` : ''}${vars.devedorEmail ? ` — ${vars.devedorEmail}` : ''}</p>
  </div>

  <h2>2. Da Dívida</h2>
  <div class="info-block">
    <p><strong>Origem:</strong> ${vars.dividaDescricao ?? 'Dívida conforme histórico comercial entre as partes'}</p>
    <p><strong>Valor original:</strong> ${vars.valorOriginal}</p>
    <p><strong>Valor atualizado:</strong> ${vars.valorAtualizado}</p>
    <p><strong>Data de vencimento original:</strong> ${vars.dataVencimentoOriginal}</p>
    <p><strong>Dias em atraso:</strong> ${vars.diasAtraso} dias</p>
  </div>

  <h2>3. Das Condições Negociadas</h2>
  <div class="info-block">
    <p><strong>Valor do acordo:</strong> <span class="highlight">${vars.valorTotal}</span>${vars.desconto ? ` (desconto de ${vars.desconto} aplicado)` : ''}</p>
    <p><strong>Forma de pagamento:</strong> ${vars.numeroParcelas === 1 ? 'À vista' : `${vars.numeroParcelas} parcelas mensais`}</p>
  </div>

  <h2>4. Cronograma de Pagamento</h2>
  <table>
    <thead>
      <tr>
        <th>Parcela</th>
        <th>Valor</th>
        <th>Vencimento</th>
      </tr>
    </thead>
    <tbody>
      ${parcelasRows}
    </tbody>
  </table>

  <h2>5. Cláusulas e Condições</h2>
  <p class="clause"><span>5.1.</span> O DEVEDOR confessa dever ao CREDOR a importância descrita na Cláusula 2, comprometendo-se a quitar o débito nas condições acordadas na Cláusula 3.</p>
  <p class="clause"><span>5.2.</span> O não pagamento de qualquer parcela no prazo estabelecido implicará vencimento antecipado de todas as parcelas vincendas${vars.multaInadimplencia ? `, acrescidas de multa de ${vars.multaInadimplencia} sobre o saldo devedor` : ''}, independentemente de qualquer notificação judicial ou extrajudicial.</p>
  <p class="clause"><span>5.3.</span> Em caso de inadimplemento, o CREDOR poderá, a seu exclusivo critério, protestar o título, incluir o nome do DEVEDOR nos órgãos de proteção ao crédito (SPC, Serasa) e cobrar judicialmente o débito atualizado.</p>
  <p class="clause"><span>5.4.</span> O presente instrumento constitui título executivo extrajudicial, nos termos do Art. 784 do Código de Processo Civil.</p>
  <p class="clause"><span>5.5.</span> As partes elegem o foro da ${vars.foro ?? 'Comarca do domicílio do Credor'} para dirimir quaisquer litígios decorrentes do presente instrumento, renunciando a qualquer outro, por mais privilegiado que seja.</p>

  <div class="signatures">
    <div>
      <div class="signature-line">${vars.credorNome}<br>CREDOR</div>
    </div>
    <div>
      <div class="signature-line">${vars.devedorNome}<br>DEVEDOR</div>
    </div>
  </div>

  <div class="footer">
    Documento gerado eletronicamente pelo sistema Quitr. A autenticidade pode ser verificada pelo código do documento no Autentique.
  </div>
</body>
</html>`
}
