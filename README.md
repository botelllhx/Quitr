<p align="center">
  <img src="https://raw.githubusercontent.com/botelllhx/Quitr/main/.github/banner.png" alt="Quitr" width="100%" />
</p>

<h1 align="center">Quitr</h1>

<p align="center">
  <strong>Automação de cobrança e recuperação de crédito para o mercado brasileiro.</strong><br/>
  WhatsApp · E-mail · SMS · Pix · Boleto · Assinatura digital · Negativação
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Fastify-5-white?logo=fastify&logoColor=black" alt="Fastify" />
  <img src="https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo&logoColor=white" alt="Turborepo" />
  <img src="https://img.shields.io/badge/license-proprietary-gray" alt="License" />
</p>

---

## O problema

Empresas brasileiras perdem bilhões por ano com inadimplência. O processo manual de cobrança — planilhas, ligações, WhatsApp individual — é ineficiente, não escala e frequentemente viola o Código de Defesa do Consumidor.

## A solução

O **Quitr** automatiza toda a régua de cobrança: desde o aviso preventivo antes do vencimento até o envio de proposta de acordo, geração de Pix/boleto e assinatura digital do termo — tudo sem intervenção humana. O credor configura uma régua uma vez e o sistema executa para centenas de devedores simultaneamente, respeitando os limites legais de horário e frequência.

---

## Funcionalidades

<table>
<tr>
<td width="50%" valign="top">

**Gestão de Devedores**
- Cadastro manual ou importação em lote via CSV
- Perfil comportamental automático: Pagador, Negligente, Negociador, Fantasma
- Score de recuperabilidade 0–100 (recalculado diariamente)
- Histórico completo de contatos por devedor

**Régua de Cobrança**
- Builder visual com drag-and-drop
- Canais: WhatsApp, E-mail, SMS
- Templates com variáveis dinâmicas
- Condições por etapa (sempre, sem resposta, não abriu)
- Compliance CDC automático (8h–20h, máx 3x/semana)

</td>
<td width="50%" valign="top">

**Acordos & Pagamento**
- Link único por dívida (72h de validade)
- Portal de autoatendimento para o devedor (sem login)
- Pagamento via Pix ou boleto (Asaas)
- Parcelamento configurável com desconto progressivo
- Assinatura digital do termo (Autentique)

**Dashboard & Relatórios**
- Métricas de recuperação em tempo real
- Aging list por faixa de atraso
- Taxa de resposta por canal
- Score de recuperabilidade com justificativa
- Exportação de relatório PDF

</td>
</tr>
</table>

---

## Stack

```
                    ┌─────────────────────────────────┐
                    │        apps/web (porta 3000)     │
                    │  Next.js 14 · shadcn/ui · Tailwind│
                    │  TanStack Table · Recharts        │
                    └──────────────┬──────────────────-┘
                                   │ HTTP (Bearer token)
                    ┌──────────────▼──────────────────-┐
                    │        apps/api (porta 3001)      │
                    │  Fastify 5 · Zod · @clerk/fastify │
                    └────────┬─────────────┬────────────┘
                             │             │
              ┌──────────────▼──┐    ┌─────▼──────────────┐
              │   PostgreSQL 16  │    │    Redis + BullMQ   │
              │   (via Prisma)   │    │   (filas de envio)  │
              └─────────────────┘    └────────────────────-┘
```

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router), shadcn/ui, Tailwind CSS, TanStack Table, dnd-kit, Recharts |
| Backend | Fastify 5, TypeScript, Zod |
| Banco de dados | PostgreSQL 16 via Prisma ORM (soft-delete extension) |
| Filas | BullMQ + Redis |
| Auth | Clerk (Organizations para multi-tenancy) |
| WhatsApp | Evolution API (self-hosted) / Z-API |
| E-mail | Resend |
| SMS | Zenvia |
| Pagamentos | Asaas (Pix, boleto, split) |
| Assinatura | Autentique |
| Negativação | Boa Vista SCPC B2B API |
| Storage | Cloudflare R2 |
| Monitoramento | Sentry + Axiom |
| Deploy | Railway |

---

## Arquitetura

