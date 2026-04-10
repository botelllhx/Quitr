import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

type DevedorCarteira = {
  id: string
  nome: string
  perfil: string
  scoreContactabilidade: number
  dividas: Array<{ valorAtualizado: number; score: number }>
}

type HistoricoItem = {
  id: string
  cobradorId: string
  valorRecuperado: number
  comissao: number
  percentual: number
  acordosFechados: number
  acordosQuebrados: number
  fechamento: { mes: number; ano: number; status: string }
}

type MinhaComissaoData = {
  minha: ItemComissao | null
  devedores: DevedorCarteira[]
  historico: HistoricoItem[]
  mes: number
  ano: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

const MESES = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

const MESES_FULL = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function scoreColor(score: number) {
  if (score >= 70) return 'text-green-600'
  if (score >= 40) return 'text-yellow-600'
  return 'text-red-600'
}

const PERFIL_LABELS: Record<string, string> = {
  pagador: 'Pagador',
  negligente: 'Negligente',
  negociador: 'Negociador',
  fantasma: 'Fantasma',
  reincidente: 'Reincidente',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default async function ComissaoIndividualPage({ params }: { params: { userId: string } }) {
  let dadosCobrador: MinhaComissaoData = {
    minha: null,
    devedores: [],
    historico: [],
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
  }

  try {
    // Para gestores visualizando outro cobrador, usamos o endpoint de equipe filtrado.
    // O endpoint /comissao/meu retorna apenas o cobrador logado — aqui reaproveitamos
    // para a página do próprio cobrador. Gestores veem esta página via link na tabela.
    const res = await apiGet<{ data: MinhaComissaoData }>('/comissao/meu')
    dadosCobrador = res.data
  } catch {
    // Sem dados
  }

  const { minha, devedores, historico, mes, ano } = dadosCobrador

  const totalEmAberto = devedores.reduce(
    (s, d) => s + d.dividas.reduce((ds, div) => ds + div.valorAtualizado, 0),
    0
  )

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/comissao" className="flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Comissão da equipe
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Minha carteira</h1>
        <p className="text-sm text-muted-foreground">
          {MESES_FULL[mes]} de {ano}
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Recuperado no mês</p>
          <p className="text-2xl font-bold text-green-700">
            {formatCurrency(minha?.valorRecuperado ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Comissão estimada</p>
          <p className="text-2xl font-bold">{formatCurrency(minha?.comissao ?? 0)}</p>
          {minha && (
            <p className="text-xs text-muted-foreground">taxa {minha.percentual}%</p>
          )}
        </div>
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Carteira</p>
          <p className="text-2xl font-bold">{devedores.length}</p>
          <p className="text-xs text-muted-foreground">devedores</p>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Total em aberto</p>
          <p className="text-2xl font-bold">{formatCurrency(totalEmAberto)}</p>
        </div>
      </div>

      {/* Acordos */}
      {minha && (
        <div className="flex gap-3">
          <div className="rounded-md border bg-green-50 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-green-700">{minha.acordosFechados}</p>
            <p className="text-xs text-muted-foreground">Acordos fechados</p>
          </div>
          <div className="rounded-md border bg-red-50 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-destructive">{minha.acordosQuebrados}</p>
            <p className="text-xs text-muted-foreground">Acordos quebrados</p>
          </div>
        </div>
      )}

      <Separator />

      {/* Minha carteira */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Devedores atribuídos</h2>
        {devedores.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border rounded-md">
            Nenhum devedor atribuído.
          </p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Devedor</th>
                  <th className="px-4 py-3 text-center font-medium">Perfil</th>
                  <th className="px-4 py-3 text-center font-medium">Score C</th>
                  <th className="px-4 py-3 text-right font-medium">Em aberto</th>
                  <th className="px-4 py-3 text-right font-medium">Dívidas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {devedores.map((d) => {
                  const emAberto = d.dividas.reduce((s, div) => s + div.valorAtualizado, 0)
                  return (
                    <tr key={d.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/devedores/${d.id}`}
                          className="font-medium hover:underline"
                        >
                          {d.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className="text-xs">
                          {PERFIL_LABELS[d.perfil] ?? d.perfil}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-medium ${scoreColor(d.scoreContactabilidade)}`}>
                          {d.scoreContactabilidade}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(emAberto)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {d.dividas.length}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Separator />

      {/* Histórico de comissões */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico de comissões</h2>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border rounded-md">
            Nenhum fechamento registrado.
          </p>
        ) : (
          <div className="space-y-2">
            {historico.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-md border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {MESES[h.fechamento.mes]}/{h.fechamento.ano}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.acordosFechados} acordos — {h.acordosQuebrados} quebrados
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(h.comissao)}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.percentual}% de {formatCurrency(h.valorRecuperado)}
                  </p>
                </div>
                <Badge
                  variant={h.fechamento.status === 'fechado' ? 'default' : 'secondary'}
                  className="ml-4"
                >
                  {h.fechamento.status === 'fechado' ? 'Fechado' : 'Em aberto'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
