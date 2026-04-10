'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

const MESES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function FecharMesButton({ mes, ano }: { mes: number; ano: number }) {
  const [loading, setLoading] = useState(false)
  const { getToken } = useAuth()
  const router = useRouter()

  async function handleFechar() {
    if (!confirm(`Fechar comissões de ${MESES[mes]}/${ano}? Esta ação é irreversível.`)) return

    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/comissao/fechar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({ mes, ano }),
        }
      )
      if (!res.ok) throw new Error('Falha ao fechar mês')
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao fechar mês')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleFechar} disabled={loading}>
      {loading ? 'Fechando...' : `Fechar ${MESES[mes]}/${ano}`}
    </Button>
  )
}