Monorepo gerenciado com [Turborepo](https://turbo.build) e pnpm workspaces.

```
quitr/
├── apps/
│   ├── web/                        # Dashboard do credor (Next.js)
│   │   └── src/app/
│   │       ├── (auth)/             # Login, cadastro
│   │       ├── (dashboard)/        # Área autenticada
│   │       │   ├── devedores/      # Listagem, perfil, importação CSV
│   │       │   ├── reguas/         # Builder visual de régua
│   │       │   ├── acordos/        # Gestão de acordos
│   │       │   ├── relatorios/     # Aging list, métricas
│   │       │   └── settings/       # Configurações, integrações
│   │       └── acordo/[token]/     # Portal público do devedor
│   │
│   └── api/                        # REST API + jobs (Fastify)
│       └── src/
│           ├── modules/
│           │   ├── devedores/      # CRUD + importação em lote
│           │   ├── reguas/         # Engine de régua
│           │   ├── disparos/       # Fila BullMQ + worker
│           │   ├── acordos/        # Geração e gestão de acordos
│           │   └── score/          # Score de recuperabilidade
│           ├── integrations/
│           │   ├── whatsapp/       # Evolution API / Z-API
│           │   ├── email/          # Resend + templates
│           │   ├── sms/            # Zenvia
│           │   └── pagamento/      # Asaas
│           ├── jobs/
│           │   ├── regua.job.ts    # Cron 08:05 — executa régua
│           │   └── score.job.ts    # Cron 07:00 — recalcula scores
│           └── middlewares/
│               ├── auth.ts         # Valida JWT Clerk + upsert tenant
│               └── tenant.ts       # Isolamento de dados por tenant
│
└── packages/
    ├── db/                         # Prisma schema + client + soft-delete
    ├── types/                      # Tipos TypeScript compartilhados
    └── utils/                      # Formatação, datas, interpolação de templates
```

---

## Modelo de Dados

```
Tenant (empresa cliente do SaaS)
  └── Devedor (cliente inadimplente)
        └── Divida (contrato de dívida)
              ├── Disparo (cada mensagem enviada)
              └── Acordo (proposta aceita)
                    ├── Parcela (cada prestação)
                    └── Cobranca (boleto/Pix no Asaas)

Tenant
  └── Regua (template de régua de cobrança)
        └── EtapaRegua (cada step da régua)
```

---

## Quick Start

### Pré-requisitos

- [Node.js 20+](https://nodejs.org)
- [pnpm](https://pnpm.io) — `npm i -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- Conta [Clerk](https://clerk.com) (plano free) com **Organizations** ativado

### 1. Clonar e instalar

```bash
git clone https://github.com/botelllhx/Quitr.git
cd Quitr
pnpm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Abra `.env` e preencha as chaves do Clerk:

```dotenv
CLERK_SECRET_KEY=sk_test_...           # Clerk Dashboard → API Keys
CLERK_PUBLISHABLE_KEY=pk_test_...      # idem
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...  # mesma chave
```

> **Ativar Organizations no Clerk:** Dashboard → Configure → Organizations → Enable Organizations

### 3. Subir com Docker

```bash
# Sobe PostgreSQL, Redis, API (porta 3001) e Web (porta 3000)
docker compose up -d

# Acompanhar logs em tempo real
docker compose logs -f api web
```

### 4. Criar o banco de dados

```bash
docker compose exec api sh -c \
  'cd /app/packages/db && node_modules/.bin/prisma migrate dev --name init'
```

Acesse:

| Serviço | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API | http://localhost:3001 |
| Health check | http://localhost:3001/health |

---

## Desenvolvimento Local (sem Docker)

> Requer PostgreSQL e Redis rodando localmente.

```bash
pnpm dev                         # Sobe tudo em paralelo (Turborepo)
pnpm dev --filter=@repo/api      # Apenas a API
pnpm dev --filter=web            # Apenas o frontend

pnpm db:migrate                  # Rodar migrations pendentes
pnpm db:studio                   # Abrir Prisma Studio (UI do banco)
pnpm build                       # Build de produção
pnpm test                        # Rodar testes (Vitest)
```

---

## Fluxo de Execução da Régua

```
08:05 (horário de Brasília) — Job diário inicia
│
├── Para cada tenant ativo:
│   └── Para cada dívida em_aberto ou em_negociacao:
│       ├── Calcula diasAtraso = hoje − dataVencimento
│       ├── Busca régua ativa associada à dívida
│       └── Para cada etapa onde diaOffset ≤ diasAtraso:
│           ├── Já disparou para esta etapa+dívida? → pula
│           ├── Devedor tem opt-out? → pula
│           ├── Atingiu limite de 3 contatos/semana? → pula
│           ├── Condição da etapa satisfeita? → continua
│           ├── Interpola template com dados do devedor
│           ├── Cria Disparo(status=PENDENTE) no banco
│           └── Enfileira job no BullMQ
│
└── Worker (5 instâncias paralelas):
    ├── Envia mensagem via API do canal
    ├── Atualiza Disparo com status e timestamp
    └── Falha: retenta 3× com backoff (15min → 1h → 4h)
```

---

## API Reference

Todas as rotas autenticadas exigem o header `Authorization: Bearer <clerk-jwt>`.

### Devedores

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/devedores` | Lista com filtros (`busca`, `perfil`, `status`) e paginação |
| `GET` | `/devedores/:id` | Perfil completo com dívidas e histórico de disparos |
| `POST` | `/devedores` | Criar devedor |
| `PATCH` | `/devedores/:id` | Atualizar dados |
| `DELETE` | `/devedores/:id` | Soft delete |
| `POST` | `/devedores/importar` | Importação em lote — retorna `{ criados, atualizados, erros }` |

### Portal Público

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/portal/:token` | Dados da dívida para o devedor (sem auth) |
| `POST` | `/portal/:token/aceitar` | Aceitar acordo + gerar Pix/boleto |

### Webhooks

| Método | Rota | Origem |
|---|---|---|
| `POST` | `/webhooks/clerk` | Criação de tenant via Clerk Organizations |
| `POST` | `/webhooks/asaas` | Confirmação/vencimento de pagamento |
| `POST` | `/webhooks/whatsapp/:tenantId` | Mensagem recebida / status de entrega |

### Resposta padrão

```typescript
// Sucesso
{ data: T, meta?: { total: number, page: number, pageSize: number, totalPages: number } }

// Erro
{ error: { code: string, message: string, details?: unknown } }
```

---

## Regras de Negócio

| Regra | Detalhe |
|---|---|
| Horário de envio | 08:00–20:00 horário de Brasília (CDC) |
| Frequência máxima | 3 contatos por semana por devedor |
| Opt-out | Respeitado imediatamente, sem exceções |
| Isolamento de dados | Toda query ao banco inclui `WHERE tenantId = ?` |
| Valores monetários | Armazenados em **centavos** (integer) — nunca float |
| Soft delete | `deletedAt` — registros nunca removidos fisicamente |
| Tokens de acordo | UUID v4 — não sequencial, não previsível |
| Webhook Asaas | Validado via HMAC antes de processar |

---

## Score de Recuperabilidade

Score 0–100 calculado diariamente para cada dívida ativa.

| Fator | Peso | Critério |
|---|---|---|
| Dias em atraso | 40% | Quanto mais dias, menor a nota |
| Respondeu última mensagem | 20% | Respondeu nos últimos 7 dias = 100 pts |
| Tentativas sem resposta | 20% | 6+ tentativas ignoradas = 20 pts |
| Histórico de pagamento | 10% | Já quitou dívida antes = 100 pts |
| Valor da dívida | 10% | Dívidas menores têm score ligeiramente maior |

| Faixa | Cor | Ação recomendada |
|---|---|---|
| 70–100 | 🟢 Verde | Régua leve + proposta de acordo imediata |
| 40–69 | 🟡 Amarelo | Régua progressiva + desconto escalonado |
| 0–39 | 🔴 Vermelho | Negativação + encaminhar para escritório |

---

## Variáveis de Ambiente

Veja [`.env.example`](.env.example) para a lista completa. Obrigatórias para desenvolvimento:

| Variável | Onde obter |
|---|---|
| `CLERK_SECRET_KEY` | [clerk.com](https://clerk.com) → API Keys |
| `CLERK_PUBLISHABLE_KEY` | idem |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | idem (mesma chave) |
| `DATABASE_URL` | Preenchido automaticamente pelo Docker Compose |
| `REDIS_URL` | Preenchido automaticamente pelo Docker Compose |

---

## Roadmap

### ✅ Sprint 1 — Fundação
- Monorepo Turborepo · Next.js 14 · Fastify 5 · Prisma
- Auth multitenancy com Clerk Organizations
- CRUD de devedores com importação CSV
- Docker Compose para desenvolvimento local

### 🔄 Sprint 2 — Engine de Cobrança
- [ ] Builder visual de régua (dnd-kit)
- [ ] Job cron + filas BullMQ + worker
- [ ] Integração WhatsApp (Evolution API)
- [ ] Integração E-mail (Resend + templates React Email)

### 📋 Sprint 3 — Acordos e Pagamento
- [ ] Portal público do devedor (`/acordo/:token`)
- [ ] Integração Asaas (Pix + boleto + webhooks)
- [ ] Assinatura digital (Autentique)

### 📊 Sprint 4 — Dashboard e Monetização
- [ ] Dashboard de métricas com Recharts
- [ ] Score de recuperabilidade com job diário
- [ ] Relatório aging list exportável em PDF
- [ ] Billing com Stripe (planos Starter / Pro / Business)

### 🚀 Fase 2 — Expansão
- [ ] Negativação Serasa via Boa Vista API
- [ ] Integração ERP (Omie, Bling, Conta Azul)
- [ ] Voz automatizada (TTS para devedores sem resposta)
- [ ] API pública para integrações externas
- [ ] White-label para administradoras de condomínio

---

## Checklist de Produção

- [ ] LGPD: política de privacidade, termos de uso, banner de cookies
- [ ] CDC: validar horários de envio (8h–20h) e frequência máxima
- [ ] Rate limiting nas rotas públicas (`/portal/:token`)
- [ ] Tokens de acordo são UUID v4 (não sequenciais)
- [ ] Webhook Asaas validado via HMAC
- [ ] API keys de terceiros criptografadas no banco
- [ ] Sentry configurado nos dois apps
- [ ] SPF/DKIM/DMARC configurado no domínio de e-mail (Resend guia)
- [ ] Backup automático do PostgreSQL (Railway inclui)
- [ ] Testar fluxo completo no sandbox antes de ir a produção

---

## Licença

Código proprietário — todos os direitos reservados. Uso, cópia ou distribuição sem autorização expressa são proibidos.
