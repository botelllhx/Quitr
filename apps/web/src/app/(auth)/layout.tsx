import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'

/**
 * Layout das páginas de autenticação (/login, /cadastro).
 * Se o usuário já está autenticado com organização, redireciona ao dashboard.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth()

  if (userId && orgId) {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="w-full max-w-md px-4">{children}</div>
    </div>
  )
}
