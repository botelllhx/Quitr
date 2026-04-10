'use client'

import { useState } from 'react'
import type { OpcaoPagamento, PortalDados } from '../page'
import { Button } from '@/components/ui/button'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// ─── Tipos de resultado ───────────────────────────────────────────────────────

type CobrancaResultado = {
  asaasId: string
  tipo: string
  valor: number
  pixCopiaECola?: string
  pixQrCodeImg?: string
  linkPagamento?: string
}

type AcordoResultado = {
  acordoId: string
  cobrancas: CobrancaResultado[]
  linkAssinatura?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100)
}

// ─── Componente ───────────────────────────────────────────────────────────────

type Props = {
  token: string
  dados: PortalDados
}

type State = 'idle' | 'loading' | 'done' | 'error'

export function PortalClient({ token, dados }: Props) {
  const [estado, setEstado] = useState<State>('idle')
  const [opcaoSelecionada, setOpcaoSelecionada] = useState<OpcaoPagamento>(dados.opcoes[0])
  const [resultado, setResultado] = useState<AcordoResultado | null>(null)
  const [copiadoPix, setCopiadoPix] = useState(false)
  const [erroMsg, setErroMsg] = useState('')

  async function aceitar() {
    setEstado('loading')
    setErroMsg('')

    try {
      const res = await fetch(`${API_URL}/portal/${token}/aceitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroParcelas: opcaoSelecionada.numeroParcelas }),
      })

      const body = (await res.json()) as
        | { data: AcordoResultado }
        | { error: { message: string } }

      if (!res.ok) {
        const msg = 'error' in body ? body.error.message : `Erro ${res.status}`
        throw new Error(msg)
      }

      setResultado((body as { data: AcordoResultado }).data)
      setEstado('done')
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao processar acordo.')
      setEstado('error')
    }
  }

  async function copiarPix(texto: string) {
    await navigator.clipboard.writeText(texto)
    setCopiadoPix(true)
    setTimeout(() => setCopiadoPix(false), 2500)
  }

  // ─── Estado: done ─────────────────────────────────────────────────────────

  if (estado === 'done' && resultado) {
    const pixCobranca = resultado.cobrancas.find((c) => c.tipo === 'pix')
    const boletoCobrancas = resultado.cobrancas.filter((c) => c.tipo === 'boleto')

    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
          <div className="text-4xl mb-2">✅</div>
          <h2 className="text-lg font-bold text-green-800">Acordo firmado!</h2>
          <p className="text-sm text-green-700 mt-1">
            Realize o pagamento abaixo para ativar seu acordo.
          </p>
        </div>

        {/* Pix QR code */}
        {pixCobranca?.pixQrCodeImg && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
              Pague via Pix
            </p>
            <img
              src={`data:image/png;base64,${pixCobranca.pixQrCodeImg}`}
              alt="QR Code Pix"
              className="mx-auto w-48 h-48 border border-gray-100 rounded-lg"
            />
            <p className="text-sm text-gray-500 mt-3 mb-2">ou copie o código:</p>
            {pixCobranca.pixCopiaECola && (
              <div className="relative">
                <code className="block bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 break-all text-left">
                  {pixCobranca.pixCopiaECola.slice(0, 80)}…
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => copiarPix(pixCobranca.pixCopiaECola!)}
                >
                  {copiadoPix ? '✓ Copiado!' : 'Copiar código Pix'}
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Valor: <strong>{formatCurrency(pixCobranca.valor)}</strong>
            </p>
          </div>
        )}

        {/* Link de assinatura digital */}
        {resultado.linkAssinatura && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
            <p className="text-sm font-semibold text-blue-700 mb-2">Assine o contrato digitalmente</p>
            <p className="text-xs text-blue-600 mb-3">
              Um link de assinatura também foi enviado para o seu e-mail.
            </p>
            <a
              href={resultado.linkAssinatura}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Assinar documento →
            </a>
          </div>
        )}

        {/* Boletos das demais parcelas */}
        {boletoCobrancas.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
              Demais parcelas — boleto
            </p>
            <div className="space-y-2">
              {boletoCobrancas.map((c, i) => (
                <a
                  key={c.asaasId}
                  href={c.linkPagamento}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm text-gray-700">
                    Parcela {i + (pixCobranca ? 2 : 1)} — {formatCurrency(c.valor)}
                  </span>
                  <span className="text-xs text-blue-600 underline">Ver boleto →</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Estado: error ────────────────────────────────────────────────────────

  if (estado === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
        <p className="text-sm font-semibold text-red-700 mb-1">Não foi possível processar</p>
        <p className="text-sm text-red-600">{erroMsg}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setEstado('idle')}
        >
          Tentar novamente
        </Button>
      </div>
    )
  }

  // ─── Estado: idle / loading ───────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
        Escolha uma opção de pagamento
      </p>

      {/* Cards de opção */}
      {dados.opcoes.map((opcao) => {
        const selecionada = opcaoSelecionada.id === opcao.id
        return (
          <button
            key={opcao.id}
            type="button"
            onClick={() => setOpcaoSelecionada(opcao)}
            disabled={estado === 'loading'}
            className={[
              'w-full text-left p-4 rounded-xl border-2 transition-all',
              selecionada
                ? 'border-green-500 bg-green-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-gray-800 text-sm">{opcao.label}</span>
              {opcao.descontoPercentual > 0 && (
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  −{opcao.descontoPercentual}%
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-gray-900">
                {formatCurrency(opcao.valorTotal)}
              </span>
              {opcao.numeroParcelas > 1 && (
                <span className="text-sm text-gray-500">
                  em {opcao.numeroParcelas}× de {formatCurrency(opcao.valorParcela)}
                </span>
              )}
            </div>

            {opcao.numeroParcelas === 1 && (
              <p className="text-xs text-gray-400 mt-1">Pague via Pix em até 72h</p>
            )}
            {opcao.numeroParcelas > 1 && (
              <p className="text-xs text-gray-400 mt-1">1ª parcela via Pix, demais via boleto</p>
            )}
          </button>
        )
      })}

      {/* CTA */}
      <Button
        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl"
        disabled={estado === 'loading'}
        onClick={aceitar}
      >
        {estado === 'loading' ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            Processando…
          </span>
        ) : (
          `Aceitar acordo — ${formatCurrency(opcaoSelecionada.valorTotal)}`
        )}
      </Button>

      <p className="text-xs text-center text-gray-400">
        Ao clicar você concorda com os termos de negociação da empresa.
      </p>
    </div>
  )
}
