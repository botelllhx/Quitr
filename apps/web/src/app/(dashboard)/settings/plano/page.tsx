import { auth } from '@clerk/nextjs/server'
import { db } from '@repo/db'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CheckCircle } from 'lucide-react'
import { PlanoActions } from './_components/plano-actions'

// ─── Tipos ────────────────────────────────────────────────────────────────────

const PLANOS = [
  {
    id: 'starter',
    nome: 'Starter',
    preco: 297,
    descricao: 'Para pequenas carteiras',
    recursos: [
      'Até 200 devedores',
      'WhatsApp + E-mail',
      '1 usuário',
      'Régua de cobrança',
      'Portal do devedor',
    ],
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: 697,
    descricao: 'Para operações em crescimento',
    recursos: [
      'Até 1.000 devedores',
      'WhatsApp + E-mail + SMS',
      '3 usuários',
      'Negativação Serasa',
      'Enriquecimento via bureau',
      'Tudo do Starter',
    ],
    destaque: true,
  },
  {
    id: 'business',
    nome: 'Business',
    preco: 1497,
    descricao: 'Para operações completas',
    recursos: [
      'Devedores ilimitados',
      'Todos os canais',
      '10 usuários',
      'Módulo de comissão',
      'API pública',
      'Suporte dedicado',
      'Tudo do Pro',
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(reais: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reais)
}

function diasRestantesTrial(trialFim: Date | null): number | null {
  if (!trialFim) return null
  const diff = new Date(trialFim).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default async function PlanoPage() {
  const { orgId } = await auth()

  let tenant: { plano: string; assinaturaStatus: string; trialFim: Date | null } = {
    plano: 'trial',
    assinaturaStatus: 'trial',
    trialFim: null,
  }

  if (orgId) {
    const t = await db.tenant.findUnique({
      where: { id: orgId },
      select: { plano: true, assinaturaStatus: true, trialFim: true },
    })
    if (t) tenant = t
  }

  const diasTrial = diasRestantesTrial(tenant.trialFim)
  const emTrial = tenant.assinaturaStatus === 'trial'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plano e assinatura</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu plano do Quitr</p>
      </div>

      {/* Banner de trial */}
      {emTrial && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-5 py-4">
          <p className="text-sm font-semibold text-yellow-800">
            {diasTrial !== null && diasTrial > 0
              ? `Você está no período de trial — ${diasTrial} dia${diasTrial !== 1 ? 's' : ''} restante${diasTrial !== 1 ? 's' : ''}.`
              : 'Seu período de trial encerrou. Escolha um plano para continuar.'}
          </p>
          <p className="text-xs text-yellow-700 mt-1">
            Assine agora para garantir acesso a todas as funcionalidades sem interrupção.
          </p>
        </div>
      )}

      {/* Plano atual */}
      {!emTrial && (
        <div className="rounded-lg border bg-card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Plano atual</p>
            <p className="text-xl font-bold capitalize">{tenant.plano}</p>
          </div>
          <Badge
            variant={
              tenant.assinaturaStatus === 'ativa' ? 'default'
              : tenant.assinaturaStatus === 'inadimplente' ? 'destructive'
              : 'secondary'
            }
          >
            {tenant.assinaturaStatus === 'ativa' ? 'Ativo'
              : tenant.assinaturaStatus === 'inadimplente' ? 'Inadimplente'
              : tenant.assinaturaStatus === 'cancelada' ? 'Cancelado'
              : tenant.assinaturaStatus}
          </Badge>
        </div>
      )}

      <Separator />

      {/* Cards de planos */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANOS.map((plano) => {
          const ativo = tenant.plano === plano.id && !emTrial
          return (
            <div
              key={plano.id}
              className={`rounded-lg border p-6 flex flex-col gap-4 ${
                plano.destaque ? 'border-primary ring-1 ring-primary' : ''
              } ${ativo ? 'bg-primary/5' : 'bg-card'}`}
            >
              {plano.destaque && (
                <Badge className="self-start">Mais popular</Badge>
              )}
              <div>
                <p className="text-lg font-bold">{plano.nome}</p>
                <p className="text-xs text-muted-foreground">{plano.descricao}</p>
              </div>
              <div>
                <span className="text-3xl font-bold">{formatCurrency(plano.preco)}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
              <ul className="space-y-1.5">
                {plano.recursos.map((r) => (
                  <li key={r} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
              <PlanoActions
                planoId={plano.id}
                planoAtual={tenant.plano}
                assinaturaStatus={tenant.assinaturaStatus}
                ativo={ativo}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
