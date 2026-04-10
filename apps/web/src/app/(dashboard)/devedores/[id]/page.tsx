import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Phone, Mail, ShieldOff, TrendingUp, Users, Zap, AlertTriangle } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BureauSection } from './_components/bureau-section'

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
  perfil: 'pagador' | 'negligente' | 'negociador' | 'fantasma' | 'reincidente'
  optOut: boolean
  scoreContactabilidade: number
  acordosQuebrados: number
  createdAt: string
  updatedAt: string
  dividas: Divida[]
}

type Contato = {
  id: string
  valor: string
  tipo: string
  fonte: string
  status: string
  scoreConfianca: number | null
}

type RecomendacaoAcao =
  | 'regua_leve_acordo_imediato'
  | 'buscar_contato_bureau'
  | 'regua_rapida_negativar'
  | 'vender_carteira'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatCpfCnpj(value: string | null) {
  if (!value) return null
  const d = value.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return value
}

function recomendarAcao(scoreR: number, scoreC: number): RecomendacaoAcao {
  const altoR = scoreR >= 50
  const altoC = scoreC >= 50
  if (altoR && altoC) return 'regua_leve_acordo_imediato'
  if (altoR && !altoC) return 'buscar_contato_bureau'
  if (!altoR && altoC) return 'regua_rapida_negativar'
  return 'vender_carteira'
}

const RECOMENDACAO: Record<RecomendacaoAcao, {
  label: string; desc: string; color: string; Icon: (props: { className?: string }) => JSX.Element
}> = {
  regua_leve_acordo_imediato: {
    label: 'Acordo imediato',
    desc: 'Alta recuperabilidade e contactabilidade. Propor acordo com desconto progressivo.',
    color: 'text-green-700 bg-green-50 border-green-200',
    Icon: TrendingUp,
  },
  buscar_contato_bureau: {
    label: 'Buscar novo contato',
    desc: 'Boa chance de receber, mas difícil de contatar. Vale consultar bureau de contatos.',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    Icon: Users,
  },
  regua_rapida_negativar: {
    label: 'Régua rápida + negativar',
    desc: 'Fácil de contatar, mas baixa recuperabilidade. Pressionar e negativar rapidamente.',
    color: 'text-orange-700 bg-orange-50 border-orange-200',
    Icon: Zap,
  },
  vender_carteira: {
    label: 'Vender carteira',
    desc: 'Baixa recuperabilidade e contactabilidade. Custo de cobrança > retorno estimado.',
    color: 'text-red-700 bg-red-50 border-red-200',
    Icon: AlertTriangle,
  },
}

const PERFIL_LABELS: Record<Devedor['perfil'], string> = {
  pagador: 'Pagador',
  negligente: 'Negligente',
  negociador: 'Negociador',
  fantasma: 'Fantasma',
  reincidente: 'Reincidente',
}

const PERFIL_VARIANT: Record<Devedor['perfil'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pagador: 'default',
  negligente: 'secondary',
  negociador: 'secondary',
  fantasma: 'outline',
  reincidente: 'destructive',
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

const STATUS_DISPARO_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  entregue: 'Entregue',
  lido: 'Lido',
  respondido: 'Respondido',
  falhou: 'Falhou',
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

function scoreStroke(score: number) {
  if (score >= 70) return '#16a34a'
  if (score >= 40) return '#ca8a04'
  return '#dc2626'
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

// ─── Gauge semicircular ───────────────────────────────────────────────────────

function ScoreGauge({ score, label }: { score: number; label: string }) {
  // Semicircle: r=40, centro (50,50), arco de 180° (esquerda para direita)
  const r = 40
  const cx = 50
  const cy = 50
  const circumference = Math.PI * r  // semicircle arc length
  const filled = (score / 100) * circumference
  const stroke = scoreStroke(score)

  // Track arc: M 10,50 A 40,40 0 0,1 90,50
  // Gauge goes left to right (180deg sweep)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width="100" height="58" viewBox="0 8 100 58">
          {/* Track */}
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Filled */}
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
          {/* Score text */}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fontSize="18"
            fontWeight="700"
            fill={stroke}
          >
            {score}
          </text>
        </svg>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

// ─── Fator row ────────────────────────────────────────────────────────────────

function FatorRow({ label, pontos, peso }: { label: string; pontos: number; peso: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 shrink-0 text-muted-foreground">{label}</div>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pontos}%`,
            backgroundColor: pontos >= 70 ? '#16a34a' : pontos >= 40 ? '#ca8a04' : '#dc2626',
          }}
        />
      </div>
      <div className={`w-8 text-right font-mono font-medium ${scoreColor(pontos)}`}>{pontos}</div>
      <div className="w-10 text-right text-muted-foreground">{peso}</div>
    </div>
  )
}

