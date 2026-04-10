import { apiGet, apiPost } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { FecharMesButton } from './_components/fechar-mes-button'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ItemComissao = {
  cobradorId: string
  cobradorNome: string
  carteira: number
  valorRecuperado: number
  comissao: number
  percentual: number
  acordosFechados: number
  acordosQuebrados: number
}

type MetaEquipe = {
  mes: number
  ano: number
  totalRecuperado: number
  totalComissao: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

const MESES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ─── Componente ───────────────────────────────────────────────────────────────

export default async function ComissaoPage() {
  let itens: ItemComissao[] = []
  let meta: MetaEquipe = { mes: 1, ano: 2024, totalRecuperado: 0, totalComissao: 0 }

  try {
    const res = await apiGet<{ data: ItemComissao[]; meta: MetaEquipe }>('/comissao/equipe')
    itens = res.data
    meta = res.meta
  } catch {
    // Sem dados ainda
  }

  const maxRecuperado = Math.max(...itens.map((i) => i.valorRecuperado), 1)
  const agora = new Date()
  const ehDia1 = agora.getDate() === 1
  const mesAnterior = meta.mes === 1 ? 12 : meta.mes - 1
  const anoFechamento = meta.mes === 1 ? meta.ano - 1 : meta.ano

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Comissão da equipe</h1>
          <p className="text-sm text-muted-foreground">
            {MESES[meta.mes]} de {meta.ano} — atualizado em tempo real
          </p>
        </div>
        {ehDia1 && (
          <FecharMesButton mes={mesAnterior} ano={anoFechamento} />
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Total recuperado</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(meta.totalRecuperado)}</p>
          <p className="text-xs text-muted-foreground">{MESES[meta.mes]}</p>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Total comissão a pagar</p>
          <p className="text-2xl font-bold">{formatCurrency(meta.totalComissao)}</p>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Cobradores ativos</p>
          <p className="text-2xl font-bold">{itens.length}</p>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Acordos fechados</p>
          <p className="text-2xl font-bold">
            {itens.reduce((s, i) => s + i.acordosFechados, 0)}
          </p>
        </div>
      </div>

      <Separator />

      {/* Tabela da equipe */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Equipe</h2>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
            Nenhum cobrador com carteira atribuída neste mês.
          </p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Cobrador</th>
                  <th className="px-4 py-3 text-right font-medium">Carteira</th>
                  <th className="px-4 py-3 text-right font-medium">Recuperado</th>
                  <th className="px-4 py-3 text-right font-medium">Acordos</th>
                  <th className="px-4 py-3 text-right font-medium">Quebrados</th>
                  <th className="px-4 py-3 text-right font-medium">%</th>
                  <th className="px-4 py-3 text-right font-medium">Comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {itens.map((item) => (
                  <tr key={item.cobradorId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{item.cobradorNome}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item.carteira}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">
                      {formatCurrency(item.valorRecuperado)}
                    </td>
                    <td className="px-4 py-3 text-right">{item.acordosFechados}</td>
                    <td className="px-4 py-3 text-right">
                      {item.acordosQuebrados > 0 ? (
                        <span className="text-destructive font-medium">{item.acordosQuebrados}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="secondary">{item.percentual}%</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {formatCurrency(item.comissao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Separator />

      {/* Ranking visual */}
      {itens.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Ranking</h2>
          <div className="space-y-3">
            {itens.map((item, idx) => (
              <div key={item.cobradorId} className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <span className="w-32 truncate text-sm font-medium">{item.cobradorNome}</span>
                <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(item.valorRecuperado / maxRecuperado) * 100}%` }}
                  />
                </div>
                <span className="w-28 text-right text-sm font-semibold text-green-700">
                  {formatCurrency(item.valorRecuperado)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
