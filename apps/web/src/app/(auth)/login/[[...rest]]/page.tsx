import { SignIn } from '@clerk/nextjs'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Entrar — Quitr',
}

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Entrar na sua conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie suas cobranças com inteligência
        </p>
      </div>

      <SignIn
        path="/login"
        routing="path"
        signUpUrl="/cadastro"
        forceRedirectUrl="/devedores"
        appearance={{
          elements: {
            rootBox: 'w-full',
            card: 'shadow-md border border-border',
          },
        }}
      />
    </div>
  )
}
