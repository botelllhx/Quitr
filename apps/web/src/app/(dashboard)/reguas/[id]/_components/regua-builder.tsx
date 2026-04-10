'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Star,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EtapaCard } from './etapa-card'
import { EtapaDrawer } from './etapa-drawer'
import { NovaEtapaForm } from './nova-etapa-form'
import type { ReguaWithEtapas } from '../page'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export type LocalEtapa = {
  _key: string
  id?: string
  diaOffset: number
  canal: 'whatsapp' | 'email' | 'sms'
  mensagemTemplate: string
  condicao: 'sempre' | 'semResposta' | 'comResposta' | 'naoAbriu'
  acao: 'enviarMensagem' | 'gerarAcordo' | 'negativar' | 'protestar'
  ordem: number
}

function toLocalEtapas(etapas: ReguaWithEtapas['etapas']): LocalEtapa[] {
  return etapas.map((e, i) => ({ ...e, _key: e.id, ordem: i }))
}

interface Props {
  regua: ReguaWithEtapas
}

export function ReguaBuilder({ regua: initialRegua }: Props) {
  const [nome, setNome] = React.useState(initialRegua.nome)
  const [ativa, setAtiva] = React.useState(initialRegua.ativa)
  const [padrao, setPadrao] = React.useState(initialRegua.padrao)
  const [etapas, setEtapas] = React.useState<LocalEtapa[]>(() =>
    toLocalEtapas(initialRegua.etapas)
  )
  const [editingEtapa, setEditingEtapa] = React.useState<LocalEtapa | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [showNovaEtapa, setShowNovaEtapa] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<Date | null>(null)
  const [saveError, setSaveError] = React.useState('')

  const { getToken } = useAuth()
  const router = useRouter()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setEtapas((items) => {
      const oldIdx = items.findIndex((e) => e._key === active.id)
      const newIdx = items.findIndex((e) => e._key === over.id)
      return arrayMove(items, oldIdx, newIdx).map((e, i) => ({ ...e, ordem: i }))
    })
  }

  // ── Edição ─────────────────────────────────────────────────────────────────
  function openEdit(etapa: LocalEtapa) {
    setEditingEtapa(etapa)
    setDrawerOpen(true)
  }

  function saveEtapa(updated: LocalEtapa) {
    setEtapas((prev) => prev.map((e) => (e._key === updated._key ? updated : e)))
    setDrawerOpen(false)
    setEditingEtapa(null)
  }

  // ── Remoção ────────────────────────────────────────────────────────────────
  function removeEtapa(key: string) {
    setEtapas((prev) =>
      prev.filter((e) => e._key !== key).map((e, i) => ({ ...e, ordem: i }))
    )
  }

  // ── Adição ─────────────────────────────────────────────────────────────────
  function addEtapa(data: Omit<LocalEtapa, '_key' | 'ordem'>) {
    const newEtapa: LocalEtapa = {
      ...data,
      _key: crypto.randomUUID(),
      ordem: etapas.length,
    }
    setEtapas((prev) => [...prev, newEtapa])
    setShowNovaEtapa(false)
  }

  // ── Salvar ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const token = await getToken()
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? ''}`,
      }

      // 1. Atualizar metadados da régua
      const metaRes = await fetch(`${API}/reguas/${initialRegua.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ nome: nome.trim(), ativa, padrao }),
      })
      if (!metaRes.ok) {
        const err = (await metaRes.json()) as { error?: { message?: string } }
        throw new Error(err?.error?.message ?? 'Erro ao salvar régua')
      }

      // 2. Salvar etapas (bulk)
      const etapasRes = await fetch(`${API}/reguas/${initialRegua.id}/etapas`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          etapas: etapas.map((e, i) => ({
            ...(e.id ? { id: e.id } : {}),
            diaOffset: e.diaOffset,
            canal: e.canal,
            mensagemTemplate: e.mensagemTemplate,
            condicao: e.condicao,
            acao: e.acao,
            ordem: i,
          })),
        }),
      })
      if (!etapasRes.ok) {
        const err = (await etapasRes.json()) as { error?: { message?: string } }
        throw new Error(err?.error?.message ?? 'Erro ao salvar etapas')
      }

      // Atualizar etapas com os IDs retornados pelo servidor
      const saved = (await etapasRes.json()) as { data: ReguaWithEtapas | null }
      if (saved.data?.etapas) {
        setEtapas(toLocalEtapas(saved.data.etapas))
      }

      setSavedAt(new Date())
      router.refresh()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Barra superior ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <Link href="/reguas">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        {/* Nome editável inline */}
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-8 max-w-xs border-transparent bg-transparent text-base font-semibold shadow-none focus-visible:border-input focus-visible:bg-background"
          aria-label="Nome da régua"
        />

        <div className="ml-auto flex items-center gap-2">
          {/* Toggle Ativa */}
          <button
            onClick={() => setAtiva((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              ativa
                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            aria-label="Alternar status ativa"
          >
            {ativa ? (
              <ToggleRight className="h-3.5 w-3.5" />
            ) : (
              <ToggleLeft className="h-3.5 w-3.5" />
            )}
            {ativa ? 'Ativa' : 'Inativa'}
          </button>

          {/* Toggle Padrão */}
          <button
            onClick={() => setPadrao((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              padrao
                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            aria-label="Alternar régua padrão"
          >
            <Star className={cn('h-3.5 w-3.5', padrao && 'fill-yellow-600')} />
            Régua padrão
          </button>

          {/* Feedback de salvo */}
          {savedAt && !saving && !saveError && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" /> Salvo
            </span>
          )}
          {saveError && (
            <span className="max-w-[200px] truncate text-xs text-destructive" title={saveError}>
              {saveError}
            </span>
          )}

          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Salvando…
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </div>
      </div>

      {/* ── Conteúdo do builder ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {etapas.length === 0 && !showNovaEtapa && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <p className="font-medium">Nenhuma etapa configurada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clique em "+ Adicionar etapa" para começar.
              </p>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={etapas.map((e) => e._key)}
              strategy={verticalListSortingStrategy}
            >
              {etapas.map((etapa) => (
                <EtapaCard
                  key={etapa._key}
                  etapa={etapa}
                  onEdit={openEdit}
                  onRemove={removeEtapa}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Formulário inline de nova etapa */}
          {showNovaEtapa ? (
            <NovaEtapaForm onAdd={addEtapa} onCancel={() => setShowNovaEtapa(false)} />
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => setShowNovaEtapa(true)}
            >
              <Plus className="h-4 w-4" />
              Adicionar etapa
            </Button>
          )}
        </div>
      </div>

      {/* Drawer de edição */}
      <EtapaDrawer
        etapa={editingEtapa}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setEditingEtapa(null)
        }}
        onSave={saveEtapa}
      />
    </div>
  )
}
