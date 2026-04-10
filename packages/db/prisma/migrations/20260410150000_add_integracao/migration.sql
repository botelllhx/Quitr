-- CreateEnum
CREATE TYPE "TipoIntegracao" AS ENUM ('WHATSAPP_EVOLUTION', 'WHATSAPP_ZAPI', 'EMAIL_RESEND', 'SMS_ZENVIA');

-- CreateTable
CREATE TABLE "integracoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoIntegracao" NOT NULL,
    "config" JSONB NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integracoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integracoes_tenantId_tipo_key" ON "integracoes"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "integracoes_tenantId_idx" ON "integracoes"("tenantId");

-- AddForeignKey
ALTER TABLE "integracoes" ADD CONSTRAINT "integracoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
