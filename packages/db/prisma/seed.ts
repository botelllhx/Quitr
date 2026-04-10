import { PrismaClient } from '@prisma/client'
import { addDays, subDays } from 'date-fns'

const prisma = new PrismaClient()

const TODAY = new Date()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converte reais para centavos */
const brl = (reais: number) => Math.round(reais * 100)

async function main() {
  console.log('🌱 Iniciando seed...')

  // ── Limpa dados existentes na ordem correta ──────────────────────────────
  await prisma.cobranca.deleteMany()
  await prisma.parcela.deleteMany()
  await prisma.acordo.deleteMany()
  await prisma.disparo.deleteMany()
  await prisma.divida.deleteMany()
  await prisma.etapaRegua.deleteMany()
  await prisma.regua.deleteMany()
  await prisma.devedor.deleteMany()
  await prisma.tenant.deleteMany()

  // ── 1. Tenant ────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      clerkOrgId: 'org_demo_empresa_ltda',
      nome: 'Empresa Demo Ltda',
      cnpj: '12345678000190',
      email: 'financeiro@empresademo.com.br',
      plano: 'starter',
      ativo: true,
      multaPercentual: 2.0,
      jurosMensais: 1.0,
    },
  })
  console.log(`✅ Tenant criado: ${tenant.nome}`)

  // ── 2. Régua padrão com 5 etapas ─────────────────────────────────────────
  const regua = await prisma.regua.create({
    data: {
      tenantId: tenant.id,
      nome: 'Régua Padrão 30 dias',
      descricao: 'Régua de cobrança padrão: pré-vencimento até 15 dias após',
      ativa: true,
      etapas: {
        create: [
          {
            ordem: 1,
            diaOffset: -3,
            canal: 'whatsapp',
            mensagemTemplate:
              'Olá, {nome}! Sua fatura de {valor} com a {empresa} vence em 3 dias ({vencimento}). Evite juros pagando em dia. 😊',
            condicao: 'sempre',
            acao: 'enviarMensagem',
          },
          {
            ordem: 2,
            diaOffset: 0,
            canal: 'whatsapp',
            mensagemTemplate:
              'Olá, {nome}! Hoje é o vencimento da sua fatura de {valor} com a {empresa}. Pague hoje e evite multa e juros. 👉 {linkAcordo}',
            condicao: 'sempre',
            acao: 'enviarMensagem',
          },
          {
            ordem: 3,
            diaOffset: 3,
            canal: 'whatsapp',
            mensagemTemplate:
              '{nome}, sua dívida de {valor} com a {empresa} está em atraso há 3 dias. Regularize agora e evite restrições: {linkAcordo}',
            condicao: 'semResposta',
            acao: 'gerarAcordo',
          },
          {
            ordem: 4,
            diaOffset: 7,
            canal: 'email',
            mensagemTemplate:
              'Prezado(a) {nome}, informamos que existe uma pendência financeira de {valor} vencida em {vencimento} junto à {empresa}. Acesse o link para negociar: {linkAcordo}',
            condicao: 'semResposta',
            acao: 'enviarMensagem',
          },
          {
            ordem: 5,
            diaOffset: 15,
            canal: 'sms',
            mensagemTemplate:
              '{empresa}: {nome}, sua divida de {valor} venc. {vencimento} pode ser negativada. Negocie ja: {linkAcordo}',
            condicao: 'semResposta',
            acao: 'negativar',
          },
        ],
      },
    },
  })
  console.log(`✅ Régua criada: ${regua.nome} (${5} etapas)`)

  // ── 3. Devedores ──────────────────────────────────────────────────────────

  // 3a. João Silva — pagador (histórico positivo, costuma pagar com pequeno atraso)
  const joao = await prisma.devedor.create({
    data: {
      tenantId: tenant.id,
      nome: 'João Silva',
      cpfCnpj: '12345678900',
      email: 'joao.silva@email.com',
      telefone: '11987654321',
      perfil: 'pagador',
    },
  })

  // 3b. Maria Oliveira — fantasma (não responde há mais de 30 dias)
  const maria = await prisma.devedor.create({
    data: {
      tenantId: tenant.id,
      nome: 'Maria Oliveira',
      cpfCnpj: '98765432100',
      email: 'maria.oliveira@email.com',
      telefone: '21976543210',
      perfil: 'fantasma',
    },
  })

  // 3c. Carlos Pereira — negociador (respondeu, pediu parcelamento)
  const carlos = await prisma.devedor.create({
    data: {
      tenantId: tenant.id,
      nome: 'Carlos Pereira',
      cpfCnpj: '45678912300',
      email: 'carlos.pereira@email.com',
      telefone: '31965432109',
      perfil: 'negociador',
    },
  })

  console.log(`✅ Devedores criados: ${joao.nome}, ${maria.nome}, ${carlos.nome}`)

  // ── 4. Dívidas (2 por devedor) ────────────────────────────────────────────

  const dividasData = [
    // João — pagador: dívidas recentes, score alto
    {
      devedorId: joao.id,
      descricao: 'Fatura de serviços - Jan/2026',
      valorOriginal: brl(1500),
      valorAtualizado: brl(1545), // 2% multa + 3% juros (3 meses)
      dataVencimento: subDays(TODAY, 5),
      status: 'em_aberto' as const,
      score: 78,
    },
    {
      devedorId: joao.id,
      descricao: 'Fatura de serviços - Fev/2026',
      valorOriginal: brl(2200),
      valorAtualizado: brl(2200),
      dataVencimento: addDays(TODAY, 10), // ainda não venceu
      status: 'em_aberto' as const,
      score: 85,
    },

    // Maria — fantasma: dívidas antigas, score baixo
    {
      devedorId: maria.id,
      descricao: 'Mensalidade - Out/2025',
      valorOriginal: brl(800),
      valorAtualizado: brl(875), // 2% multa + 6 meses juros
      dataVencimento: subDays(TODAY, 180),
      status: 'em_aberto' as const,
      score: 18,
    },
    {
      devedorId: maria.id,
      descricao: 'Mensalidade - Nov/2025',
      valorOriginal: brl(800),
      valorAtualizado: brl(855),
      dataVencimento: subDays(TODAY, 150),
      status: 'negativada' as const,
      score: 12,
    },

    // Carlos — negociador: em negociação, score médio
    {
      devedorId: carlos.id,
      descricao: 'Contrato nº 1042 - parcela 3/6',
      valorOriginal: brl(3600),
      valorAtualizado: brl(3708), // 2% multa + 1 mês juros
      dataVencimento: subDays(TODAY, 30),
      status: 'em_negociacao' as const,
      score: 52,
    },
    {
      devedorId: carlos.id,
      descricao: 'Contrato nº 1042 - parcela 4/6',
      valorOriginal: brl(3600),
      valorAtualizado: brl(3672),
      dataVencimento: subDays(TODAY, 10),
      status: 'em_negociacao' as const,
      score: 55,
    },
  ]

  for (const data of dividasData) {
    await prisma.divida.create({
      data: {
        tenantId: tenant.id,
        devedorId: data.devedorId,
        descricao: data.descricao,
        valorOriginal: data.valorOriginal,
        valorAtualizado: data.valorAtualizado,
        dataVencimento: data.dataVencimento,
        status: data.status,
        score: data.score,
        multaPercentual: tenant.multaPercentual,
        jurosMensais: tenant.jurosMensais,
        reguaId: regua.id,
      },
    })
  }

  console.log(`✅ Dívidas criadas: ${dividasData.length} (2 por devedor)`)

  // ── Resumo ────────────────────────────────────────────────────────────────
  const counts = {
    tenants: await prisma.tenant.count(),
    devedores: await prisma.devedor.count(),
    dividas: await prisma.divida.count(),
    reguas: await prisma.regua.count(),
    etapas: await prisma.etapaRegua.count(),
  }

  console.log('\n📊 Resumo do seed:')
  console.log(`   Tenants:   ${counts.tenants}`)
  console.log(`   Devedores: ${counts.devedores}`)
  console.log(`   Dívidas:   ${counts.dividas}`)
  console.log(`   Réguas:    ${counts.reguas}`)
  console.log(`   Etapas:    ${counts.etapas}`)
  console.log('\n🎉 Seed concluído com sucesso!')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
