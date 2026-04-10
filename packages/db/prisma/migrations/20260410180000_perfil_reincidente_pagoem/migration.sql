-- AlterEnum: adiciona valor reincidente ao perfil de devedor
ALTER TYPE "PerfilDevedor" ADD VALUE 'reincidente';

-- AlterTable parcelas: renomear paidAt → pagoEm (consistência com naming pt-BR)
ALTER TABLE "parcelas" RENAME COLUMN "paidAt" TO "pagoEm";

-- AlterTable cobrancas: renomear paidAt → pagoEm
ALTER TABLE "cobrancas" RENAME COLUMN "paidAt" TO "pagoEm";
