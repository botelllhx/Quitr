import { db } from '@repo/db'
import { getDiasAtraso } from '@repo/utils'
import {
  buscarOuCriarClienteAsaas,
  criarCobrancaPix,
  criarCobrancaBoleto,
  centavosParaBRL,
} from '../../integrations/pagamento/asaas.client'
import {
  criarDocumento,
  gerarHtmlAcordo,
} from '../../integrations/assinatura/autentique.client'
import { despacharMensagem } from '../../integrations/dispatch'
import { formatCurrency, formatDate } from '@repo/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type OpcaoPagamento = {
  id: string                  // 'avista' | 'parcelado_2x' | 'parcelado_3x'
  label: string
  tipo: 'pix' | 'boleto'
  numeroParcelas: number
  valorTotal: number          // centavos
  valorEntrada: number        // centavos (0 se sem entrada)
  valorParcela: number        // centavos por parcela
  descontoPercentual: number  // ex: 15 para 15%
}

export type PortalDados = {
  devedor: {
    nome: string
    email: string | null
  }
  divida: {
    id: string
    descricao: string | null
    valorOriginal: number
    valorAtualizado: number
    dataVencimento: string    // ISO string
    status: string
    score: number
    diasAtraso: number
  }
  empresa: {
    nome: string
    telefone: string
  }
  opcoes: OpcaoPagamento[]
  expiresAt: string           // ISO string do acordoTokenExp
}

export type AcordoInput = {
  numeroParcelas: number      // 1, 2 ou 3
}

// ─── Descontos por número de parcelas ─────────────────────────────────────────

const DESCONTOS: Record<number, number> = {
  1: 15,   // à vista: 15% de desconto
  2: 7,    // 2x: 7% de desconto
  3: 0,    // 3x: sem desconto
}

// ─── Funções ──────────────────────────────────────────────────────────────────

/** Busca a dívida pelo token de acordo e valida expiração. */
export async function buscarDividaPorToken(token: string) {
  const divida = await db.divida.findFirst({
    where: { acordoToken: token, deletedAt: null },
    include: {
      devedor: true,
    },
  })

  if (!divida) return null

  // Token expirado
  if (divida.acordoTokenExp && divida.acordoTokenExp < new Date()) {
    return null
  }

  // Dívida não está mais elegível para acordo
  if (['quitada', 'protestada', 'negativada'].includes(divida.status)) {
    return null
  }

  return divida
}

/** Calcula as opções de pagamento disponíveis para a dívida. */
export function calcularOpcoes(valorAtualizado: number): OpcaoPagamento[] {
  return [1, 2, 3].map((parcelas) => {
    const descontoPerc = DESCONTOS[parcelas] ?? 0
    const valorTotal = Math.round(valorAtualizado * (1 - descontoPerc / 100))
    const valorEntrada = 0
    // Math.floor para consistência com a criação real das parcelas no banco.
    // A última parcela absorve os centavos restantes (sempre ≥ as demais).
    const valorParcela = Math.floor(valorTotal / parcelas)

    const labels: Record<number, string> = {
      1: `À vista com ${descontoPerc}% de desconto`,
      2: `2× sem juros com ${descontoPerc}% de desconto`,
      3: `3× sem juros`,
    }

    return {
      id: parcelas === 1 ? 'avista' : `parcelado_${parcelas}x`,
      label: labels[parcelas] ?? `${parcelas}×`,
      tipo: 'pix',              // padrão Pix; boleto para parcelas 2x e 3x
      numeroParcelas: parcelas,
      valorTotal,
      valorEntrada,
      valorParcela,
      descontoPercentual: descontoPerc,
    }
  })
}

/** Retorna os dados completos do portal para exibição. */
export async function buscarDadosPortal(token: string): Promise<PortalDados | null> {
  const divida = await buscarDividaPorToken(token)
  if (!divida) return null

  const tenant = await db.tenant.findUnique({ where: { id: divida.tenantId } })
  if (!tenant) return null

  const diasAtraso = getDiasAtraso(divida.dataVencimento)
  const opcoes = calcularOpcoes(divida.valorAtualizado)

  return {
    devedor: {
      nome: divida.devedor.nome,
      email: divida.devedor.email,
    },
    divida: {
      id: divida.id,
      descricao: divida.descricao,
      valorOriginal: divida.valorOriginal,
      valorAtualizado: divida.valorAtualizado,
      dataVencimento: divida.dataVencimento.toISOString(),
      status: divida.status,
      score: divida.score,
      diasAtraso,
    },
    empresa: {
      nome: tenant.nome || 'Empresa',
      telefone: tenant.telefoneEmpresa,
    },
    opcoes,
    expiresAt: divida.acordoTokenExp?.toISOString() ?? '',
  }
}

// ─── Aceitar acordo ───────────────────────────────────────────────────────────

