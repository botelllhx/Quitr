-- AlterEnum
ALTER TYPE "StatusAcordo" ADD VALUE 'assinado' AFTER 'ativo';

-- AlterTable Tenant
ALTER TABLE "tenants"
  ADD COLUMN "diasToleranciaQuebraAcordo" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "limiteRefatoracoes" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "multaQuebraAcordo" DECIMAL(5,2) NOT NULL DEFAULT 10.00;

-- AlterTable Devedor
ALTER TABLE "devedores"
  ADD COLUMN "acordosQuebrados" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Acordo
ALTER TABLE "acordos"
  ADD COLUMN "tentativasRefatoracao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "acordoAnteriorId" TEXT,
  ADD COLUMN "inadimplenteAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "acordos" ADD CONSTRAINT "acordos_acordoAnteriorId_fkey"
  FOREIGN KEY ("acordoAnteriorId") REFERENCES "acordos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
