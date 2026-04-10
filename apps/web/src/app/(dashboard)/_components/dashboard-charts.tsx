'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

type EvolucaoItem = { mes: string; recuperado: number; emAberto: number }

interface DashboardChartsProps {
  evolucaoMensal: EvolucaoItem[]
  devedoresPorPerfil: Record<string, number>
}

function formatCurrencyShort(cents: number) {
  const brl = cents / 100
  if (brl >= 1_000_000) return `R$${(brl / 1_000_000).toFixed(1)}M`
  if (brl >= 1_000) return `R$${(brl / 1_000).toFixed(0)}k`
  return `R$${brl.toFixed(0)}`
}

const PERFIL_COLORS: Record<string, string> = {
  pagador: '#22c55e',
  negligente: '#f59e0b',
  negociador: '#3b82f6',
  fantasma: '#94a3b8',
  reincidente: '#ef4444',
}

const PERFIL_LABELS: Record<string, string> = {
  pagador: 'Pagador',
  negligente: 'Negligente',
  negociador: 'Negociador',
  fantasma: 'Fantasma',
  reincidente: 'Reincidente',
}

export function DashboardCharts({ evolucaoMensal, devedoresPorPerfil }: DashboardChartsProps) {
  const perfilData = Object.entries(devedoresPorPerfil).map(([perfil, value]) => ({
    name: PERFIL_LABELS[perfil] ?? perfil,
    value,
    perfil,
  }))

  const chartData = evolucaoMensal.map((item) => ({
    ...item,
    recuperadoBrl: item.recuperado / 100,
    emAbertoBrl: item.emAberto / 100,
  }))

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Bar chart — evolução mensal */}
      <div className="rounded-lg border bg-card px-5 py-4 space-y-3">
        <h2 className="text-base font-semibold">Evolução mensal</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem dados ainda.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => `R$${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="recuperadoBrl" name="Recuperado" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="emAbertoBrl" name="Em aberto" fill="#94a3b8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Donut chart — perfis */}
      <div className="rounded-lg border bg-card px-5 py-4 space-y-3">
        <h2 className="text-base font-semibold">Perfis comportamentais</h2>
        {perfilData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem dados ainda.</p>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={perfilData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {perfilData.map((entry) => (
                    <Cell
                      key={entry.perfil}
                      fill={PERFIL_COLORS[entry.perfil] ?? '#94a3b8'}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} devedores`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {perfilData.map((entry) => (
                <div key={entry.perfil} className="flex items-center gap-2 text-xs">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PERFIL_COLORS[entry.perfil] ?? '#94a3b8' }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                  <span className="font-semibold">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
