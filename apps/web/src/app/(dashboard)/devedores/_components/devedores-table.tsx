'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { MoreHorizontal, ArrowUpDown, Search, Trash2, Pencil, Eye } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Devedor = {
  id: string
  nome: string
  cpfCnpj: string | null
  telefone: string | null
  perfil: 'pagador' | 'negligente' | 'negociador' | 'fantasma' | 'reincidente'
  scoreAtual: number
  scoreContactabilidade: number
  totalEmAberto: number
  dividasCount: number
  updatedAt: string
}

type Meta = { total: number; page: number; pageSize: number; totalPages: number }

// ─── Helpers de exibição ──────────────────────────────────────────────────────

const PERFIL_LABELS: Record<Devedor['perfil'], string> = {
  pagador: 'Pagador',
  negligente: 'Negligente',
  negociador: 'Negociador',
  fantasma: 'Fantasma',
  reincidente: 'Reincidente',
}

const PERFIL_VARIANT: Record<
  Devedor['perfil'],
  'default' | 'secondary' | 'warning' | 'danger' | 'outline'
> = {
  pagador: 'default',
  negligente: 'warning',
  negociador: 'secondary',
  fantasma: 'outline',
  reincidente: 'danger',
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 70 ? 'success' : score >= 40 ? 'warning' : 'danger'
  return <Badge variant={variant}>{score}</Badge>
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100
  )
}

function formatCpfCnpj(value: string | null) {
  if (!value) return '—'
  const d = value.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return value
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface DevedoresTableProps {
  data: Devedor[]
  meta: Meta
}

export function DevedoresTable({ data, meta }: DevedoresTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Lê filtros da URL
  const busca = searchParams.get('busca') ?? ''
  const perfil = searchParams.get('perfil') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  // Atualiza URL (server re-render automático)
  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, value)
    }
    if (updates.busca !== undefined || updates.perfil !== undefined) params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  // ── Colunas TanStack Table ────────────────────────────────────────────────
  const columns: ColumnDef<Devedor>[] = [
    {
      accessorKey: 'nome',
      header: () => (
        <div className="flex items-center gap-1 cursor-pointer">
          Nome <ArrowUpDown className="h-3 w-3" />
        </div>
      ),
      cell: ({ row }) => (
        <div>
          <Link
            href={`/devedores/${row.original.id}`}
            className="font-medium hover:underline text-foreground"
          >
            {row.getValue('nome')}
          </Link>
          {row.original.telefone && (
            <p className="text-xs text-muted-foreground">{row.original.telefone}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'cpfCnpj',
      header: 'CPF / CNPJ',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{formatCpfCnpj(row.getValue('cpfCnpj'))}</span>
      ),
    },
    {
      accessorKey: 'totalEmAberto',
      header: () => <div className="text-right">Total em aberto</div>,
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {formatCurrency(row.getValue<number>('totalEmAberto'))}
        </div>
      ),
    },
    {
      accessorKey: 'scoreAtual',
      header: 'R',
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 w-3">R</span>
            <ScoreBadge score={row.getValue<number>('scoreAtual')} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 w-3">C</span>
            <ScoreBadge score={row.original.scoreContactabilidade} />
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'perfil',
      header: 'Perfil',
      cell: ({ row }) => {
        const p = row.getValue<Devedor['perfil']>('perfil')
        return <Badge variant={PERFIL_VARIANT[p]}>{PERFIL_LABELS[p]}</Badge>
      },
    },
    {
      accessorKey: 'dividasCount',
      header: 'Dívidas',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.getValue('dividasCount')}</span>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: 'Última atividade',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.getValue<string>('updatedAt')).toLocaleDateString('pt-BR')}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => <RowActions devedor={row.original} />,
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: meta.totalPages,
  })

  return (
    <div className="space-y-4">
      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF, telefone..."
            defaultValue={busca}
            className="pl-9"
            onChange={(e) => {
              const timer = setTimeout(() => updateParams({ busca: e.target.value }), 400)
              return () => clearTimeout(timer)
            }}
          />
        </div>
        <Select value={perfil} onValueChange={(v) => updateParams({ perfil: v === 'todos' ? null : v })}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os perfis</SelectItem>
            <SelectItem value="pagador">Pagador</SelectItem>
            <SelectItem value="negligente">Negligente</SelectItem>
            <SelectItem value="negociador">Negociador</SelectItem>
            <SelectItem value="fantasma">Fantasma</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Tabela ────────────────────────────────────────────────────────── */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Nenhum devedor encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Paginação ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {meta.total} devedor{meta.total !== 1 ? 'es' : ''} encontrado{meta.total !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            Anterior
          </Button>
          <span className="text-sm">
            {page} / {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Ações por linha ─────────────────────────────────────────────────────────

function RowActions({ devedor }: { devedor: Devedor }) {
  const { getToken } = useAuth()
  const router = useRouter()

  async function handleDelete() {
    if (!confirm(`Remover ${devedor.nome}?`)) return
    const token = await getToken()
    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/devedores/${devedor.id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } }
    )
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Ações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/devedores/${devedor.id}`} className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Ver perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/devedores/${devedor.id}?edit=true`} className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Editar
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive flex items-center gap-2"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" /> Remover
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
