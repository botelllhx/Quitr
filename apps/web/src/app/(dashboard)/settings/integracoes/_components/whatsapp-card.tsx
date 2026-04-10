'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { MessageCircle, CheckCircle2, XCircle, Loader2, Trash2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type WhatsAppConfig = {
  id: string
  ativa: boolean
  apiUrl: string
  apiKey: string
  instancia: string
}

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'disconnected' | 'error'

export function WhatsAppCard() {
  const { getToken } = useAuth()

  const [config, setConfig] = useState<WhatsAppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [connectionState, setConnectionState] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Form fields
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [instancia, setInstancia] = useState('')

  async function authHeaders() {
    const token = await getToken()
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    }
  }

  useEffect(() => {
    async function loadConfig() {
      try {
        const headers = await authHeaders()
        const res = await fetch(`${API_URL}/integracoes/whatsapp`, { headers })
        const json = (await res.json()) as { data: WhatsAppConfig | null }

        if (json.data) {
          setConfig(json.data)
          setApiUrl(json.data.apiUrl)
          setApiKey(json.data.apiKey)
          setInstancia(json.data.instancia)
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    loadConfig()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setErrorMsg('')
    if (!apiUrl || !apiKey || !instancia) {
      setErrorMsg('Preencha todos os campos.')
      return
    }

    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/integracoes/whatsapp`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ apiUrl, apiKey, instancia }),
      })

      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string } }
        throw new Error(err.error?.message ?? 'Erro ao salvar')
      }

      const json = (await res.json()) as { data: WhatsAppConfig }
      setConfig((prev) => ({ ...(prev ?? ({} as WhatsAppConfig)), ...json.data, apiUrl, instancia, apiKey }))
      setConnectionStatus('idle')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar configuração.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestar() {
    setConnectionStatus('testing')
    setConnectionState('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/integracoes/whatsapp/testar`, { headers })
      const json = (await res.json()) as { data?: { connected: boolean; state: string }; error?: { message?: string } }

      if (!res.ok) throw new Error(json.error?.message ?? 'Erro ao testar')

      setConnectionStatus(json.data?.connected ? 'connected' : 'disconnected')
      setConnectionState(json.data?.state ?? '')
    } catch (err) {
      setConnectionStatus('error')
      setConnectionState(err instanceof Error ? err.message : 'Erro desconhecido')
    }
  }

  async function handleDesativar() {
    if (!confirm('Desativar a integração com WhatsApp?')) return
    try {
      const headers = await authHeaders()
      await fetch(`${API_URL}/integracoes/whatsapp`, { method: 'DELETE', headers })
      setConfig(null)
      setApiUrl('')
      setApiKey('')
      setInstancia('')
      setConnectionStatus('idle')
    } catch {
      setErrorMsg('Erro ao desativar integração.')
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            WhatsApp (Evolution API)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando configuração...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <CardTitle>WhatsApp (Evolution API)</CardTitle>
          </div>
          {config?.ativa ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Conectado</Badge>
          ) : (
            <Badge variant="secondary">Não configurado</Badge>
          )}
        </div>
        <CardDescription>
          Configure sua instância self-hosted da Evolution API para enviar mensagens via WhatsApp.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="apiUrl">URL da Evolution API</Label>
          <Input
            id="apiUrl"
            placeholder="https://evolution.suaempresa.com.br"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">API Key</Label>
          <div className="relative">
            <Input
              id="apiKey"
              type={showKey ? 'text' : 'password'}
              placeholder="Sua chave de autenticação"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instancia">Nome da instância</Label>
          <Input
            id="instancia"
            placeholder="ex: quitr-producao"
            value={instancia}
            onChange={(e) => setInstancia(e.target.value)}
          />
        </div>

        {/* Status da conexão */}
        {connectionStatus !== 'idle' && (
          <div
            className={[
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              connectionStatus === 'connected'
                ? 'border-green-200 bg-green-50 text-green-800'
                : connectionStatus === 'disconnected' || connectionStatus === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-muted bg-muted/30 text-muted-foreground',
            ].join(' ')}
          >
            {connectionStatus === 'testing' && <Loader2 className="h-4 w-4 animate-spin" />}
            {connectionStatus === 'connected' && <CheckCircle2 className="h-4 w-4" />}
            {(connectionStatus === 'disconnected' || connectionStatus === 'error') && (
              <XCircle className="h-4 w-4" />
            )}
            <span>
              {connectionStatus === 'testing' && 'Testando conexão...'}
              {connectionStatus === 'connected' && `Conectado (estado: ${connectionState})`}
              {connectionStatus === 'disconnected' &&
                `Desconectado (estado: ${connectionState || 'desconhecido'})`}
              {connectionStatus === 'error' && `Erro: ${connectionState}`}
            </span>
          </div>
        )}

        {errorMsg && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
          <Button
            variant="outline"
            onClick={handleTestar}
            disabled={connectionStatus === 'testing'}
            title={!config ? 'Salve a configuração antes de testar' : undefined}
          >
            {connectionStatus === 'testing' && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Testar conexão
          </Button>
        </div>

        {config && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleDesativar}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Desativar
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
