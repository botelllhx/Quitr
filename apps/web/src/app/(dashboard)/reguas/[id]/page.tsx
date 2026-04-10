import { apiGet } from '@/lib/api'
import { notFound } from 'next/navigation'
import { ReguaBuilder } from './_components/regua-builder'

type EtapaRegua = {
  id: string
  reguaId: string
  ordem: number
  diaOffset: number
  canal: 'whatsapp' | 'email' | 'sms'
  mensagemTemplate: string
  condicao: 'sempre' | 'semResposta' | 'comResposta' | 'naoAbriu'
  acao: 'enviarMensagem' | 'gerarAcordo' | 'negativar' | 'protestar'
  createdAt: string
  updatedAt: string
}

export type ReguaWithEtapas = {
  id: string
  tenantId: string
  nome: string
  descricao: string | null
  ativa: boolean
  padrao: boolean
  etapas: EtapaRegua[]
  createdAt: string
  updatedAt: string
}

export default async function ReguaBuilderPage({ params }: { params: { id: string } }) {
  let regua: ReguaWithEtapas
  try {
    const res = await apiGet<{ data: ReguaWithEtapas }>(`/reguas/${params.id}`)
    regua = res.data
  } catch {
    notFound()
  }

  return <ReguaBuilder regua={regua} />
}
