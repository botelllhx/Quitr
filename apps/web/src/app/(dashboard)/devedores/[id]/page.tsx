import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Phone, Mail, MapPin, ShieldOff } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Disparo = {
  id: string
  canal: 'whatsapp' | 'email' | 'sms'
  conteudo: string
  status: 'pendente' | 'enviado' | 'entregue' | 'lido' | 'respondido' | 'falhou'
  createdAt: string
  enviadoAt: string | null
  lidoAt: string | null
  respondidoAt: string | null
  erroMsg: string | null
  etapa: { ordem: number; canal: string; acao: string; diaOffset: number } | null
}

type Divida = {
  id: string
  descricao: string | null
  valorOriginal: number
  valorAtualizado: number
  dataVencimento: string
  status: string
  score: number
  disparos: Disparo[]
  acordos: Array<{
    id: string
    status: string
    valorTotal: number
    numeroParcelas: number
    assinadoAt: string | null
  }>
}

type Devedor = {
  id: string
  nome: string
  cpfCnpj: string | null
  email: string | null
  telefone: string | null
  tipo: 'PF' | 'PJ'
  perfil: 'pagador' | 'negligente' | 'negociador' | 'fantasma'
  optOut: boolean
  createdAt: string
  updatedAt: string
  dividas: Divida[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCpfCnpj(value: string | null) {
  if (!value) return null
  const d = value.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return value
}

const PERFIL_LABELS: Record<Devedor['perfil'], string> = {
  pagador: 'Pagador',
  negligente: 'Negligente',
  negociador: 'Negociador',
  fantasma: 'Fantasma',
}

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  sms: 'SMS',
}

const STATUS_DIVIDA_LABELS: Record<string, string> = {
  em_aberto: 'Em aberto',
  em_negociacao: 'Em negociação',
  acordo_firmado: 'Acordo firmado',
  quitada: 'Quitada',
  protestada: 'Protestada',
  negativada: 'Negativada',
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-green-600'
  if (score >= 40) return 'text-yellow-600'
  return 'text-red-600'
}

function scoreBg(score: number) {
  if (score >= 70) return 'bg-green-50 border-green-200'
  if (score >= 40) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

function dividaStatusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'em_aberto': return 'default'
    case 'em_negociacao': return 'secondary'
    case 'acordo_firmado': return 'secondary'
    case 'quitada': return 'outline'
    case 'protestada':
    case 'negativada': return 'destructive'
    default: return 'outline'
  }
}

function disparoStatusColor(status: string) {
  switch (status) {
    case 'respondido': return 'text-green-600'
    case 'lido': return 'text-blue-600'
    case 'entregue': return 'text-sky-600'
    case 'enviado': return 'text-gray-600'
    case 'pendente': return 'text-yellow-600'
    case 'falhou': return 'text-red-600'
    default: return 'text-gray-500'
  }
}

