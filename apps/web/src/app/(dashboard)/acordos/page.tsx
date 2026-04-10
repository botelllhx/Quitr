import Link from 'next/link'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Acordo = {
  id: string
  status: string
  valorTotal: number
  numeroParcelas: number
  tentativasRefatoracao: number
  createdAt: string
  divida: {
    id: string
    descricao: string | null
    dataVencimento: string
    devedor: { id: string; nome: string }
  }
  parcelas: { id: string; status: string; valor: number; vencimento: string }[]
}

type AcordosResponse = {
  data: Acordo[]
  meta: { total: number; page: number; pageSize: number; totalPages: number }
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

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendente:     { label: 'Pendente',     variant: 'secondary' },
  ativo:        { label: 'Ativo',        variant: 'default' },
  assinado:     { label: 'Assinado',     variant: 'default' },
  quitado:      { label: 'Quitado',      variant: 'outline' },
  inadimplente: { label: 'Inadimplente', variant: 'destructive' },
  cancelado:    { label: 'Cancelado',    variant: 'secondary' },
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function AcordosPage() {
  const res = await apiGet<AcordosResponse>('/acordos?limit=50')
  const acordos = res.data

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Acordos</h1>
        <p className="text-sm text-gray-500 mt-1">
          {res.meta.total} acordo{res.meta.total !== 1 ? 's' : ''} registrado{res.meta.total !== 1 ? 's' : ''}
        </p>
      </div>

      {acordos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          Nenhum acordo encontrado.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Devedor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dívida</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Valor total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Parcelas</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Criado em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {acordos.map((acordo) => {
                const cfg = STATUS_CONFIG[acordo.status] ?? { label: acordo.status, variant: 'secondary' as const }
                const parcelasPagas = acordo.parcelas.filter((p) => p.status === 'paga').length

                return (
                  <tr key={acordo.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {acordo.divida.devedor.nome}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {acordo.divida.descricao ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(acordo.valorTotal)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {parcelasPagas}/{acordo.numeroParcelas}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      {acordo.tentativasRefatoracao > 0 && (
                        <span className="ml-1 text-xs text-orange-500">
                          (ref. {acordo.tentativasRefatoracao}×)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(acordo.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/acordos/${acordo.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
