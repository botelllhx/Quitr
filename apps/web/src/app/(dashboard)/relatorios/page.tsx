import { apiGet } from '@/lib/api'
import { ExportAgingButton } from './_components/export-aging-button'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AgingRow = {
  devedor: string
  cpfCnpj: string
  valorOriginal: number
  valorAtualizado: number
  dataVencimento: string
  diasAtraso: number
  faixa: string
  status: string
  scoreRecuperabilidade: number
  scoreContactabilidade: number
  ultimoContato: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

const FAIXAS_ORDER = ['0–30 dias', '31–60 dias', '61–90 dias', '90+ dias']
const FAIXAS_BG = ['bg-yellow-50', 'bg-orange-50', 'bg-red-100', 'bg-red-200']

function scoreColor(score: number) {
  if (score >= 70) return 'text-green-600'
  if (score >= 40) return 'text-yellow-600'
  return 'text-red-600'
}

const STATUS_LABELS: Record<string, string> = {
  em_aberto: 'Em aberto',
  em_negociacao: 'Em negociação',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default async function RelatoriosPage() {
  let rows: AgingRow[] = []
  try {
    const res = await apiGet<{ data: AgingRow[] }>('/relatorios/aging')
    rows = res.data
  } catch {
    // Sem dados
  }

  // Agrupa por faixa
  const porFaixa = FAIXAS_ORDER.map((faixa) => ({
    faixa,
    rows: rows.filter((r) => r.faixa === faixa),
  }))

  const totalValor = rows.reduce((s, r) => s + r.valorAtualizado, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Aging list — {rows.length} dívidas em aberto | Total: {formatCurrency(totalValor)}
          </p>
        </div>
        <ExportAgingButton />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center border rounded-md">
          Nenhuma dívida em aberto.
        </p>
      ) : (
        <div className="space-y-6">
          {porFaixa
            .filter((g) => g.rows.length > 0)
            .map((grupo, idx) => {
              const subtotal = grupo.rows.reduce((s, r) => s + r.valorAtualizado, 0)
              return (
                <section key={grupo.faixa} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">{grupo.faixa}</h2>
                    <span className="text-sm text-muted-foreground">
                      {grupo.rows.length} dívidas — {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className={`border-b ${FAIXAS_BG[idx]}`}>
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Devedor</th>
                          <th className="px-3 py-2 text-left font-medium">CPF/CNPJ</th>
                          <th className="px-3 py-2 text-right font-medium">V. Original</th>
                          <th className="px-3 py-2 text-right font-medium">V. Atualizado</th>
                          <th className="px-3 py-2 text-right font-medium">Vencimento</th>
                          <th className="px-3 py-2 text-right font-medium">Dias</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                          <th className="px-3 py-2 text-center font-medium">Score R</th>
                          <th className="px-3 py-2 text-center font-medium">Score C</th>
                          <th className="px-3 py-2 text-left font-medium">Último contato</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {grupo.rows.map((row, i) => (
                          <tr key={i} className={`hover:bg-muted/30 ${FAIXAS_BG[idx]} bg-opacity-40`}>
                            <td className="px-3 py-2 font-medium">{row.devedor}</td>
                            <td className="px-3 py-2 font-mono">{row.cpfCnpj || '—'}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.valorOriginal)}</td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {formatCurrency(row.valorAtualizado)}
                            </td>
                            <td className="px-3 py-2 text-right">{row.dataVencimento}</td>
                            <td className="px-3 py-2 text-right font-semibold">{row.diasAtraso}</td>
                            <td className="px-3 py-2">
                              {STATUS_LABELS[row.status] ?? row.status}
                            </td>
                            <td className={`px-3 py-2 text-center font-semibold ${scoreColor(row.scoreRecuperabilidade)}`}>
                              {row.scoreRecuperabilidade}
                            </td>
                            <td className={`px-3 py-2 text-center font-semibold ${scoreColor(row.scoreContactabilidade)}`}>
                              {row.scoreContactabilidade}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {row.ultimoContato || '—'}
                            </td>
                          </tr>
                        ))}
                        <tr className={`border-t font-semibold ${FAIXAS_BG[idx]}`}>
                          <td className="px-3 py-2" colSpan={3}>Subtotal</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(subtotal)}</td>
                          <td colSpan={6} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })}
        </div>
      )}
    </div>
  )
}
