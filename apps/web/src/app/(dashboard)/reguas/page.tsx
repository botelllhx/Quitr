import { apiGet } from '@/lib/api'
import Link from 'next/link'
import { FileText, Plus, Star, ToggleLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NovaReguaSheet } from './_components/nova-regua-sheet'

type EtapaCount = { _count: { etapas: number; dividas: number } }
type Regua = {
  id: string
  nome: string
  descricao: string | null
  ativa: boolean
  padrao: boolean
  createdAt: string
} & EtapaCount

type ApiResponse = { data: Regua[] }

export default async function ReguasPage() {
  let reguas: Regua[] = []
  try {
    const res = await apiGet<ApiResponse>('/reguas')
    reguas = res.data
  } catch {
    // empty on error
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Réguas de cobrança</h1>
          <p className="text-sm text-muted-foreground">
            Configure as sequências de contato para cada perfil de dívida.
          </p>
        </div>
        <NovaReguaSheet />
      </div>

      {reguas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Nenhuma régua cadastrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie sua primeira régua para começar a automatizar a cobrança.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reguas.map((regua) => (
            <Link
              key={regua.id}
              href={`/reguas/${regua.id}`}
              className="group relative flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold leading-tight group-hover:underline">
                  {regua.nome}
                </span>
                <div className="flex shrink-0 gap-1">
                  {regua.padrao && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Star className="h-3 w-3" /> Padrão
                    </Badge>
                  )}
                  {regua.ativa ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                      Ativa
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      <ToggleLeft className="mr-1 h-3 w-3" /> Inativa
                    </Badge>
                  )}
                </div>
              </div>

              {regua.descricao && (
                <p className="text-sm text-muted-foreground line-clamp-2">{regua.descricao}</p>
              )}

              <div className="mt-auto flex gap-4 text-xs text-muted-foreground">
                <span>{regua._count.etapas} etapa{regua._count.etapas !== 1 ? 's' : ''}</span>
                <span>{regua._count.dividas} dívida{regua._count.dividas !== 1 ? 's' : ''} vinculada{regua._count.dividas !== 1 ? 's' : ''}</span>
              </div>
            </Link>
          ))}

          {/* Card de nova régua */}
          <NovaReguaSheet asCard />
        </div>
      )}
    </div>
  )
}
