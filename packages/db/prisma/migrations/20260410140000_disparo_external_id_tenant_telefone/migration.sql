-- AlterTable: adiciona telefoneEmpresa ao tenant e externalId ao disparo
ALTER TABLE "tenants" ADD COLUMN "telefoneEmpresa" TEXT NOT NULL DEFAULT '';
ALTER TABLE "disparos" ADD COLUMN "externalId" TEXT;
