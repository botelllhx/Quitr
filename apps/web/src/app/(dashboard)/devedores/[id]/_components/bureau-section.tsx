'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Search, CheckCircle, XCircle, Loader2, Phone, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Contato = {
  id: string
  valor: string
  tipo: string
  fonte: string
  status: string
  scoreConfianca: number | null
}

interface BureauSectionProps {
  devedorId: string
  cpfCnpj: string | null
  contatosIniciais: Contato[]
}

const FONTE_LABELS: Record<string, string> = {
  credor: 'Cadastro',
  bureau_bigdatacorp: 'Bureau',
  bureau_assertiva: 'Bureau',
  devedor_confirmou: 'Confirmado',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ativo: 'default',
  pendente_confirmacao: 'secondary',
  invalido: 'destructive',
  optout: 'outline',
}

const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  pendente_confirmacao: 'Aguardando aprovação',
  invalido: 'Inválido',
  optout: 'Opt-out',
}

export function BureauSection({ devedorId, cpfCnpj, contatosIniciais }: BureauSectionProps) {
  const [contatos, setContatos] = useState<Contato[]>(contatosIniciais)
  const [consultando, setConsultando] = useState(false)
  const [aprovando, setAprovando] = useState<string | null>(null)
  const { getToken } = useAuth()
  const router = useRouter()

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  async function handleConsultar() {
    if (!cpfCnpj) return

    const confirmado = confirm(
      `Esta consulta consome 1 crédito de bureau (~R$1,50).\n\nCPF/CNPJ: ${cpfCnpj}\n\nContinuar?`
    )
    if (!confirmado) return

    setConsultando(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/devedores/${devedorId}/bureau`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      })
      const data = await res.json() as { data: { contatos: Contato[]; reaproveitado: boolean } }
      if (!res.ok) throw new Error('Falha na consulta')

      if (data.data.reaproveitado) {
        alert('Consulta recente encontrada (< 30 dias). Exibindo contatos já salvos.')
      }

      // Recarrega contatos
      const listRes = await fetch(`${apiUrl}/devedores/${devedorId}/contatos`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      })
      const listData = await listRes.json() as { data: Contato[] }
      setContatos(listData.data)
    } catch {
      alert('Erro ao consultar bureau. Verifique a configuração da API key.')
    } finally {
      setConsultando(false)
    }
  }

  async function handleAprovar(contatoId: string) {
    setAprovando(contatoId)
    try {
      const token = await getToken()
      await fetch(`${apiUrl}/devedores/${devedorId}/contatos/${contatoId}/aprovar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      })
      setContatos((prev) =>
        prev.map((c) => (c.id === contatoId ? { ...c, status: 'ativo' } : c))
      )
      router.refresh()
    } finally {
      setAprovando(null)
    }
  }

  async function handleRejeitar(contatoId: string) {
    setAprovando(contatoId)
    try {
      const token = await getToken()
      await fetch(`${apiUrl}/devedores/${devedorId}/contatos/${contatoId}/rejeitar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      })
      setContatos((prev) =>
        prev.map((c) => (c.id === contatoId ? { ...c, status: 'invalido' } : c))
      )
    } finally {
      setAprovando(null)
    }
  }

  const pendentes = contatos.filter((c) => c.status === 'pendente_confirmacao')
  const ativos = contatos.filter((c) => c.status === 'ativo')

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Contatos</h2>
        {cpfCnpj && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleConsultar}
            disabled={consultando}
            className="flex items-center gap-2"
          >
            {consultando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            {consultando ? 'Consultando bureau...' : 'Buscar contato via CPF'}
          </Button>
        )}
      </div>

      {contatos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
          Nenhum contato registrado.{' '}
          {cpfCnpj ? 'Use o botão acima para enriquecer via bureau.' : 'Adicione CPF/CNPJ para habilitar o enriquecimento.'}
        </p>
      ) : (
        <div className="space-y-2">
          {/* Pendentes de aprovação — destaque */}
          {pendentes.length > 0 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-yellow-800">
                {pendentes.length} contato{pendentes.length !== 1 ? 's' : ''} aguardando aprovação
              </p>
              {pendentes.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  {c.tipo === 'telefone' ? (
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 text-sm font-mono">{c.valor}</span>
                  {c.scoreConfianca !== null && (
                    <span className="text-xs text-muted-foreground">score {c.scoreConfianca}</span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-green-700 hover:text-green-900 hover:bg-green-100"
                    onClick={() => handleAprovar(c.id)}
                    disabled={aprovando === c.id}
                  >
                    {aprovando === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive hover:bg-red-50"
                    onClick={() => handleRejeitar(c.id)}
                    disabled={aprovando === c.id}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Contatos ativos e outros */}
          {ativos.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
              {c.tipo === 'telefone' ? (
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 text-sm font-mono">{c.valor}</span>
              <span className="text-xs text-muted-foreground">
                {FONTE_LABELS[c.fonte] ?? c.fonte}
              </span>
              <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'} className="text-xs">
                {STATUS_LABELS[c.status] ?? c.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
