import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import {
  LayoutDashboard,
  Users,
  FileText,
  HandshakeIcon,
  BarChart3,
  Settings,
  DollarSign,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { db } from '@repo/db'

const navLinks = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devedores', label: 'Devedores', icon: Users },
  { href: '/reguas', label: 'Réguas', icon: FileText },
  { href: '/acordos', label: 'Acordos', icon: HandshakeIcon },
  { href: '/comissao', label: 'Comissão', icon: DollarSign },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/login')

  // Trial banner
  let diasTrial: number | null = null
  if (orgId) {
    const tenant = await db.tenant.findUnique({
      where: { id: orgId },
      select: { assinaturaStatus: true, trialFim: true },
    })
    if (tenant?.assinaturaStatus === 'trial' && tenant.trialFim) {
      const diff = new Date(tenant.trialFim).getTime() - Date.now()
      diasTrial = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex w-60 flex-col border-r bg-card">
        {/* Logo */}
        <div className="flex h-16 items-center px-6">
          <span className="text-xl font-bold tracking-tight">Quitr</span>
        </div>

        {/* Navegação */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User button */}
        <div className="flex items-center gap-3 border-t px-4 py-4">
          <UserButton afterSignOutUrl="/login" />
          <span className="text-sm text-muted-foreground truncate">Minha conta</span>
        </div>
      </aside>

      {/* ── Conteúdo principal ────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-y-auto">
        {/* Trial banner */}
        {diasTrial !== null && (
          <div className={`flex items-center gap-3 px-6 py-2.5 text-sm ${
            diasTrial <= 3
              ? 'bg-red-50 border-b border-red-200 text-red-800'
              : 'bg-yellow-50 border-b border-yellow-200 text-yellow-800'
          }`}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {diasTrial > 0
                ? `Trial gratuito: ${diasTrial} dia${diasTrial !== 1 ? 's' : ''} restante${diasTrial !== 1 ? 's' : ''}.`
                : 'Seu trial encerrou.'}
              {' '}
              <Link href="/settings/plano" className="font-semibold underline underline-offset-2">
                Assinar agora
              </Link>
            </span>
          </div>
        )}
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  )
}
