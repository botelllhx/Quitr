'use client'

import { useOrganizationList } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

export default function SelectOrgPage() {
  const { userMemberships, setActive, isLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (!isLoaded || userMemberships.isLoading || ran.current) return
    ran.current = true

    const memberships = userMemberships.data ?? []

    if (memberships.length > 0) {
      setActive({ organization: memberships[0]!.organization.id }).then(() => {
        window.location.assign('/devedores')
      })
    } else {
      router.replace('/onboarding')
    }
  }, [isLoaded, userMemberships.isLoading, userMemberships.data, setActive, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <p className="text-sm">Carregando sua conta...</p>
      </div>
    </div>
  )
}
