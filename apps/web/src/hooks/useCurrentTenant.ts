'use client'

import { useOrganization, useOrganizationList, useAuth } from '@clerk/nextjs'

export type CurrentTenant = {
  /** Clerk orgId — equivale ao tenantId no banco */
  tenantId: string
  nome: string
  slug: string | null
  imageUrl: string
  /** Papel do usuário logado nesta organização */
  papel: 'admin' | 'membro'
  isLoaded: true
}

export type CurrentTenantLoading = {
  tenantId: null
  nome: null
  slug: null
  imageUrl: null
  papel: null
  isLoaded: false
}

/**
 * Retorna os dados da organização (tenant) ativa do usuário logado.
 *
 * - `isLoaded: false` enquanto o Clerk inicializa
 * - `tenantId: null` se o usuário não tem organização ativa
 *
 * @example
 * const { tenantId, nome, papel, isLoaded } = useCurrentTenant()
 * if (!isLoaded) return <Skeleton />
 * if (!tenantId) return <OrgSelector />
 */
export function useCurrentTenant(): CurrentTenant | CurrentTenantLoading {
  const { isLoaded: orgLoaded, organization, membership } = useOrganization()
  const { isLoaded: authLoaded } = useAuth()

  const isLoaded = orgLoaded && authLoaded

  if (!isLoaded) {
    return { tenantId: null, nome: null, slug: null, imageUrl: null, papel: null, isLoaded: false }
  }

  if (!organization) {
    return { tenantId: null, nome: null, slug: null, imageUrl: null, papel: null, isLoaded: false }
  }

  const papel: 'admin' | 'membro' =
    membership?.role === 'org:admin' ? 'admin' : 'membro'

  return {
    tenantId: organization.id,
    nome: organization.name,
    slug: organization.slug ?? null,
    imageUrl: organization.imageUrl,
    papel,
    isLoaded: true,
  }
}

/**
 * Retorna a lista de organizações do usuário para o seletor de tenant.
 * Útil em usuários que pertencem a múltiplos tenants.
 */
export function useTenantList() {
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  })

  return {
    isLoaded,
    tenants: (userMemberships.data ?? []).map((m) => ({
      tenantId: m.organization.id,
      nome: m.organization.name,
      slug: m.organization.slug ?? null,
      imageUrl: m.organization.imageUrl,
      papel: m.role === 'org:admin' ? ('admin' as const) : ('membro' as const),
    })),
    setActiveTenant: (tenantId: string) =>
      setActive?.({ organization: tenantId }),
  }
}
