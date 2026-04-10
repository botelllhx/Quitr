import Link from 'next/link'
import { Upload } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { DevedoresTable } from './_components/devedores-table'
import { NovoDevedorSheet } from './_components/novo-devedor-sheet'
import { Button } from '@/components/ui/button'

type SearchParams = {
  busca?: string
  perfil?: string
  status?: string
  page?: string
  limit?: string
}

type DevedorRow = {
  id: string
  nome: string
  cpfCnpj: string | null
  telefone: string | null
  perfil: 'pagador' | 'negligente' | 'negociador' | 'fantasma'
  scoreAtual: number
  totalEmAberto: number
  dividasCount: number
  updatedAt: string
}

type ApiResponse = {
  data: DevedorRow[]
  meta: { total: number; page: number; pageSize: number; totalPages: number }
}

export default async function DevedoresPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = new URLSearchParams()
  if (searchParams.busca) params.set('busca', searchParams.busca)
  if (searchParams.perfil) params.set('perfil', searchParams.perfil)
  if (searchParams.status) params.set('status', searchParams.status)
  if (searchParams.page) params.set('page', searchParams.page)
  if (searchParams.limit) params.set('limit', searchParams.limit)

  const query = params.toString()
  const result = await apiGet<ApiResponse>(`/devedores${query ? `?${query}` : ''}`)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Devedores</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie e acompanhe todos os seus devedores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/devedores/importar" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importar CSV
            </Link>
          </Button>
          <NovoDevedorSheet />
        </div>
      </div>

      <DevedoresTable data={result.data} meta={result.meta} />
    </div>
  )
}
