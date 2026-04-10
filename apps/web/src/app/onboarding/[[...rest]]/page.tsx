'use client'

import { CreateOrganization, useOrganization } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function OnboardingPage() {
  const { organization } = useOrganization()
  const router = useRouter()

  // Assim que a org aparecer na sessão, redireciona
  useEffect(() => {
    if (organization) {
      router.replace('/devedores')
    }
  }, [organization, router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">Bem-vindo ao Quitr</h1>
        <p className="mt-2 text-muted-foreground">
          Crie sua empresa para começar a gerenciar cobranças
        </p>
      </div>
      <CreateOrganization
        afterCreateOrganizationUrl="/devedores"
        skipInvitationScreen
        appearance={{
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'shadow-md border border-border',
          },
        }}
      />
    </div>
  )
}
