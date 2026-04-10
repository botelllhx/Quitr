import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DashboardCharts } from './_components/dashboard-charts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AgingFaixa = { faixa: string; quantidade: number; valor: number }
type CanalStats = { enviados: number; respondidos: number; taxaResposta: number }

type Metricas = {
  totalEmAberto: { quantidade: number; valor: number }
  recuperadoMes: { quantidade: number; valor: number; variacaoPercMesAnterior: number }
  taxaRecuperacao: number
  acordosAtivos: { quantidade: number; valor: number }
  devedoresPorPerfil: Record<string, number>
  evolucaoMensal: Array<{ mes: string; recuperado: number; emAberto: number }>
  agingList: AgingFaixa[]
  disparosPorCanal: Record<string, CanalStats>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

const PERFIL_LABELS: Record<string, string> = {
  pagador: 'Pagador',
  negligente: 'Negligente',
  negociador: 'Negociador',
  fantasma: 'Fantasma',
  reincidente: 'Reincidente',
}

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  sms: 'SMS',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  let metricas: Metricas | null = null

  try {
    const res = await apiGet<{ data: Metricas }>('/dashboard/metricas')
    metricas = res.data
  } catch {
    // Exibe zeros
  }

  const m = metricas ?? {
    totalEmAberto: { quantidade: 0, valor: 0 },
    recuperadoMes: { quantidade: 0, valor: 0, variacaoPercMesAnterior: 0 },
    taxaRecuperacao: 0,
    acordosAtivos: { quantidade: 0, valor: 0 },
    devedoresPorPerfil: {},
    evolucaoMensal: [],
    agingList: [],
    disparosPorCanal: {},
  }

  const variacao = m.recuperadoMes.variacaoPercMesAnterior
  const VariacaoIcon = variacao > 0 ? TrendingUp : variacao < 0 ? TrendingDown : Minus
  const variacaoColor = variacao > 0 ? 'text-green-600' : variacao < 0 ? 'text-red-600' : 'text-muted-foreground'

  const totalAgingValor = m.agingList.reduce((s, f) => s + f.valor, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da recuperação de crédito</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Total em aberto</p>
          <p className="text-2xl font-bold">{formatCurrency(m.totalEmAberto.valor)}</p>
          <p className="text-xs text-muted-foreground">{m.totalEmAberto.quantidade} dívidas</p>
        </div>

        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Recuperado no mês</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(m.recuperadoMes.valor)}</p>
          <div className={`flex items-center gap-1 text-xs ${variacaoColor}`}>
            <VariacaoIcon className="h-3 w-3" />
            <span>{Math.abs(variacao)}% vs mês anterior</span>
          </div>
        </div>

        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Taxa de recuperação</p>
          <p className="text-2xl font-bold">{m.taxaRecuperacao}%</p>
          <p className="text-xs text-muted-foreground">dívidas quitadas este mês</p>
        </div>

        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Acordos ativos</p>
          <p className="text-2xl font-bold">{m.acordosAtivos.quantidade}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(m.acordosAtivos.valor)}</p>
        </div>
      </div>

      {/* Charts (client component) */}
      <DashboardCharts
        evolucaoMensal={m.evolucaoMensal}
        devedoresPorPerfil={m.devedoresPorPerfil}
      />

      <Separator />

      {/* Aging list */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Aging list — dívidas em aberto</h2>
        {m.agingList.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
            Nenhuma dívida em aberto.
          </p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Faixa</th>
                  <th className="px-4 py-3 text-right font-medium">Qtd</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 text-right font-medium">% do total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {m.agingList.map((faixa, idx) => {
                  const pct = totalAgingValor === 0 ? 0 : Math.round((faixa.valor / totalAgingValor) * 100)
                  const bgColors = ['bg-yellow-50', 'bg-orange-50', 'bg-red-50', 'bg-red-100']
                  return (
                    <tr key={faixa.faixa} className={bgColors[idx]}>
                      <td className="px-4 py-3 font-medium">{faixa.faixa}</td>
                      <td className="px-4 py-3 text-right">{faixa.quantidade}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(faixa.valor)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-muted-foreground w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t font-semibold bg-muted/30">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">
                    {m.agingList.reduce((s, f) => s + f.quantidade, 0)}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalAgingValor)}</td>
                  <td className="px-4 py-3 text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Separator />

      {/* Canais */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Canais — últimos 30 dias</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {['whatsapp', 'email', 'sms'].map((canal) => {
            const stats = (m.disparosPorCanal[canal] as CanalStats | undefined) ?? {
              enviados: 0,
              respondidos: 0,
              taxaResposta: 0,
            }
            return (
              <div key={canal} className="rounded-lg border bg-card px-5 py-4">
                <p className="text-sm font-semibold">{CANAL_LABELS[canal]}</p>
                <p className="text-2xl font-bold mt-1">{stats.enviados}</p>
                <p className="text-xs text-muted-foreground">disparos enviados</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{stats.respondidos} respostas</span>
                  <Badge variant={stats.taxaResposta >= 20 ? 'default' : 'secondary'}>
                    {stats.taxaResposta}% resposta
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Devedores por perfil */}
      {Object.keys(m.devedoresPorPerfil).length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Perfis comportamentais</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(m.devedoresPorPerfil).map(([perfil, count]) => (
                <div key={perfil} className="rounded-md border bg-card px-4 py-3 text-center min-w-24">
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{PERFIL_LABELS[perfil] ?? perfil}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
