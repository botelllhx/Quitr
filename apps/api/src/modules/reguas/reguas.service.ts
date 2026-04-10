import { db } from '@repo/db'
import type { CreateReguaInput, UpdateReguaInput, EtapaInput } from './reguas.schema'

export async function listarReguas(tenantId: string) {
  const reguas = await db.regua.findMany({
    where: { tenantId },
    include: { _count: { select: { etapas: true, dividas: true } } },
    orderBy: [{ padrao: 'desc' }, { createdAt: 'asc' }],
  })
  return { data: reguas }
}

export async function buscarRegua(tenantId: string, id: string) {
  const regua = await db.regua.findFirst({
    where: { id, tenantId },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
  if (!regua) {
    const err = new Error('Régua não encontrada') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  return regua
}

export async function criarRegua(tenantId: string, data: CreateReguaInput) {
  if (data.padrao) {
    await db.regua.updateMany({ where: { tenantId, padrao: true }, data: { padrao: false } })
  }
  return db.regua.create({ data: { ...data, tenantId } })
}

export async function atualizarRegua(tenantId: string, id: string, data: UpdateReguaInput) {
  const regua = await db.regua.findFirst({ where: { id, tenantId } })
  if (!regua) {
    const err = new Error('Régua não encontrada') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  if (data.padrao) {
    await db.regua.updateMany({
      where: { tenantId, padrao: true, id: { not: id } },
      data: { padrao: false },
    })
  }
  return db.regua.update({ where: { id }, data })
}

export async function deletarRegua(tenantId: string, id: string) {
  const regua = await db.regua.findFirst({ where: { id, tenantId } })
  if (!regua) {
    const err = new Error('Régua não encontrada') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  await db.regua.delete({ where: { id } })
}

export async function salvarEtapas(tenantId: string, reguaId: string, etapas: EtapaInput[]) {
  const regua = await db.regua.findFirst({ where: { id: reguaId, tenantId } })
  if (!regua) {
    const err = new Error('Régua não encontrada') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }

  // Validar unicidade de diaOffset dentro da régua
  const offsets = etapas.map((e) => e.diaOffset)
  if (new Set(offsets).size !== offsets.length) {
    const err = new Error(
      'Cada etapa deve ter um dia de offset único dentro da régua'
    ) as Error & { statusCode: number; code: string }
    err.statusCode = 422
    err.code = 'DUPLICATE_DIA_OFFSET'
    throw err
  }

  // Ordenar por ordem e normalizar índices sequenciais
  const sorted = [...etapas].sort((a, b) => a.ordem - b.ordem)

  await db.$transaction(async (tx) => {
    const existing = await tx.etapaRegua.findMany({
      where: { reguaId },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((e) => e.id))
    const incomingIds = new Set(sorted.filter((e) => e.id).map((e) => e.id!))

    // Remover etapas excluídas
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id))
    if (toDelete.length > 0) {
      await tx.etapaRegua.deleteMany({ where: { id: { in: toDelete } } })
    }

    // Upsert cada etapa com ordem normalizada
    for (let i = 0; i < sorted.length; i++) {
      const { id, ...data } = sorted[i]
      if (id && existingIds.has(id)) {
        await tx.etapaRegua.update({ where: { id }, data: { ...data, ordem: i } })
      } else {
        await tx.etapaRegua.create({ data: { ...data, reguaId, ordem: i } })
      }
    }
  })

  return db.regua.findFirst({
    where: { id: reguaId },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
}