const STATUS_DISPARO_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  entregue: 'Entregue',
  lido: 'Lido',
  respondido: 'Respondido',
  falhou: 'Falhou',
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default async function DevedorPerfilPage({
  params,
}: {
  params: { id: string }
}) {
  let devedor: Devedor
  try {
    const res = await apiGet<{ data: Devedor }>(`/devedores/${params.id}`)
    devedor = res.data
  } catch {
    notFound()
  }

  // Flatten e ordena todos os disparos por data desc
  const allDisparos = devedor.dividas
    .flatMap((d) =>
      d.disparos.map((disp) => ({ ...disp, dividaId: d.id, dividaDesc: d.descricao }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50)

  const totalEmAberto = devedor.dividas
    .filter((d) => d.status === 'em_aberto' || d.status === 'em_negociacao')
    .reduce((sum, d) => sum + d.valorAtualizado, 0)

  const avgScore =
    devedor.dividas.length > 0
      ? Math.round(devedor.dividas.reduce((s, d) => s + d.score, 0) / devedor.dividas.length)
      : 0

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/devedores" className="flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Devedores
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{devedor.nome}</h1>
            <Badge variant="secondary">{devedor.tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
            <Badge variant="outline">{PERFIL_LABELS[devedor.perfil]}</Badge>
            {devedor.optOut && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <ShieldOff className="h-3 w-3" /> Opt-out
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {devedor.cpfCnpj && <span>{formatCpfCnpj(devedor.cpfCnpj)}</span>}
            {devedor.telefone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {devedor.telefone}
              </span>
            )}
            {devedor.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> {devedor.email}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cadastrado em {formatDate(devedor.createdAt)}
          </p>
        </div>

        {/* Score + totais */}
        <div className="flex gap-3">
          <div className={`rounded-lg border px-5 py-3 text-center ${scoreBg(avgScore)}`}>
            <p className="text-xs font-medium text-muted-foreground">Score</p>
            <p className={`text-3xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</p>
          </div>
          <div className="rounded-lg border bg-card px-5 py-3 text-center">
            <p className="text-xs font-medium text-muted-foreground">Total em aberto</p>
            <p className="text-xl font-bold">{formatCurrency(totalEmAberto)}</p>
          </div>
          <div className="rounded-lg border bg-card px-5 py-3 text-center">
            <p className="text-xs font-medium text-muted-foreground">Dívidas</p>
            <p className="text-xl font-bold">{devedor.dividas.length}</p>
          </div>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Dívidas */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dívidas</h2>
            <Button size="sm" variant="outline" disabled>
              + Adicionar dívida
            </Button>
          </div>

          {devedor.dividas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-md">
              Nenhuma dívida cadastrada.
            </p>
          ) : (
            <div className="space-y-2">
              {devedor.dividas.map((divida) => (
                <div key={divida.id} className="rounded-md border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {divida.descricao ?? `Dívida #${divida.id.slice(-6)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Venc. {formatDate(divida.dataVencimento)}
                      </p>
                    </div>
                    <Badge variant={dividaStatusVariant(divida.status)}>
                      {STATUS_DIVIDA_LABELS[divida.status] ?? divida.status}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Original: {formatCurrency(divida.valorOriginal)}
                    </span>
                    <span className="font-medium">
                      Atualizado: {formatCurrency(divida.valorAtualizado)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Score: <span className={scoreColor(divida.score)}>{divida.score}</span></span>
                    <span>{divida.disparos.length} disparo{divida.disparos.length !== 1 ? 's' : ''}</span>
                  </div>

                  {divida.acordos[0] && (
                    <div className="rounded bg-muted px-3 py-2 text-xs">
                      Acordo: {formatCurrency(divida.acordos[0].valorTotal)} em{' '}
                      {divida.acordos[0].numeroParcelas}x —{' '}
                      <Badge variant="outline" className="text-xs py-0">
                        {divida.acordos[0].status}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Timeline de disparos */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Histórico de contatos{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({allDisparos.length})
            </span>
          </h2>

          {allDisparos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-md">
              Nenhum contato registrado.
            </p>
          ) : (
            <ol className="relative border-l border-border ml-3 space-y-4">
              {allDisparos.map((disp) => (
                <li key={disp.id} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-border" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDateTime(disp.createdAt)}</span>
                      <Badge variant="outline" className="text-xs py-0">
                        {CANAL_LABELS[disp.canal] ?? disp.canal}
                      </Badge>
                      <span className={`font-medium ${disparoStatusColor(disp.status)}`}>
                        {STATUS_DISPARO_LABELS[disp.status] ?? disp.status}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-3 rounded bg-muted px-3 py-2 font-mono text-xs">
                      {disp.conteudo}
                    </p>
                    {disp.erroMsg && (
                      <p className="text-xs text-destructive">Erro: {disp.erroMsg}</p>
                    )}
                    {disp.respondidoAt && (
                      <p className="text-xs text-green-600">
                        Respondido em {formatDateTime(disp.respondidoAt)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
