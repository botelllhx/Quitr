import { Plug } from 'lucide-react'
import { WhatsAppCard } from './_components/whatsapp-card'

export default function IntegracoesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Plug className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
          <p className="text-sm text-muted-foreground">
            Conecte seus canais de comunicação para enviar mensagens automaticamente.
          </p>
        </div>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <WhatsAppCard />
      </div>
    </div>
  )
}
