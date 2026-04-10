'use client'

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LocalEtapa } from './regua-builder'

type NovaEtapaData = Omit<LocalEtapa, '_key' | 'ordem'>

const INITIAL: NovaEtapaData = {
  diaOffset: 1,
  canal: 'whatsapp',
  mensagemTemplate: '',
  condicao: 'sempre',
  acao: 'enviarMensagem',
}

interface Props {
  onAdd: (data: NovaEtapaData) => void
  onCancel: () => void
}

export function NovaEtapaForm({ onAdd, onCancel }: Props) {
  const [form, setForm] = React.useState<NovaEtapaData>(INITIAL)
  const [error, setError] = React.useState('')

  function handleAdd() {
    if (!form.mensagemTemplate.trim()) {
      setError('Template da mensagem é obrigatório')
      return
    }
    setError('')
    onAdd(form)
    setForm(INITIAL)
  }

  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-4 space-y-4">
      <p className="text-sm font-medium">Nova etapa</p>

      <div className="grid grid-cols-2 gap-3">
        {/* Dia offset */}
        <div className="space-y-1">
          <Label className="text-xs">Dias (relativo ao vencimento)</Label>
          <Input
            type="number"
            value={form.diaOffset}
            onChange={(e) => setForm((f) => ({ ...f, diaOffset: Number(e.target.value) }))}
          />
        </div>

        {/* Canal */}
        <div className="space-y-1">
          <Label className="text-xs">Canal</Label>
          <Select
            value={form.canal}
            onValueChange={(v) => setForm((f) => ({ ...f, canal: v as NovaEtapaData['canal'] }))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Condição */}
        <div className="space-y-1">
          <Label className="text-xs">Condição</Label>
          <Select
            value={form.condicao}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, condicao: v as NovaEtapaData['condicao'] }))
            }
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sempre">Sempre</SelectItem>
              <SelectItem value="semResposta">Sem resposta</SelectItem>
              <SelectItem value="comResposta">Com resposta</SelectItem>
              <SelectItem value="naoAbriu">Não abriu</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Ação */}
        <div className="space-y-1">
          <Label className="text-xs">Ação</Label>
          <Select
            value={form.acao}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, acao: v as NovaEtapaData['acao'] }))
            }
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enviarMensagem">Enviar mensagem</SelectItem>
              <SelectItem value="gerarAcordo">Gerar link de acordo</SelectItem>
              <SelectItem value="negativar">Negativar</SelectItem>
              <SelectItem value="protestar">Protestar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Template */}
      <div className="space-y-1">
        <Label className="text-xs">Template da mensagem</Label>
        <Textarea
          value={form.mensagemTemplate}
          onChange={(e) => setForm((f) => ({ ...f, mensagemTemplate: e.target.value }))}
          placeholder="Olá {nome}, sua dívida de {valor} vence em..."
          rows={3}
          className="text-sm"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd}>
          Adicionar etapa
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
