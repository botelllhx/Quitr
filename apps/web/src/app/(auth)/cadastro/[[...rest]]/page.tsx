import { SignUp } from '@clerk/nextjs'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Criar conta — Quitr',
}

export default function CadastroPage() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Criar sua conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          14 dias grátis, sem cartão de crédito
        </p>
      </div>

      <SignUp
        path="/cadastro"
        routing="path"
        signInUrl="/login"
        forceRedirectUrl="/onboarding"
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
