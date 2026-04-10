'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, Mail, MessageSquare, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LocalEtapa } from './regua-builder'

const CANAL_CONFIG = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600 bg-green-50 border-green-200' },
  email: { label: 'E-mail', icon: Mail, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  sms: { label: 'SMS', icon: Phone, color: 'text-orange-600 bg-orange-50 border-orange-200' },
}

const CONDICAO_LABEL: Record<string, string> = {
  sempre: 'Sempre',
  semResposta: 'Sem resposta',
  comResposta: 'Com resposta',
  naoAbriu: 'Não abriu',
}

const ACAO_LABEL: Record<string, string> = {
  enviarMensagem: 'Enviar mensagem',
  gerarAcordo: 'Gerar acordo',
  negativar: 'Negativar',
  protestar: 'Protestar',
}

interface Props {
  etapa: LocalEtapa
  onEdit: (etapa: LocalEtapa) => void
  onRemove: (key: string) => void
}

export function EtapaCard({ etapa, onEdit, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: etapa._key,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const canal = CANAL_CONFIG[etapa.canal]
  const CanalIcon = canal.icon

  const diaLabel =
    etapa.diaOffset < 0
      ? `Dia ${etapa.diaOffset}`
      : etapa.diaOffset === 0
        ? 'Dia 0 (vencimento)'
        : `Dia +${etapa.diaOffset}`

  const diaColor =
    etapa.diaOffset < 0
      ? 'bg-purple-100 text-purple-800'
      : etapa.diaOffset === 0
        ? 'bg-blue-100 text-blue-800'
        : 'bg-red-100 text-red-800'

  const preview = etapa.mensagemTemplate.slice(0, 60) + (etapa.mensagemTemplate.length > 60 ? '…' : '')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-start gap-3 rounded-lg border bg-card p-4 shadow-sm',
        isDragging && 'opacity-40 shadow-lg ring-2 ring-primary'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Arrastar"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Dia */}
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', diaColor)}>
            {diaLabel}
          </span>

          {/* Canal */}
          <span
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
              canal.color
            )}
          >
            <CanalIcon className="h-3 w-3" />
            {canal.label}
          </span>

          {/* Condição */}
          <Badge variant="outline" className="text-xs">
            {CONDICAO_LABEL[etapa.condicao]}
          </Badge>

          {/* Ação (se não for enviarMensagem) */}
          {etapa.acao !== 'enviarMensagem' && (
            <Badge variant="secondary" className="text-xs">
              {ACAO_LABEL[etapa.acao]}
            </Badge>
          )}
        </div>

        {/* Preview do template */}
        <p className="truncate text-sm text-muted-foreground">{preview || 'Sem template definido'}</p>
      </div>

      {/* Ações */}
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(etapa)}
          aria-label="Editar etapa"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onRemove(etapa._key)}
          aria-label="Remover etapa"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
