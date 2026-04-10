import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Parcela = {
  id: string
  numero: number
  valor: number
  vencimento: string
  status: string
  pagoEm: string | null
}

type Cobranca = {
  id: string
  tipo: string
  status: string
  valor: number
  createdAt: string
  linkPagamento: string | null
}

type AcordoDetalhe = {
  id: string
  status: string
  valorTotal: number
  numeroParcelas: number
  tentativasRefatoracao: number
  createdAt: string
  inadimplenteAt: string | null
  acordoToken: string | null
  acordoAnteriorId: string | null
  divida: {
    id: string
    descricao: string | null
    valorOriginal: number
    valorAtualizado: number
    dataVencimento: string
    devedor: {
      id: string
      nome: string
      email: string | null
      telefone: string | null
      cpfCnpj: string | null
    }
  }
  parcelas: Parcela[]
  cobrancas: Cobranca[]
  acordoAnterior: {
    id: string
    status: string
    valorTotal: number
    createdAt: string
    tentativasRefatoracao: number
  } | null
  acordosFilhos: {
    id: string
    status: string
    valorTotal: number
    createdAt: string
  }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(centavos: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    centavos / 100
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ACORDO_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendente:     { label: 'Pendente',     variant: 'secondary' },
  ativo:        { label: 'Ativo',        variant: 'default' },
  assinado:     { label: 'Assinado',     variant: 'default' },
  quitado:      { label: 'Quitado',      variant: 'outline' },
  inadimplente: { label: 'Inadimplente', variant: 'destructive' },
  cancelado:    { label: 'Cancelado',    variant: 'secondary' },
}

const PARCELA_STATUS: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente',  color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  paga:     { label: 'Paga',      color: 'text-green-700 bg-green-50 border-green-200' },
  vencida:  { label: 'Vencida',   color: 'text-red-700 bg-red-50 border-red-200' },
  cancelada:{ label: 'Cancelada', color: 'text-gray-500 bg-gray-50 border-gray-200' },
}

// ─── Componentes de linha do tempo ────────────────────────────────────────────

