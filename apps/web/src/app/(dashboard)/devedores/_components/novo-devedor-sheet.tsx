'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { UserPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type FormData = {
  nome: string
  telefone: string
  email: string
  cpfCnpj: string
  tipo: 'PF' | 'PJ'
}

const INITIAL: FormData = { nome: '', telefone: '+55', email: '', cpfCnpj: '', tipo: 'PF' }

export function NovoDevedorSheet() {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormData>(INITIAL)
  const [errors, setErrors] = React.useState<Partial<FormData>>({})
  const [loading, setLoading] = React.useState(false)
  const { getToken } = useAuth()
  const router = useRouter()

  function validate(): boolean {
    const errs: Partial<FormData> = {}
    if (!form.nome.trim() || form.nome.length < 2) errs.nome = 'Nome obrigatório (mín. 2 chars)'
    if (!/^\+[1-9]\d{9,14}$/.test(form.telefone))
      errs.telefone = 'Use formato E.164 (+5511999999999)'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = 'E-mail inválido'
    if (form.cpfCnpj && !/^\d{11}$|^\d{14}$/.test(form.cpfCnpj))
      errs.cpfCnpj = 'CPF (11 dígitos) ou CNPJ (14 dígitos)'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/devedores`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({
            nome: form.nome,
            telefone: form.telefone,
            email: form.email || undefined,
            cpfCnpj: form.cpfCnpj || undefined,
            tipo: form.tipo,
          }),
        }
      )
      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string } }
        throw new Error(err?.error?.message ?? 'Erro ao criar devedor')
      }
      setForm(INITIAL)
      setOpen(false)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Novo devedor
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Novo devedor</SheetTitle>
            <SheetDescription>
              Preencha os dados do devedor. Campos marcados com * são obrigatórios.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Nome */}
            <div className="space-y-1">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="João da Silva"
              />
              {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
            </div>

            {/* Tipo */}
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as 'PF' | 'PJ' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física</SelectItem>
                  <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Telefone */}
            <div className="space-y-1">
              <Label htmlFor="telefone">Telefone * (E.164)</Label>
              <Input
                id="telefone"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                placeholder="+5511999999999"
              />
              {errors.telefone && <p className="text-xs text-destructive">{errors.telefone}</p>}
            </div>

            {/* CPF/CNPJ */}
            <div className="space-y-1">
              <Label htmlFor="cpfCnpj">CPF / CNPJ</Label>
              <Input
                id="cpfCnpj"
                value={form.cpfCnpj}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cpfCnpj: e.target.value.replace(/\D/g, '') }))
                }
                placeholder="Somente dígitos"
                maxLength={14}
              />
              {errors.cpfCnpj && <p className="text-xs text-destructive">{errors.cpfCnpj}</p>}
            </div>

            {/* E-mail */}
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="joao@email.com"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