type CobrancaCriada = {
  asaasId: string
  tipo: string
  valor: number
  pixCopiaECola?: string
  pixQrCodeImg?: string
  linkPagamento?: string
}

type AcordoCriado = {
  acordoId: string
  cobrancas: CobrancaCriada[]
  linkAssinatura?: string   // link do Autentique para o devedor assinar (se configurado)
}

/**
 * Cria o Acordo, as Parcelas e as Cobranças no Asaas para o token informado.
 * Retorna os dados de pagamento para exibição imediata ao devedor.
 */
export async function aceitarAcordo(token: string, input: AcordoInput): Promise<AcordoCriado> {
  const divida = await buscarDividaPorToken(token)
  if (!divida) throw new Error('TOKEN_INVALIDO')

  // Verificar se já existe acordo ativo para esta dívida
  const acordoExistente = await db.acordo.findFirst({
    where: { dividaId: divida.id, status: { in: ['pendente', 'ativo'] } },
  })
  if (acordoExistente) throw new Error('ACORDO_JA_EXISTE')

  const { numeroParcelas } = input
  if (![1, 2, 3].includes(numeroParcelas)) {
    throw new Error('PARCELAS_INVALIDAS')
  }

  const opcao = calcularOpcoes(divida.valorAtualizado).find(
    (o) => o.numeroParcelas === numeroParcelas
  )!

  // Criar Acordo + Parcelas em transação
  const acordo = await db.$transaction(async (tx) => {
    const novoAcordo = await tx.acordo.create({
      data: {
        tenantId: divida.tenantId,
        dividaId: divida.id,
        valorTotal: opcao.valorTotal,
        valorEntrada: opcao.valorEntrada,
        numeroParcelas,
        status: 'pendente',
      },
    })

    // Criar parcelas distribuídas mensalmente a partir de hoje.
    // 1ª parcela: +3 dias (72h — prazo do Pix).
    // Demais: +1, +2, … meses a partir do vencimento da 1ª.
    // Última parcela absorve a diferença de centavos do arredondamento.
    const hoje = new Date()
    const vencimentoPrimeira = new Date(hoje)
    vencimentoPrimeira.setDate(vencimentoPrimeira.getDate() + 3)

    const valorParcelaPadrao = Math.floor(opcao.valorTotal / numeroParcelas)
    const restoCentavos = opcao.valorTotal - valorParcelaPadrao * numeroParcelas

    for (let i = 1; i <= numeroParcelas; i++) {
      const vencimento = new Date(vencimentoPrimeira)
      vencimento.setMonth(vencimento.getMonth() + (i - 1))

      // Última parcela recebe os centavos restantes para fechar o total exato
      const valor = i === numeroParcelas
        ? valorParcelaPadrao + restoCentavos
        : valorParcelaPadrao

      await tx.parcela.create({
        data: {
          acordoId: novoAcordo.id,
          numero: i,
          valor,
          vencimento,
          status: 'pendente',
        },
      })
    }

    // Atualizar status da dívida
    await tx.divida.update({
      where: { id: divida.id },
      data: { status: 'em_negociacao' },
    })

    return novoAcordo
  })

  // Buscar parcelas criadas
  const parcelas = await db.parcela.findMany({
    where: { acordoId: acordo.id },
    orderBy: { numero: 'asc' },
  })

  // Criar cobranças no Asaas (fora da transação — chamada externa).
  // Se o Asaas falhar, cancelamos o Acordo e revertemos o status da dívida.
  try {
    const clienteAsaasId = await buscarOuCriarClienteAsaas({
      nome: divida.devedor.nome,
      cpfCnpj: divida.devedor.cpfCnpj,
      email: divida.devedor.email,
      telefone: divida.devedor.telefone,
    })

    // Avançar acordo para ATIVO — sinaliza que cobranças foram geradas e está em curso.
    // Necessário para que verificarAcordosVencidos() o detecte como inadimplente
    // caso o devedor não pague (independentemente de Autentique estar configurado).
    await db.acordo.update({
      where: { id: acordo.id },
      data: { status: 'ativo' },
    })

    const cobrancasCriadas: CobrancaCriada[] = []

    for (const parcela of parcelas) {
      const valorBRL = centavosParaBRL(parcela.valor)
      const descricao = `Parcela ${parcela.numero}/${numeroParcelas} — ${divida.descricao ?? 'Dívida'}`

      // Pix para à vista (1 de 1) ou primeira parcela; boleto para as demais
      const usarPix = numeroParcelas === 1 || parcela.numero === 1

      if (usarPix) {
        const resultado = await criarCobrancaPix(clienteAsaasId, valorBRL, descricao)

        await db.cobranca.create({
          data: {
            tenantId: divida.tenantId,
            acordoId: acordo.id,
            parcelaId: parcela.id,
            asaasId: resultado.asaasId,
            tipo: 'pix',
            valor: parcela.valor,
            status: 'pending',
            pixCopiaECola: resultado.pixCopiaECola,
            pixQrCodeImg: resultado.pixQrCodeImg,
          },
        })

        cobrancasCriadas.push({
          asaasId: resultado.asaasId,
          tipo: 'pix',
          valor: parcela.valor,
          pixCopiaECola: resultado.pixCopiaECola,
          pixQrCodeImg: resultado.pixQrCodeImg,
        })
      } else {
        const resultado = await criarCobrancaBoleto(
          clienteAsaasId,
          valorBRL,
          descricao,
          parcela.vencimento
        )

        await db.cobranca.create({
          data: {
            tenantId: divida.tenantId,
            acordoId: acordo.id,
            parcelaId: parcela.id,
            asaasId: resultado.asaasId,
            tipo: 'boleto',
            valor: parcela.valor,
            status: 'pending',
            linkPagamento: resultado.linkPagamento,
          },
        })

        cobrancasCriadas.push({
          asaasId: resultado.asaasId,
          tipo: 'boleto',
          valor: parcela.valor,
          linkPagamento: resultado.linkPagamento,
        })
      }
    }

    // ── Autentique: gerar documento de acordo e enviar link de assinatura ────
    let linkAssinatura: string | undefined

    if (process.env.AUTENTIQUE_API_KEY && divida.devedor.email) {
      try {
        const tenant = await db.tenant.findUnique({ where: { id: divida.tenantId } })
        const diasAtraso = getDiasAtraso(divida.dataVencimento)

        const html = gerarHtmlAcordo({
          credorNome: tenant?.nome ?? 'Empresa',
          credorCnpj: tenant?.cnpj ?? undefined,
          devedorNome: divida.devedor.nome,
          devedorCpfCnpj: divida.devedor.cpfCnpj ?? undefined,
          devedorEmail: divida.devedor.email,
          dividaDescricao: divida.descricao ?? undefined,
          valorOriginal: formatCurrency(divida.valorOriginal),
          valorAtualizado: formatCurrency(divida.valorAtualizado),
          dataVencimentoOriginal: formatDate(divida.dataVencimento),
          diasAtraso,
          valorTotal: formatCurrency(opcao.valorTotal),
          desconto: opcao.descontoPercentual > 0 ? `${opcao.descontoPercentual}%` : undefined,
          numeroParcelas,
          valorParcela: formatCurrency(opcao.valorParcela),
          parcelas: parcelas.map((p) => ({
            numero: p.numero,
            valor: formatCurrency(p.valor),
            vencimento: formatDate(p.vencimento),
          })),
          dataAcordo: formatDate(new Date()),
          multaInadimplencia: tenant
            ? `${Number(tenant.multaQuebraAcordo).toFixed(0)}%`
            : undefined,
        })

        const doc = await criarDocumento({
          nome: `Acordo de Pagamento — ${divida.devedor.nome}`,
          html,
          signatarios: [{ email: divida.devedor.email, nome: divida.devedor.nome }],
        })

        linkAssinatura = doc.linkAssinatura

        // Salvar autentiqueId no Acordo para correlacionar o webhook de assinatura
        await db.acordo.update({
          where: { id: acordo.id },
          data: { documentoUrl: doc.id },
        })
      } catch {
        // Falha no Autentique não cancela o acordo — pagamento já foi gerado
        console.warn('[portal.service] Falha ao gerar documento no Autentique')
      }
    }

    // ── WhatsApp: notificar devedor ────────────────────────────────────────────
    if (divida.devedor.telefone && !divida.devedor.optOut) {
      const mensagem = linkAssinatura
        ? `Olá, ${divida.devedor.nome}! Seu acordo foi registrado com sucesso. ` +
          `Por favor, assine o documento aqui: ${linkAssinatura}`
        : `Olá, ${divida.devedor.nome}! Seu acordo foi registrado. Aguarde a confirmação do pagamento.`

      try {
        await despacharMensagem(
          'whatsapp',
          divida.devedor.telefone,
          mensagem,
          divida.tenantId
        )
      } catch {
        console.warn('[portal.service] Falha ao enviar WhatsApp de confirmação')
      }
    }

    return { acordoId: acordo.id, cobrancas: cobrancasCriadas, linkAssinatura }
  } catch (err) {
    // Compensação: cancelar o Acordo e reverter status da dívida para que o
    // devedor possa tentar novamente sem ficar bloqueado pelo check de acordo ativo.
    await db.$transaction([
      db.acordo.update({
        where: { id: acordo.id },
        data: { status: 'cancelado' },
      }),
      db.divida.update({
        where: { id: divida.id },
        data: { status: 'em_aberto' },
      }),
    ])
    throw err
  }
}
