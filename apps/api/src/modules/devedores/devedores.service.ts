import { db, Prisma, TipoDevedor, PerfilDevedor, StatusDivida } from '@repo/db'
import type {
  CreateDevedorInput,
  UpdateDevedorInput,
  ListarDevedoresQuery,
} from './devedores.schema'

// ─── Helper de erros HTTP ─────────────────────────────────────────────────────

function httpError(statusCode: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode, code })
}

function isPrismaNotFound(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
  )
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  )
}

// ─── Listagem ─────────────────────────────────────────────────────────────────

export async function listarDevedores(tenantId: string, filtros: ListarDevedoresQuery) {
  const { busca, perfil, status, page, limit } = filtros

  const dividaStatusFiltro: StatusDivida[] = status
    ? [status as StatusDivida]
    : ['em_aberto', 'em_negociacao']

  const where: Prisma.DevedorWhereInput = {
    tenantId,
    ...(perfil && { perfil: perfil as PerfilDevedor }),
    ...(busca && {
      OR: [
        { nome: { contains: busca, mode: 'insensitive' } },
        { cpfCnpj: { contains: busca } },
        { email: { contains: busca, mode: 'insensitive' } },
        { telefone: { contains: busca } },
      ],
    }),
  }

  const [devedores, total] = await Promise.all([
    db.devedor.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        dividas: {
          where: { status: { in: dividaStatusFiltro } },
          select: { id: true, valorAtualizado: true, score: true, status: true },
        },
      },
    }),
    db.devedor.count({ where }),
  ])

  const data = devedores.map((d) => {
    const totalEmAberto = d.dividas.reduce((sum, div) => sum + div.valorAtualizado, 0)
    const scoreAtual =
      d.dividas.length > 0
        ? Math.round(d.dividas.reduce((s, div) => s + div.score, 0) / d.dividas.length)
        : 0

    return {
      id: d.id,
      nome: d.nome,
      cpfCnpj: d.cpfCnpj,
      telefone: d.telefone,
      email: d.email,
      tipo: d.tipo,
      perfil: d.perfil,
      optOut: d.optOut,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      totalEmAberto,
      scoreAtual,
      dividasCount: d.dividas.length,
    }
  })

  return {
    data,
    meta: {
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

// ─── Busca individual ─────────────────────────────────────────────────────────

export async function buscarDevedor(tenantId: string, id: string) {
  try {
    const devedor = await db.devedor.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        dividas: {
          orderBy: { dataVencimento: 'desc' },
          include: {
            disparos: {
              orderBy: { createdAt: 'desc' },
              take: 50,
              include: {
                etapa: {
                  select: { ordem: true, canal: true, acao: true, diaOffset: true },
                },
              },
            },
            acordos: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                valorTotal: true,
                numeroParcelas: true,
                assinadoAt: true,
              },
            },
          },
        },
      },
    })

    return devedor
  } catch (err) {
    if (isPrismaNotFound(err)) throw httpError(404, 'NOT_FOUND', 'Devedor não encontrado')
    throw err
  }
}

// ─── Criação ─────────────────────────────────────────────────────────────────

export async function criarDevedor(tenantId: string, data: CreateDevedorInput) {
  try {
    return await db.devedor.create({
      data: {
        tenantId,
        nome: data.nome,
        telefone: data.telefone,
        email: data.email,
        cpfCnpj: data.cpfCnpj,
        tipo: data.tipo as TipoDevedor,
        endereco: (data.endereco as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    })
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw httpError(409, 'DUPLICATE', 'CPF/CNPJ já cadastrado neste tenant')
    }
    throw err
  }
}

// ─── Atualização ─────────────────────────────────────────────────────────────

export async function atualizarDevedor(
  tenantId: string,
  id: string,
  data: UpdateDevedorInput
) {
  await buscarDevedor(tenantId, id) // garante que existe e pertence ao tenant

  try {
    return await db.devedor.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.telefone !== undefined && { telefone: data.telefone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.cpfCnpj !== undefined && { cpfCnpj: data.cpfCnpj }),
        ...(data.tipo !== undefined && { tipo: data.tipo as TipoDevedor }),
        ...(data.endereco !== undefined && {
          endereco: (data.endereco as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        }),
      },
    })
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw httpError(409, 'DUPLICATE', 'CPF/CNPJ já cadastrado neste tenant')
    }
    throw err
  }
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

export async function softDeleteDevedor(tenantId: string, id: string) {
  await buscarDevedor(tenantId, id)
  return db.devedor.softDelete(id)
}

// ─── Importação em lote ───────────────────────────────────────────────────────

type ImportErro = { linha: number; nome: string; motivo: string }

export type ImportResult = {
  criados: number
  atualizados: number
  erros: ImportErro[]
}

export async function importarDevedores(
  tenantId: string,
  rows: CreateDevedorInput[]
): Promise<ImportResult> {
  let criados = 0
  let atualizados = 0
  const erros: ImportErro[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    try {
      if (row.cpfCnpj) {
        // Tenta encontrar registro ativo com mesmo CPF/CNPJ
        const existing = await db.devedor.findFirst({
          where: { tenantId, cpfCnpj: row.cpfCnpj },
          select: { id: true },
        })

        if (existing) {
          await db.devedor.update({
            where: { id: existing.id },
            data: {
              nome: row.nome,
              telefone: row.telefone,
              ...(row.email !== undefined && { email: row.email }),
              ...(row.tipo && { tipo: row.tipo as TipoDevedor }),
              ...(row.endereco !== undefined && {
                endereco: (row.endereco as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              }),
            },
          })
          atualizados++
          continue
        }
      }

      await db.devedor.create({
        data: {
          tenantId,
          nome: row.nome,
          telefone: row.telefone,
          email: row.email,
          cpfCnpj: row.cpfCnpj,
          tipo: (row.tipo ?? 'PF') as TipoDevedor,
          ...(row.endereco && { endereco: row.endereco as Prisma.InputJsonValue }),
        },
      })
      criados++
    } catch (err) {
      let motivo = 'Erro desconhecido'
      if (isPrismaUniqueViolation(err)) {
        motivo = 'CPF/CNPJ duplicado (conflito com registro existente ou neste lote)'
      } else if (err instanceof Error) {
        motivo = err.message
      }
      erros.push({ linha: i + 1, nome: row.nome, motivo })
    }
  }

  return { criados, atualizados, erros }
}
