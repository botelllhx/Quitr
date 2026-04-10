-- Sprint 4: Score duplo, comissão, bureau (ContatoDevedor), Stripe

-- AlterTable devedores
ALTER TABLE "devedores"
  ADD COLUMN "scoreContactabilidade" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "cobradorId" TEXT;

-- AlterTable tenants (Stripe + assinatura)
ALTER TABLE "tenants"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripePriceId"    TEXT,
  ADD COLUMN "trialFim"         TIMESTAMP(3),
  ADD COLUMN "assinaturaStatus" TEXT NOT NULL DEFAULT 'trial';

-- CreateTable contatos_devedor
CREATE TABLE "contatos_devedor" (
  "id"                 TEXT NOT NULL,
  "devedorId"          TEXT NOT NULL,
  "tenantId"           TEXT NOT NULL,
  "valor"              TEXT NOT NULL,
  "tipo"               TEXT NOT NULL,
  "fonte"              TEXT NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'ativo',
  "scoreConfianca"     INTEGER,
  "consultaFinalidade" TEXT,
  "consultaAt"         TIMESTAMP(3),
  "consultaIp"         TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contatos_devedor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contatos_devedor_devedorId_idx" ON "contatos_devedor"("devedorId");
CREATE INDEX "contatos_devedor_tenantId_idx"  ON "contatos_devedor"("tenantId");

ALTER TABLE "contatos_devedor"
  ADD CONSTRAINT "contatos_devedor_devedorId_fkey"
  FOREIGN KEY ("devedorId") REFERENCES "devedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable fechamentos_comissao
CREATE TABLE "fechamentos_comissao" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "mes"             INTEGER NOT NULL,
  "ano"             INTEGER NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'aberto',
  "totalRecuperado" INTEGER NOT NULL DEFAULT 0,
  "totalComissao"   INTEGER NOT NULL DEFAULT 0,
  "pdfUrl"          TEXT,
  "fechadoAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fechamentos_comissao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fechamentos_comissao_tenantId_mes_ano_key" ON "fechamentos_comissao"("tenantId", "mes", "ano");
CREATE INDEX "fechamentos_comissao_tenantId_idx" ON "fechamentos_comissao"("tenantId");

-- CreateTable comissao_itens
CREATE TABLE "comissao_itens" (
  "id"              TEXT NOT NULL,
  "fechamentoId"    TEXT NOT NULL,
  "cobradorId"      TEXT NOT NULL,
  "cobradorNome"    TEXT NOT NULL,
  "valorRecuperado" INTEGER NOT NULL,
  "comissao"        INTEGER NOT NULL,
  "percentual"      DECIMAL(5,2) NOT NULL,
  "acordosFechados" INTEGER NOT NULL DEFAULT 0,
  "acordosQuebrados" INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comissao_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comissao_itens_fechamentoId_idx" ON "comissao_itens"("fechamentoId");

ALTER TABLE "comissao_itens"
  ADD CONSTRAINT "comissao_itens_fechamentoId_fkey"
  FOREIGN KEY ("fechamentoId") REFERENCES "fechamentos_comissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
