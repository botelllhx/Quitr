import { db } from '@repo/db'
import { buscarContatosPorCpf } from '../../integrations/bureau/bigdatacorp.client'

const FINALIDADE_LGPD = 'cobrança de dívida própria — CDC Art. 42'
const DIAS_REUSO = 30

// ─── Consulta principal ───────────────────────────────────────────────────────

export async function consultarBureau(
  tenantId: string,
  devedorId: string,
  ipOperador?: string
) {
  const devedor = await db.devedor.findFirst({
    where: { id: devedorId, tenantId },
    select: { id: true, cpfCnpj: true, nome: true },
  })

  if (!devedor) throw Object.assign(new Error('Devedor não encontrado'), { statusCode: 404, code: 'NOT_FOUND' })
  if (!devedor.cpfCnpj) {
    throw Object.assign(new Error('Devedor sem CPF/CNPJ — enriquecimento não disponível'), {
      statusCode: 422,
      code: 'SEM_CPF',
    })
  }

  // Verifica consulta recente para evitar custo duplo
  const limite = new Date(Date.now() - DIAS_REUSO * 24 * 60 * 60 * 1000)
  const contatosRecentes = await db.contatoDevedor.findMany({
    where: {
      devedorId,
      fonte: { in: ['bureau_bigdatacorp', 'bureau_assertiva'] },
      consultaAt: { gte: limite },
    },
    select: { id: true, valor: true, tipo: true, scoreConfianca: true, status: true },
  })

  if (contatosRecentes.length > 0) {
    return {
      reaproveitado: true,
      diasDesdeUltimaConsulta: DIAS_REUSO,
      contatos: contatosRecentes,
    }
  }

  // Chama Big Data Corp
  const resultado = await buscarContatosPorCpf(devedor.cpfCnpj)

  const agora = new Date()
  const criados = await db.$transaction(async (tx) => {
    const itens = []

    for (const tel of resultado.telefones) {
      // Evita duplicar contato já existente
      const existe = await tx.contatoDevedor.findFirst({
        where: { devedorId, valor: tel.numero },
      })
      if (existe) continue

      const c = await tx.contatoDevedor.create({
        data: {
          devedorId,
          tenantId,
          valor: tel.numero,
          tipo: 'telefone',
          fonte: 'bureau_bigdatacorp',
          status: 'pendente_confirmacao',
          scoreConfianca: tel.score,
          consultaFinalidade: FINALIDADE_LGPD,
          consultaAt: agora,
          consultaIp: ipOperador ?? null,
        },
      })
      itens.push(c)
    }

    for (const email of resultado.emails) {
      const existe = await tx.contatoDevedor.findFirst({
        where: { devedorId, valor: email.email },
      })
      if (existe) continue

      const c = await tx.contatoDevedor.create({
        data: {
          devedorId,
          tenantId,
          valor: email.email,
          tipo: 'email',
          fonte: 'bureau_bigdatacorp',
          status: 'pendente_confirmacao',
          scoreConfianca: email.score,
          consultaFinalidade: FINALIDADE_LGPD,
          consultaAt: agora,
          consultaIp: ipOperador ?? null,
        },
      })
      itens.push(c)
    }

    return itens
  })

  return { reaproveitado: false, contatos: criados }
}

// ─── Aprovação / rejeição de contato ─────────────────────────────────────────

export async function aprovarContato(tenantId: string, devedorId: string, contatoId: string) {
  const contato = await db.contatoDevedor.findFirst({
    where: { id: contatoId, devedorId, tenantId },
  })
  if (!contato) throw Object.assign(new Error('Contato não encontrado'), { statusCode: 404, code: 'NOT_FOUND' })

  return db.contatoDevedor.update({
    where: { id: contatoId },
    data: { status: 'ativo' },
  })
}

export async function rejeitarContato(tenantId: string, devedorId: string, contatoId: string) {
  const contato = await db.contatoDevedor.findFirst({
    where: { id: contatoId, devedorId, tenantId },
  })
  if (!contato) throw Object.assign(new Error('Contato não encontrado'), { statusCode: 404, code: 'NOT_FOUND' })

  return db.contatoDevedor.update({
    where: { id: contatoId },
    data: { status: 'invalido' },
  })
}

// ─── Listar contatos do devedor ───────────────────────────────────────────────

export async function listarContatos(tenantId: string, devedorId: string) {
  return db.contatoDevedor.findMany({
    where: { devedorId, tenantId },
    orderBy: [{ status: 'asc' }, { scoreConfianca: 'desc' }],
  })
}
