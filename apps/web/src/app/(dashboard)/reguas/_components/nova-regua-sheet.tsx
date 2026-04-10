'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function NovaReguaSheet({ asCard = false }: { asCard?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [nome, setNome] = React.useState('')
  const [descricao, setDescricao] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const { getToken } = useAuth()
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setError('Nome é obrigatório'); return }
    setError('')
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/reguas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ nome: nome.trim(), descricao: descricao.trim() || undefined }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string } }
        throw new Error(err?.error?.message ?? 'Erro ao criar régua')
      }
      const { data } = (await res.json()) as { data: { id: string } }
      setOpen(false)
      setNome('')
      setDescricao('')
      router.push(`/reguas/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const trigger = asCard ? (
    <button
      onClick={() => setOpen(true)}
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card p-5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <Plus className="h-8 w-8" />
      <span className="text-sm font-medium">Nova régua</span>
    </button>
  ) : (
    <Button onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4" />
      Nova régua
    </Button>
  )

  return (
    <>
      {trigger}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nova régua de cobrança</SheetTitle>
            <SheetDescription>
              Defina o nome e crie a régua. As etapas são configuradas no builder.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Régua padrão 30 dias"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Opcional — descreva o objetivo desta régua"
                rows={3}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Criando...' : 'Criar e abrir builder'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancelar
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