function TimelineItem({
  icon,
  title,
  subtitle,
  date,
  color = 'bg-gray-400',
  children,
}: {
  icon: string
  title: string
  subtitle?: string
  date: string
  color?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${color}`}>
          {icon}
        </div>
        <div className="w-px flex-1 bg-gray-200 mt-1" />
      </div>
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-gray-900 text-sm">{title}</p>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{date}</span>
        </div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function AcordoDetalhePage({ params }: { params: { id: string } }) {
  let acordo: AcordoDetalhe

  try {
    const res = await apiGet<{ data: AcordoDetalhe }>(`/acordos/${params.id}`)
    acordo = res.data
  } catch {
    notFound()
  }

  const cfg = ACORDO_STATUS[acordo.status] ?? { label: acordo.status, variant: 'secondary' as const }
  const parcelasPagas = acordo.parcelas.filter((p) => p.status === 'paga').length
  const valorPago = acordo.parcelas
    .filter((p) => p.status === 'paga')
    .reduce((acc, p) => acc + p.valor, 0)
  const saldoDevedor = acordo.valorTotal - valorPago

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/acordos" className="text-sm text-gray-400 hover:text-gray-600">
              ← Acordos
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            Acordo de {acordo.divida.devedor.nome}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {acordo.divida.descricao ?? 'Dívida sem descrição'} ·{' '}
            <span className="font-mono text-xs">{acordo.id.slice(0, 8)}…</span>
          </p>
        </div>
        <Badge variant={cfg.variant} className="shrink-0">
          {cfg.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">

          {/* Cards de resumo */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">Valor total</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(acordo.valorTotal)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">Pago</p>
              <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(valorPago)}</p>
              <p className="text-xs text-gray-400">{parcelasPagas}/{acordo.numeroParcelas} parcelas</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">Saldo devedor</p>
              <p className={`text-lg font-bold mt-1 ${saldoDevedor > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {formatCurrency(saldoDevedor)}
              </p>
            </div>
          </div>

          {/* Parcelas */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">Parcelas</h2>
              <span className="text-xs text-gray-500">{parcelasPagas}/{acordo.numeroParcelas} pagas</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">#</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Valor</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Vencimento</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Pago em</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {acordo.parcelas.map((parcela) => {
                  const ps = PARCELA_STATUS[parcela.status] ?? { label: parcela.status, color: 'text-gray-500 bg-gray-50 border-gray-200' }
                  const hoje = new Date()
                  const venc = new Date(parcela.vencimento)
                  const atrasada = parcela.status === 'pendente' && venc < hoje

                  return (
                    <tr key={parcela.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-500">{parcela.numero}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                        {formatCurrency(parcela.valor)}
                      </td>
                      <td className={`px-4 py-2.5 ${atrasada ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                        {formatDate(parcela.vencimento)}
                        {atrasada && <span className="ml-1 text-xs">(atrasada)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {parcela.pagoEm ? formatDate(parcela.pagoEm) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ps.color}`}>
                          {ps.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cobranças */}
          {acordo.cobrancas.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">Cobranças geradas</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Tipo</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Valor</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Criado em</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {acordo.cobrancas.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 capitalize text-gray-700">{c.tipo}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                        {formatCurrency(c.valor)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium ${
                          c.status === 'pago' ? 'text-green-700' :
                          c.status === 'pendente' ? 'text-yellow-600' : 'text-gray-500'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {c.linkPagamento && (
                          <a
                            href={c.linkPagamento}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Ver boleto →
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Coluna lateral — Timeline + Info */}
        <div className="space-y-6">

          {/* Dados do devedor */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 text-sm">Devedor</h2>
            <div className="space-y-1 text-sm">
              <Link
                href={`/devedores/${acordo.divida.devedor.id}`}
                className="font-medium text-blue-600 hover:underline block"
              >
                {acordo.divida.devedor.nome}
              </Link>
              {acordo.divida.devedor.cpfCnpj && (
                <p className="text-gray-500">{acordo.divida.devedor.cpfCnpj}</p>
              )}
              {acordo.divida.devedor.email && (
                <p className="text-gray-500">{acordo.divida.devedor.email}</p>
              )}
              {acordo.divida.devedor.telefone && (
                <p className="text-gray-500">{acordo.divida.devedor.telefone}</p>
              )}
            </div>
            <div className="pt-2 border-t border-gray-100 text-sm space-y-1">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Dívida</p>
              <p className="text-gray-700">{acordo.divida.descricao ?? '—'}</p>
              <p className="text-gray-500">
                Venc. original: {formatDate(acordo.divida.dataVencimento)}
              </p>
              <p className="text-gray-500">
                Valor original: {formatCurrency(acordo.divida.valorOriginal)}
              </p>
            </div>
            {acordo.tentativasRefatoracao > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-full">
                  ⚠ {acordo.tentativasRefatoracao} refatoração{acordo.tentativasRefatoracao !== 1 ? 'ões' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Linha do tempo */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Linha do tempo</h2>
            <div className="space-y-0">

              {/* Acordo criado */}
              <TimelineItem
                icon="+"
                title="Acordo criado"
                subtitle={`${acordo.numeroParcelas}× de ${formatCurrency(Math.round(acordo.valorTotal / acordo.numeroParcelas))}`}
                date={formatDateTime(acordo.createdAt)}
                color="bg-blue-500"
              />

              {/* Acordo anterior (refatoração) */}
              {acordo.acordoAnterior && (
                <TimelineItem
                  icon="↩"
                  title="Refatorado de acordo anterior"
                  subtitle={`Valor original: ${formatCurrency(acordo.acordoAnterior.valorTotal)}`}
                  date={formatDateTime(acordo.acordoAnterior.createdAt)}
                  color="bg-orange-500"
                >
                  <Link
                    href={`/acordos/${acordo.acordoAnterior.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Ver acordo original →
                  </Link>
                </TimelineItem>
              )}

              {/* Parcelas pagas */}
              {acordo.parcelas
                .filter((p) => p.status === 'paga' && p.pagoEm)
                .map((p) => (
                  <TimelineItem
                    key={p.id}
                    icon="✓"
                    title={`Parcela ${p.numero} paga`}
                    subtitle={formatCurrency(p.valor)}
                    date={formatDateTime(p.pagoEm!)}
                    color="bg-green-500"
                  />
                ))}

              {/* Quebra do acordo */}
              {acordo.inadimplenteAt && (
                <TimelineItem
                  icon="!"
                  title="Acordo quebrado"
                  subtitle="Status alterado para inadimplente"
                  date={formatDateTime(acordo.inadimplenteAt)}
                  color="bg-red-500"
                />
              )}

              {/* Novo acordo gerado */}
              {acordo.acordosFilhos.length > 0 && acordo.acordosFilhos.map((filho) => (
                <TimelineItem
                  key={filho.id}
                  icon="↪"
                  title="Novo acordo gerado"
                  subtitle={`Saldo refatorado: ${formatCurrency(filho.valorTotal)}`}
                  date={formatDateTime(filho.createdAt)}
                  color="bg-orange-500"
                >
                  <Link
                    href={`/acordos/${filho.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Ver novo acordo →
                  </Link>
                </TimelineItem>
              ))}

              {/* Quitação */}
              {acordo.status === 'quitado' && (
                <TimelineItem
                  icon="★"
                  title="Acordo quitado"
                  subtitle="Todas as parcelas foram pagas"
                  date={
                    acordo.parcelas
                      .filter((p) => p.pagoEm)
                      .sort((a, b) => new Date(b.pagoEm!).getTime() - new Date(a.pagoEm!).getTime())[0]
                      ?.pagoEm
                      ? formatDateTime(
                          acordo.parcelas
                            .filter((p) => p.pagoEm)
                            .sort((a, b) => new Date(b.pagoEm!).getTime() - new Date(a.pagoEm!).getTime())[0].pagoEm!
                        )
                      : ''
                  }
                  color="bg-emerald-600"
                />
              )}

              {/* Cancelamento */}
              {acordo.status === 'cancelado' && (
                <TimelineItem
                  icon="×"
                  title="Acordo cancelado"
                  subtitle=""
                  date=""
                  color="bg-gray-400"
                />
              )}
            </div>
          </div>

          {/* Portal do devedor */}
          {acordo.acordoToken && acordo.status !== 'quitado' && acordo.status !== 'cancelado' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-medium text-blue-700 mb-1">Link do portal</p>
              <p className="text-xs text-blue-600 break-all font-mono">
                {`/acordo/${acordo.acordoToken}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