// ─── Compute factors from devedor data ───────────────────────────────────────

function computeRecuperabilidadeFactors(dividas: Divida[]): {
  diasAtraso: number
  respondeu: number
  tentativas: number
  historico: number
  valor: number
} {
  if (dividas.length === 0) {
    return { diasAtraso: 10, respondeu: 20, tentativas: 100, historico: 50, valor: 70 }
  }

  const hoje = new Date()

  // Use a dívida com maior valor em aberto como referência principal
  const dividaRef = dividas
    .filter((d) => d.status === 'em_aberto' || d.status === 'em_negociacao')
    .sort((a, b) => b.valorAtualizado - a.valorAtualizado)[0] ?? dividas[0]!

  const diasAtrasoNum = Math.max(
    0,
    Math.floor((hoje.getTime() - new Date(dividaRef.dataVencimento).getTime()) / (1000 * 60 * 60 * 24))
  )
  const f1 =
    diasAtrasoNum <= 15 ? 100
    : diasAtrasoNum <= 30 ? 80
    : diasAtrasoNum <= 60 ? 50
    : diasAtrasoNum <= 90 ? 30
    : 10

  const todosDisparos = dividas.flatMap((d) => d.disparos)
  const ultimaResposta = todosDisparos.find((d) => d.status === 'respondido')
  let f2 = 20
  if (ultimaResposta?.respondidoAt) {
    const dias = Math.floor(
      (hoje.getTime() - new Date(ultimaResposta.respondidoAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    f2 = dias <= 7 ? 100 : dias <= 30 ? 70 : 20
  }

  const semResposta = dividaRef.disparos.filter((d) =>
    ['enviado', 'entregue', 'lido'].includes(d.status)
  ).length
  const f3 = semResposta <= 2 ? 100 : semResposta <= 5 ? 60 : 20

  const quitouAntes = dividas.some((d) => d.acordos.some((a) => a.status === 'quitado'))
  const f4 = quitouAntes ? 100 : 50 // acordosQuebrados handled by parent

  const valorBRL = dividaRef.valorAtualizado / 100
  const f5 =
    valorBRL < 500 ? 90
    : valorBRL < 2000 ? 70
    : valorBRL < 10000 ? 50
    : 30

  return { diasAtraso: f1, respondeu: f2, tentativas: f3, historico: f4, valor: f5 }
}

function computeContactabilidadeFactors(devedor: Devedor): {
  totalContatos: number
  percAtivos: number
  ultimoRespondeu: number
  diasSemContato: number
} {
  const totalContatos = [devedor.telefone, devedor.email].filter(Boolean).length
  const f1 = totalContatos === 0 ? 10 : totalContatos === 1 ? 50 : 80

  const todosDisparos = devedor.dividas.flatMap((d) => d.disparos)
  const temResposta = todosDisparos.some((d) => d.status === 'respondido')
  const f3 = temResposta ? 100 : 0

  const ultimoDisparo = todosDisparos
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

  let f4 = 10
  if (ultimoDisparo) {
    const dias = Math.floor(
      (Date.now() - new Date(ultimoDisparo.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    f4 = dias < 7 ? 100 : dias < 30 ? 60 : dias < 60 ? 30 : 10
  }

  return { totalContatos: f1, percAtivos: totalContatos > 0 ? 80 : 0, ultimoRespondeu: f3, diasSemContato: f4 }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default async function DevedorPerfilPage({ params }: { params: { id: string } }) {
  let devedor: Devedor
  let contatos: Contato[] = []
  try {
    const [devedorRes, contatosRes] = await Promise.all([
      apiGet<{ data: Devedor }>(`/devedores/${params.id}`),
      apiGet<{ data: Contato[] }>(`/devedores/${params.id}/contatos`).catch(() => ({ data: [] })),
    ])
    devedor = devedorRes.data
    contatos = contatosRes.data
  } catch {
    notFound()
  }

  const allDisparos = devedor.dividas
    .flatMap((d) => d.disparos.map((disp) => ({ ...disp, dividaId: d.id, dividaDesc: d.descricao })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50)

  const totalEmAberto = devedor.dividas
    .filter((d) => d.status === 'em_aberto' || d.status === 'em_negociacao')
    .reduce((sum, d) => sum + d.valorAtualizado, 0)

  const avgScoreR =
    devedor.dividas.length > 0
      ? Math.round(devedor.dividas.reduce((s, d) => s + d.score, 0) / devedor.dividas.length)
      : 0

  const scoreC = devedor.scoreContactabilidade
  const recomendacao = recomendarAcao(avgScoreR, scoreC)
  const rec = RECOMENDACAO[recomendacao]
  const RecIcon = rec.Icon

  const fatoresR = computeRecuperabilidadeFactors(devedor.dividas)
  const fatoresC = computeContactabilidadeFactors(devedor)

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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{devedor.nome}</h1>
            <Badge variant="secondary">{devedor.tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
            <Badge variant={PERFIL_VARIANT[devedor.perfil]}>{PERFIL_LABELS[devedor.perfil]}</Badge>
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
          <p className="text-xs text-muted-foreground">Cadastrado em {formatDate(devedor.createdAt)}</p>
        </div>

        {/* Totais rápidos */}
        <div className="flex gap-3">
          <div className="rounded-lg border bg-card px-5 py-3 text-center">
            <p className="text-xs font-medium text-muted-foreground">Total em aberto</p>
            <p className="text-xl font-bold">{formatCurrency(totalEmAberto)}</p>
          </div>
          <div className="rounded-lg border bg-card px-5 py-3 text-center">
            <p className="text-xs font-medium text-muted-foreground">Dívidas</p>
            <p className="text-xl font-bold">{devedor.dividas.length}</p>
          </div>
          <div className="rounded-lg border bg-card px-5 py-3 text-center">
            <p className="text-xs font-medium text-muted-foreground">Acordos quebrados</p>
            <p className={`text-xl font-bold ${devedor.acordosQuebrados > 0 ? 'text-destructive' : ''}`}>
              {devedor.acordosQuebrados}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* ── Score duplo + recomendação ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Gauges */}
        <div className={`rounded-lg border px-6 py-4 flex flex-col items-center gap-4 ${scoreBg(avgScoreR)}`}>
          <div className="flex gap-8">
            <ScoreGauge score={avgScoreR} label="Recuperabilidade" />
            <ScoreGauge score={scoreC} label="Contactabilidade" />
          </div>
          <p className="text-xs text-center text-muted-foreground">
            Scores recalculados diariamente às 07:00
          </p>
        </div>

        {/* Recomendação */}
        <div className={`rounded-lg border px-5 py-4 ${rec.color}`}>
          <div className="flex items-center gap-2 mb-2">
            <RecIcon className="h-4 w-4" />
            <p className="text-sm font-semibold">{rec.label}</p>
          </div>
          <p className="text-xs leading-relaxed">{rec.desc}</p>
        </div>

        {/* Fatores */}
        <div className="rounded-lg border bg-card px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Fatores — Recuperabilidade
          </p>
          <div className="space-y-2">
            <FatorRow label="Dias em atraso" pontos={fatoresR.diasAtraso} peso="×40%" />
            <FatorRow label="Respondeu msg" pontos={fatoresR.respondeu} peso="×20%" />
            <FatorRow label="Sem resposta" pontos={fatoresR.tentativas} peso="×20%" />
            <FatorRow label="Histórico" pontos={fatoresR.historico} peso="×10%" />
            <FatorRow label="Valor dívida" pontos={fatoresR.valor} peso="×10%" />
          </div>
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Fatores — Contactabilidade
          </p>
          <div className="space-y-2">
            <FatorRow label="Nº contatos" pontos={fatoresC.totalContatos} peso="×30%" />
            <FatorRow label="Contatos ativos" pontos={fatoresC.percAtivos} peso="×30%" />
            <FatorRow label="Respondeu" pontos={fatoresC.ultimoRespondeu} peso="×20%" />
            <FatorRow label="Dias s/ contato" pontos={fatoresC.diasSemContato} peso="×20%" />
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
                    <span>
                      Score R: <span className={scoreColor(divida.score)}>{divida.score}</span>
                    </span>
                    <span>
                      {divida.disparos.length} disparo{divida.disparos.length !== 1 ? 's' : ''}
                    </span>
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

      <Separator />

      {/* Bureau / contatos enriquecidos */}
      <BureauSection
        devedorId={devedor.id}
        cpfCnpj={devedor.cpfCnpj}
        contatosIniciais={contatos}
      />
    </div>
  )
}
