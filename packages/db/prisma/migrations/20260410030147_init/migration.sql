-- CreateEnum
CREATE TYPE "TipoDevedor" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "PerfilDevedor" AS ENUM ('pagador', 'negligente', 'negociador', 'fantasma');

-- CreateEnum
CREATE TYPE "StatusDivida" AS ENUM ('em_aberto', 'em_negociacao', 'acordo_firmado', 'quitada', 'protestada', 'negativada');

-- CreateEnum
CREATE TYPE "CanalEtapa" AS ENUM ('whatsapp', 'email', 'sms');

-- CreateEnum
CREATE TYPE "CondicaoEtapa" AS ENUM ('sempre', 'semResposta', 'comResposta', 'naoAbriu');

-- CreateEnum
CREATE TYPE "AcaoEtapa" AS ENUM ('enviarMensagem', 'gerarAcordo', 'negativar', 'protestar');

-- CreateEnum
CREATE TYPE "StatusDisparo" AS ENUM ('pendente', 'enviado', 'entregue', 'lido', 'respondido', 'falhou');

-- CreateEnum
CREATE TYPE "StatusAcordo" AS ENUM ('pendente', 'ativo', 'quitado', 'inadimplente', 'cancelado');

-- CreateEnum
CREATE TYPE "StatusParcela" AS ENUM ('pendente', 'paga', 'vencida', 'cancelada');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "cnpj" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "plano" TEXT NOT NULL DEFAULT 'trial',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "multaPercentual" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "jurosMensais" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devedores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "tipo" "TipoDevedor" NOT NULL DEFAULT 'PF',
    "perfil" "PerfilDevedor" NOT NULL DEFAULT 'pagador',
    "endereco" JSONB,
    "optOut" BOOLEAN NOT NULL DEFAULT false,
    "optOutAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "devedorId" TEXT NOT NULL,
    "descricao" TEXT,
    "valorOriginal" INTEGER NOT NULL,
    "valorAtualizado" INTEGER NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusDivida" NOT NULL DEFAULT 'em_aberto',
    "score" INTEGER NOT NULL DEFAULT 50,
    "acordoToken" TEXT,
    "acordoTokenExp" TIMESTAMP(3),
    "multaPercentual" DECIMAL(5,2) NOT NULL,
    "jurosMensais" DECIMAL(5,2) NOT NULL,
    "reguaId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dividas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reguas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reguas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas_regua" (
    "id" TEXT NOT NULL,
    "reguaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "diaOffset" INTEGER NOT NULL,
    "canal" "CanalEtapa" NOT NULL,
    "mensagemTemplate" TEXT NOT NULL,
    "condicao" "CondicaoEtapa" NOT NULL DEFAULT 'sempre',
    "acao" "AcaoEtapa" NOT NULL DEFAULT 'enviarMensagem',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etapas_regua_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disparos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dividaId" TEXT NOT NULL,
    "etapaId" TEXT,
    "canal" "CanalEtapa" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "status" "StatusDisparo" NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "enviadoAt" TIMESTAMP(3),
    "entregueAt" TIMESTAMP(3),
    "lidoAt" TIMESTAMP(3),
    "respondidoAt" TIMESTAMP(3),
    "falhouAt" TIMESTAMP(3),
    "erroMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disparos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acordos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dividaId" TEXT NOT NULL,
    "valorTotal" INTEGER NOT NULL,
    "valorEntrada" INTEGER NOT NULL DEFAULT 0,
    "numeroParcelas" INTEGER NOT NULL,
    "status" "StatusAcordo" NOT NULL DEFAULT 'pendente',
    "documentoUrl" TEXT,
    "assinadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acordos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcelas" (
    "id" TEXT NOT NULL,
    "acordoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusParcela" NOT NULL DEFAULT 'pendente',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobrancas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "acordoId" TEXT NOT NULL,
    "parcelaId" TEXT,
    "asaasId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "linkPagamento" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "devedores_tenantId_idx" ON "devedores"("tenantId");

-- CreateIndex
CREATE INDEX "devedores_deletedAt_idx" ON "devedores"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "devedores_tenant_cpfCnpj_key" ON "devedores"("tenantId", "cpfCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "dividas_acordoToken_key" ON "dividas"("acordoToken");

-- CreateIndex
CREATE INDEX "dividas_tenantId_idx" ON "dividas"("tenantId");

-- CreateIndex
CREATE INDEX "dividas_devedorId_idx" ON "dividas"("devedorId");

-- CreateIndex
CREATE INDEX "dividas_status_idx" ON "dividas"("status");

-- CreateIndex
CREATE INDEX "dividas_deletedAt_idx" ON "dividas"("deletedAt");

-- CreateIndex
CREATE INDEX "reguas_tenantId_idx" ON "reguas"("tenantId");

-- CreateIndex
CREATE INDEX "etapas_regua_reguaId_idx" ON "etapas_regua"("reguaId");

-- CreateIndex
CREATE INDEX "disparos_tenantId_idx" ON "disparos"("tenantId");

-- CreateIndex
CREATE INDEX "disparos_dividaId_idx" ON "disparos"("dividaId");

-- CreateIndex
CREATE INDEX "disparos_status_idx" ON "disparos"("status");

-- CreateIndex
CREATE INDEX "acordos_tenantId_idx" ON "acordos"("tenantId");

-- CreateIndex
CREATE INDEX "acordos_dividaId_idx" ON "acordos"("dividaId");

-- CreateIndex
CREATE INDEX "parcelas_acordoId_idx" ON "parcelas"("acordoId");

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_asaasId_key" ON "cobrancas"("asaasId");

-- CreateIndex
CREATE INDEX "cobrancas_tenantId_idx" ON "cobrancas"("tenantId");

-- CreateIndex
CREATE INDEX "cobrancas_acordoId_idx" ON "cobrancas"("acordoId");

-- AddForeignKey
ALTER TABLE "devedores" ADD CONSTRAINT "devedores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_devedorId_fkey" FOREIGN KEY ("devedorId") REFERENCES "devedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_reguaId_fkey" FOREIGN KEY ("reguaId") REFERENCES "reguas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reguas" ADD CONSTRAINT "reguas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_regua" ADD CONSTRAINT "etapas_regua_reguaId_fkey" FOREIGN KEY ("reguaId") REFERENCES "reguas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disparos" ADD CONSTRAINT "disparos_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disparos" ADD CONSTRAINT "disparos_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "etapas_regua"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acordos" ADD CONSTRAINT "acordos_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_acordoId_fkey" FOREIGN KEY ("acordoId") REFERENCES "acordos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_acordoId_fkey" FOREIGN KEY ("acordoId") REFERENCES "acordos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "parcelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
