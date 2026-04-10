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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import type { LocalEtapa } from './regua-builder'

// Dados fictícios para o preview
const DUMMY: Record<string, string> = {
  nome: 'Maria Silva',
  valor: 'R$ 1.500,00',
  vencimento: '10/01/2024',
  diasAtraso: '30',
  linkAcordo: 'https://quitr.com.br/acordo/abc123',
  empresa: 'Empresa Exemplo Ltda',
}

function interpolate(template: string) {
  return Object.entries(DUMMY).reduce(
    (str, [key, val]) => str.replaceAll(`{${key}}`, val),
    template
  )
}

const VARIAVEIS = [
  { label: '{nome}', value: '{nome}' },
  { label: '{valor}', value: '{valor}' },
  { label: '{vencimento}', value: '{vencimento}' },
  { label: '{diasAtraso}', value: '{diasAtraso}' },
  { label: '{linkAcordo}', value: '{linkAcordo}' },
  { label: '{empresa}', value: '{empresa}' },
]

interface Props {
  etapa: LocalEtapa | null
  open: boolean
  onClose: () => void
  onSave: (etapa: LocalEtapa) => void
}

export function EtapaDrawer({ etapa, open, onClose, onSave }: Props) {
  const [form, setForm] = React.useState<LocalEtapa | null>(etapa)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Sincronizar form quando a etapa prop muda
  React.useEffect(() => {
    setForm(etapa)
  }, [etapa])

  if (!form) return null

  function insertVar(varName: string) {
    const el = textareaRef.current
    if (!el) {
      setForm((f) => f && { ...f, mensagemTemplate: f.mensagemTemplate + varName })
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const before = form!.mensagemTemplate.slice(0, start)
    const after = form!.mensagemTemplate.slice(end)
    const newVal = before + varName + after
    setForm((f) => f && { ...f, mensagemTemplate: newVal })
    // Reposicionar cursor após inserção
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + varName.length
      el.focus()
    })
  }

  function handleSave() {
    if (!form) return
    if (!form.mensagemTemplate.trim()) return
    onSave(form)
  }

  const preview = interpolate(form.mensagemTemplate)

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar etapa</SheetTitle>
          <SheetDescription>Configure quando e como esta etapa será disparada.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Dia offset */}
          <div className="space-y-1">
            <Label htmlFor="diaOffset">Dias em relação ao vencimento</Label>
            <Input
              id="diaOffset"
              type="number"
              value={form.diaOffset}
              onChange={(e) => setForm((f) => f && { ...f, diaOffset: Number(e.target.value) })}
              placeholder="Ex: -3 (antes), 0 (no dia), 7 (após)"
            />
            <p className="text-xs text-muted-foreground">
              Negativo = antes do vencimento · Zero = no dia · Positivo = após vencimento
            </p>
          </div>

          {/* Canal */}
          <div className="space-y-1">
            <Label>Canal</Label>
            <Select
              value={form.canal}
              onValueChange={(v) =>
                setForm((f) => f && { ...f, canal: v as LocalEtapa['canal'] })
              }
            >
              <SelectTrigger>
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
            <Label>Condição de disparo</Label>
            <Select
              value={form.condicao}
              onValueChange={(v) =>
                setForm((f) => f && { ...f, condicao: v as LocalEtapa['condicao'] })
              }
            >
              <SelectTrigger>
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
            <Label>Ação</Label>
            <Select
              value={form.acao}
              onValueChange={(v) =>
                setForm((f) => f && { ...f, acao: v as LocalEtapa['acao'] })
              }
            >
              <SelectTrigger>
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

          {/* Template da mensagem */}
          <div className="space-y-2">
            <Label htmlFor="template">Template da mensagem</Label>

            {/* Botões de variável */}
            <div className="flex flex-wrap gap-1">
              {VARIAVEIS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => insertVar(v.value)}
                  className="rounded border bg-muted px-2 py-0.5 text-xs font-mono hover:bg-accent"
                >
                  {v.label}
                </button>
              ))}
            </div>

            <Textarea
              id="template"
              ref={textareaRef}
              value={form.mensagemTemplate}
              onChange={(e) =>
                setForm((f) => f && { ...f, mensagemTemplate: e.target.value })
              }
              placeholder="Olá {nome}, sua dívida de {valor} vence em..."
              rows={5}
              className="font-mono text-sm"
            />
          </div>

          {/* Preview */}
          {form.mensagemTemplate.trim() && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Preview com dados fictícios</Label>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={!form.mensagemTemplate.trim()}
              className="flex-1"
            >
              Salvar etapa
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
