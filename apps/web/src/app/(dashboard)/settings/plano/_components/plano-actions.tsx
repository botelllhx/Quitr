'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

interface PlanoActionsProps {
  planoId: string
  planoAtual: string
  assinaturaStatus: string
  ativo: boolean
}

export function PlanoActions({ planoId, planoAtual, assinaturaStatus, ativo }: PlanoActionsProps) {
  const [loading, setLoading] = useState(false)
  const { getToken } = useAuth()

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  async function handleAssinar() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ plano: planoId }),
      })
      const data = await res.json() as { data?: { url: string }; error?: { message: string } }
      if (!res.ok) throw new Error(data.error?.message ?? 'Falha ao criar checkout')
      if (data.data?.url) window.location.href = data.data.url
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao processar assinatura')
    } finally {
      setLoading(false)
    }
  }

  async function handlePortal() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/billing/portal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      })
      const data = await res.json() as { data?: { url: string }; error?: { message: string } }
      if (!res.ok) throw new Error(data.error?.message ?? 'Falha ao abrir portal')
      if (data.data?.url) window.location.href = data.data.url
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao abrir portal')
    } finally {
      setLoading(false)
    }
  }

  if (ativo) {
    return (
      <Button variant="outline" onClick={handlePortal} disabled={loading} className="mt-auto">
        {loading ? 'Redirecionando...' : 'Gerenciar assinatura'}
      </Button>
    )
  }

  if (assinaturaStatus === 'cancelada') {
    return (
      <Button onClick={handleAssinar} disabled={loading} className="mt-auto">
        {loading ? 'Aguarde...' : 'Reativar'}
      </Button>
    )
  }

  // Trial ou plano diferente
  return (
    <Button
      onClick={handleAssinar}
      disabled={loading}
      variant={planoAtual === 'trial' ? 'default' : 'outline'}
      className="mt-auto"
    >
      {loading ? 'Aguarde...' : planoAtual === 'trial' ? 'Assinar agora' : 'Mudar para este plano'}
    </Button>
  )
}
