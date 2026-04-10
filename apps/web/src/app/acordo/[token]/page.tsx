import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PortalClient } from './_components/portal-client'

const API_URL = process.env.API_URL ?? 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type OpcaoPagamento = {
  id: string
  label: string
  tipo: 'pix' | 'boleto'
  numeroParcelas: number
  valorTotal: number
  valorEntrada: number
  valorParcela: number
  descontoPercentual: number
}

export type PortalDados = {
  devedor: { nome: string; email: string | null }
  divida: {
    id: string
    descricao: string | null
    valorOriginal: number
    valorAtualizado: number
    dataVencimento: string
    status: string
    score: number
    diasAtraso: number
  }
  empresa: { nome: string; telefone: string }
  opcoes: OpcaoPagamento[]
  expiresAt: string
}

// ─── Fetch (sem auth) ─────────────────────────────────────────────────────────

async function getPortalDados(token: string): Promise<PortalDados | null> {
  const res = await fetch(`${API_URL}/portal/${token}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Erro ao buscar dados do portal: ${res.status}`)

  const body = (await res.json()) as { data: PortalDados }
  return body.data
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const dados = await getPortalDados(token).catch(() => null)
  const empresa = dados?.empresa.nome ?? 'Empresa'
  return {
    title: `Proposta de acordo — ${empresa}`,
    description: 'Regularize sua situação financeira com condições especiais.',
    robots: 'noindex, nofollow',
  }
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const dados = await getPortalDados(token)

  if (!dados) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-sm text-gray-500 uppercase tracking-wider font-medium">
            {dados.empresa.nome}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            Proposta de regularização
          </h1>
        </div>

        {/* Dados da dívida */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Sua dívida
          </p>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Valor em aberto</p>
              <p className="text-xl font-bold text-red-600">
                {formatCurrency(dados.divida.valorAtualizado)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Vencimento</p>
              <p className="text-base font-semibold text-gray-700">
                {formatDate(dados.divida.dataVencimento)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Atraso</p>
              <p className="text-base font-semibold text-gray-700">
                {dados.divida.diasAtraso} dias
              </p>
            </div>
          </div>

          {dados.divida.descricao && (
            <p className="mt-4 text-sm text-gray-500 border-t border-gray-100 pt-4">
              {dados.divida.descricao}
            </p>
          )}
        </div>

        {/* Componente interativo */}
        <PortalClient token={token} dados={dados} />

        {/* Rodapé */}
        <p className="text-center text-xs text-gray-400 mt-8">
          Dúvidas? Entre em contato:{' '}
          {dados.empresa.telefone ? (
            <a
              href={`https://wa.me/55${dados.empresa.telefone.replace(/\D/g, '')}`}
              className="underline hover:text-gray-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              {dados.empresa.telefone}
            </a>
          ) : (
            dados.empresa.nome
          )}
        </p>
      </div>
    </div>
  )
}

// ─── Helpers (só no servidor) ─────────────────────────────────────────────────

function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
