'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Papa from 'papaparse'
import { UploadCloud, FileText, CheckCircle2, XCircle, AlertCircle, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type CsvRow = Record<string, string>

type FieldMapping = {
  nome: string
  telefone: string
  email: string
  cpfCnpj: string
  tipo: string
}

type ImportResult = {
  criados: number
  atualizados: number
  erros: Array<{ linha: number; nome: string; motivo: string }>
}

type Step = 'upload' | 'mapping' | 'preview' | 'result'

const SYSTEM_FIELDS: Array<{ key: keyof FieldMapping; label: string; required: boolean }> = [
  { key: 'nome', label: 'Nome', required: true },
  { key: 'telefone', label: 'Telefone (E.164)', required: true },
  { key: 'email', label: 'E-mail', required: false },
  { key: 'cpfCnpj', label: 'CPF / CNPJ', required: false },
  { key: 'tipo', label: 'Tipo (PF/PJ)', required: false },
]

const NONE_VALUE = '__nenhum__'

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ImportarDevedoresPage() {
  const [step, setStep] = React.useState<Step>('upload')
  const [csvColumns, setCsvColumns] = React.useState<string[]>([])
  const [csvRows, setCsvRows] = React.useState<CsvRow[]>([])
  const [fileName, setFileName] = React.useState('')
  const [mapping, setMapping] = React.useState<FieldMapping>({
    nome: NONE_VALUE,
    telefone: NONE_VALUE,
    email: NONE_VALUE,
    cpfCnpj: NONE_VALUE,
    tipo: NONE_VALUE,
  })
  const [importing, setImporting] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { getToken } = useAuth()
  const router = useRouter()

  // ── Parsear CSV ────────────────────────────────────────────────────────────
  function parseFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      alert('Por favor selecione um arquivo .csv')
      return
    }
    setFileName(file.name)
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = res.meta.fields ?? []
        setCsvColumns(cols)
        setCsvRows(res.data)
        // Auto-detectar colunas por nome
        const autoMapping: FieldMapping = {
          nome: NONE_VALUE,
          telefone: NONE_VALUE,
          email: NONE_VALUE,
          cpfCnpj: NONE_VALUE,
          tipo: NONE_VALUE,
        }
        const lower = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
        for (const col of cols) {
          const lc = lower(col)
          if (/nome|name/.test(lc)) autoMapping.nome = col
          else if (/tel|phone|celular|whatsapp/.test(lc)) autoMapping.telefone = col
          else if (/email|mail/.test(lc)) autoMapping.email = col
          else if (/cpf|cnpj|documento|doc/.test(lc)) autoMapping.cpfCnpj = col
          else if (/tipo|type/.test(lc)) autoMapping.tipo = col
        }
        setMapping(autoMapping)
        setStep('mapping')
      },
    })
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  // ── Validação do mapeamento ────────────────────────────────────────────────
  const mappingValid =
    mapping.nome !== NONE_VALUE && mapping.telefone !== NONE_VALUE

  // ── Preview dos dados mapeados ─────────────────────────────────────────────
  const previewRows = csvRows.slice(0, 10).map((row) => ({
    nome: mapping.nome !== NONE_VALUE ? row[mapping.nome] ?? '' : '',
    telefone: mapping.telefone !== NONE_VALUE ? row[mapping.telefone] ?? '' : '',
    email: mapping.email !== NONE_VALUE ? row[mapping.email] ?? '' : '',
    cpfCnpj: mapping.cpfCnpj !== NONE_VALUE ? row[mapping.cpfCnpj] ?? '' : '',
    tipo: mapping.tipo !== NONE_VALUE ? row[mapping.tipo] ?? '' : '',
  }))

  // ── Importar ───────────────────────────────────────────────────────────────
  async function handleImport() {
    setImporting(true)
    setProgress(10)

    const devedores = csvRows.map((row) => ({
      nome: mapping.nome !== NONE_VALUE ? (row[mapping.nome] ?? '').trim() : '',
      telefone: mapping.telefone !== NONE_VALUE ? (row[mapping.telefone] ?? '').trim() : '',
      ...(mapping.email !== NONE_VALUE && row[mapping.email]
        ? { email: row[mapping.email]!.trim() }
        : {}),
      ...(mapping.cpfCnpj !== NONE_VALUE && row[mapping.cpfCnpj]
        ? { cpfCnpj: row[mapping.cpfCnpj]!.replace(/\D/g, '') }
        : {}),
      ...(mapping.tipo !== NONE_VALUE && row[mapping.tipo]
        ? { tipo: row[mapping.tipo]!.toUpperCase().includes('PJ') ? 'PJ' : 'PF' }
        : {}),
    }))

    setProgress(30)

    try {
      const token = await getToken()
      setProgress(50)

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/devedores/importar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({ devedores }),
        }
      )

      setProgress(90)

      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string } }
        throw new Error(err?.error?.message ?? 'Erro ao importar')
      }

      const json = (await res.json()) as { data: ImportResult }
      setProgress(100)
      setResult(json.data)
      setStep('result')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setImporting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/devedores" className="flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" />
            Devedores
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-2xl font-bold">Importar CSV</h1>
      </div>

      {/* ── Indicador de etapas ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm">
        {(['upload', 'mapping', 'preview', 'result'] as Step[]).map((s, i) => {
          const labels = ['Upload', 'Mapeamento', 'Preview', 'Resultado']
          const active = s === step
          const done =
            (step === 'mapping' && i === 0) ||
            (step === 'preview' && i <= 1) ||
            (step === 'result' && i <= 2)
          return (
            <React.Fragment key={s}>
              {i > 0 && <div className="h-px w-6 bg-border" />}
              <span
                className={
                  active
                    ? 'font-medium text-foreground'
                    : done
                    ? 'text-muted-foreground line-through'
                    : 'text-muted-foreground'
                }
              >
                {labels[i]}
              </span>
            </React.Fragment>
          )
        })}
      </div>

      {/* ── Step: Upload ─────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-16
            transition-colors hover:border-primary hover:bg-accent
            ${dragOver ? 'border-primary bg-accent' : 'border-border'}
          `}
        >
          <UploadCloud className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">Arraste um arquivo CSV ou clique para selecionar</p>
            <p className="text-sm text-muted-foreground mt-1">
              Colunas esperadas: nome, telefone (E.164), e-mail, CPF/CNPJ, tipo (PF/PJ)
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {/* ── Step: Mapeamento ─────────────────────────────────────────────── */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{fileName}</span>
            <Badge variant="secondary">{csvRows.length} linhas</Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            Associe as colunas do seu CSV aos campos do sistema.
          </p>

          <div className="rounded-md border divide-y">
            {SYSTEM_FIELDS.map(({ key, label, required }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm font-medium">{label}</span>
                  {required && <span className="ml-1 text-destructive text-xs">*</span>}
                </div>
                <Select
                  value={mapping[key]}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [key]: v }))}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Selecionar coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {!required && <SelectItem value={NONE_VALUE}>— Não importar —</SelectItem>}
                    {csvColumns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {!mappingValid && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Selecione ao menos as colunas de Nome e Telefone.
            </p>
          )}

          <Button disabled={!mappingValid} onClick={() => setStep('preview')}>
            Ver preview
          </Button>
        </div>
      )}

      {/* ── Step: Preview ────────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Primeiras {previewRows.length} de {csvRows.length} linhas. Verifique os dados antes de
            importar.
          </p>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {SYSTEM_FIELDS.filter((f) => mapping[f.key] !== NONE_VALUE).map((f) => (
                    <th key={f.key} className="px-3 py-2 text-left font-medium">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    {SYSTEM_FIELDS.filter((f) => mapping[f.key] !== NONE_VALUE).map((f) => (
                      <td key={f.key} className="px-3 py-2 font-mono text-xs">
                        {row[f.key] || <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {csvRows.length > 10 && (
            <p className="text-xs text-muted-foreground">
              ... e mais {csvRows.length - 10} linhas
            </p>
          )}

          {importing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">Importando {csvRows.length} devedores...</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importando...' : `Importar ${csvRows.length} devedores`}
            </Button>
            <Button variant="outline" onClick={() => setStep('mapping')} disabled={importing}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Resultado ──────────────────────────────────────────────── */}
      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border bg-green-50 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-green-600" />
              <p className="text-2xl font-bold text-green-700">{result.criados}</p>
              <p className="text-sm text-green-600">Criados</p>
            </div>
            <div className="rounded-md border bg-blue-50 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-blue-600" />
              <p className="text-2xl font-bold text-blue-700">{result.atualizados}</p>
              <p className="text-sm text-blue-600">Atualizados</p>
            </div>
            <div className="rounded-md border bg-red-50 p-4 text-center">
              <XCircle className="mx-auto mb-1 h-6 w-6 text-red-600" />
              <p className="text-2xl font-bold text-red-700">{result.erros.length}</p>
              <p className="text-sm text-red-600">Erros</p>
            </div>
          </div>

          {result.erros.length > 0 && (
            <div className="rounded-md border">
              <div className="px-4 py-3 border-b bg-muted/50">
                <p className="text-sm font-medium">Linhas com erro</p>
              </div>
              <div className="divide-y max-h-64 overflow-y-auto">
                {result.erros.map((e, i) => (
                  <div key={i} className="px-4 py-2 text-sm">
                    <span className="font-medium">Linha {e.linha}</span>
                    {e.nome && <span className="text-muted-foreground"> — {e.nome}</span>}
                    <p className="text-destructive text-xs mt-0.5">{e.motivo}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => router.push('/devedores')}>Ver devedores</Button>
            <Button
              variant="outline"
              onClick={() => {
                setStep('upload')
                setCsvRows([])
                setCsvColumns([])
                setFileName('')
                setResult(null)
                setProgress(0)
              }}
            >
              Nova importação
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
