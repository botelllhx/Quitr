'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ExportAgingButton() {
  const [loading, setLoading] = useState(false)
  const { getToken } = useAuth()

  async function handleExport() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/relatorios/aging?formato=csv`,
        { headers: { Authorization: `Bearer ${token ?? ''}` } }
      )
      if (!res.ok) throw new Error('Falha ao gerar relatório')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dataStr = new Date().toISOString().slice(0, 10)
      a.download = `aging-list-quitr-${dataStr}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao exportar relatório.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={loading} className="flex items-center gap-2">
      <Download className="h-4 w-4" />
      {loading ? 'Gerando...' : 'Exportar CSV'}
    </Button>
  )
}
