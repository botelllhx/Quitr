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
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devedores', label: 'Devedores', icon: Users },
  { href: '/reguas', label: 'Réguas', icon: FileText },
  { href: '/acordos', label: 'Acordos', icon: HandshakeIcon },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/login')

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
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  )
}
