import { db } from '@repo/db'
import {
  EvolutionClient,
  createEvolutionClientFromEnv,
  type EvolutionConfig,
} from '../../integrations/whatsapp/evolution.client'

// ─── Tipagem do config por tipo ───────────────────────────────────────────────

export type WhatsAppEvolutionConfig = EvolutionConfig

// ─── Helpers de leitura ───────────────────────────────────────────────────────

/**
 * Busca a integração WhatsApp Evolution de um tenant.
 * Retorna null se não existir ou estiver inativa.
 */
export async function getWhatsAppIntegracao(tenantId: string) {
  return db.integracao.findUnique({
    where: { tenantId_tipo: { tenantId, tipo: 'WHATSAPP_EVOLUTION' } },
  })
}

/**
 * Cria um EvolutionClient para o tenant informado.
 * Se não houver integração configurada, usa as variáveis de ambiente (fallback).
 */
export async function createEvolutionClient(tenantId: string): Promise<EvolutionClient> {
  const integracao = await getWhatsAppIntegracao(tenantId)

  if (!integracao || !integracao.ativa) {
    return createEvolutionClientFromEnv()
  }

  const config = integracao.config as WhatsAppEvolutionConfig
  return new EvolutionClient(config)
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export async function salvarWhatsAppConfig(
  tenantId: string,
  config: WhatsAppEvolutionConfig
) {
  return db.integracao.upsert({
    where: { tenantId_tipo: { tenantId, tipo: 'WHATSAPP_EVOLUTION' } },
    create: {
      tenantId,
      tipo: 'WHATSAPP_EVOLUTION',
      config,
      ativa: true,
    },
    update: {
      config,
      ativa: true,
    },
  })
}

export async function desativarWhatsAppIntegracao(tenantId: string) {
  return db.integracao.updateMany({
    where: { tenantId, tipo: 'WHATSAPP_EVOLUTION' },
    data: { ativa: false },
  })
}
