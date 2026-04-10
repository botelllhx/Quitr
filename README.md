# Quitr — Automação de Cobrança e Recuperação de Crédito

> SaaS B2B multi-tenant para empresas que precisam automatizar cobranças, recuperar dívidas e fechar acordos — tudo via WhatsApp, e-mail e SMS, com pagamento Pix/boleto integrado.

---

## Visão Geral

O **Quitr** resolve um problema real do mercado brasileiro: empresas perdem dinheiro e tempo com processos manuais de cobrança. A plataforma automatiza toda a régua de cobrança — desde o primeiro aviso antes do vencimento até a negativação no Serasa — e oferece um portal de autoatendimento onde o devedor pode visualizar a dívida e fechar um acordo em minutos.

**Para quem é:** Empresas de médio porte, administradoras de condomínio, prestadores de serviços e qualquer negócio que precise cobrar múltiplos clientes inadimplentes de forma organizada e dentro da lei.

---

## Funcionalidades

### Gestão de Devedores
- Cadastro manual ou importação em lote via CSV
- Perfil comportamental automático: **Pagador**, **Negligente**, **Negociador**, **Fantasma**
- Score de recuperabilidade 0–100 recalculado diariamente
- Histórico completo de contatos e disparos por devedor

### Régua de Cobrança
- Builder visual com drag-and-drop de etapas
- Suporte a múltiplos canais: WhatsApp, E-mail, SMS
- Templates com variáveis dinâmicas: `{nome}`, `{valor}`, `{vencimento}`, `{linkAcordo}`
- Condições por etapa: sempre, sem resposta, com resposta, não abriu
- Respeita automaticamente as regras do CDC (8h–20h, máx 3 contatos/semana)

### Acordos Online
- Link único por dívida com validade de 72 horas
- Portal público sem login para o devedor
- Opções de pagamento: à vista com desconto ou parcelado
- Geração de Pix/boleto via Asaas
- Assinatura digital do termo via Autentique

### Dashboard e Relatórios
- Métricas de recuperação em tempo real
- Gráfico de evolução mensal (recuperado vs. em aberto)
- Aging list por faixa de atraso (0–30, 31–60, 61–90, 90+ dias)
- Taxa de resposta por canal
- Exportação de relatório PDF

### Integrações
| Serviço | Finalidade |
|---|---|
| Clerk | Autenticação + multitenancy via Organizations |
| Evolution API / Z-API | Envio de WhatsApp |
| Resend | Disparo de e-mails transacionais |
| Zenvia | Envio de SMS |
| Asaas | Geração de cobranças Pix e boleto |
| Autentique | Assinatura digital de acordos |
| Boa Vista SCPC | Negativação de inadimplentes |
| Cloudflare R2 | Armazenamento de documentos |
| Sentry + Axiom | Monitoramento de erros e logs |

---

## Arquitetura

Monorepo com [Turborepo](https://turbo.build) e pnpm workspaces.

```
quitr/
├── apps/
│   ├── web/          # Next.js 14 App Router — dashboard do credor
│   └── api/          # Fastify — REST API + jobs assíncronos
├── packages/
│   ├── db/           # Prisma schema + client + extensão soft-delete
│   ├── types/        # Tipos TypeScript compartilhados
│   └── utils/        # Helpers: formatação, datas, cálculos financeiros
├── docker-compose.yml
└── CLAUDE.md
```

### Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router), shadcn/ui, Tailwind CSS, TanStack Table, Recharts |
| Backend | Fastify 5, TypeScript, Zod |
| Banco de dados | PostgreSQL 16 via Prisma ORM |
| Filas | BullMQ + Redis |
| Auth | Clerk (Organizations para multitenancy) |
| Deploy | Railway (PostgreSQL + Redis + apps) |

---

## Configuração Local

### Pré-requisitos

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- Docker e Docker Compose

### 1. Clonar e instalar dependências

```bash
git clone https://github.com/botelllhx/Quitr.git
cd Quitr
pnpm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha as chaves no `.env`:

```bash
# Obrigatório para rodar localmente
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...   # mesma chave, sem prefixo NEXT_PUBLIC_
```

Crie sua conta gratuita em [clerk.com](https://clerk.com), crie um projeto e copie as chaves da seção **API Keys**. Ative **Organizations** em **Configure → Organizations**.

### 3. Subir com Docker

```bash
# Sobe PostgreSQL, Redis, API e Web
docker compose up -d

# Acompanhar logs
docker compose logs -f api web
```

### 4. Rodar migrations

```bash
docker compose exec api sh -c 'cd /app/packages/db && node_modules/.bin/prisma migrate dev --name init'
```

A aplicação estará disponível em:
- **Web:** http://localhost:3000
- **API:** http://localhost:3001
- **Health check:** http://localhost:3001/health

---

## Desenvolvimento Local (sem Docker)

```bash
# Necessário: PostgreSQL e Redis rodando localmente

# Rodar tudo em paralelo
pnpm dev

# Apenas o backend
pnpm dev --filter=@repo/api

# Apenas o frontend
pnpm dev --filter=web

# Migrations
pnpm db:migrate

# Prisma Studio (UI do banco)
pnpm db:studio
```

---

## Fluxo Principal

```
Régua de cobrança executa diariamente às 08:05 (horário de Brasília)
│
├── Busca todas as dívidas em aberto ou em negociação
│
├── Para cada dívida:
│   ├── Calcula dias de atraso
│   ├── Verifica qual etapa da régua deve disparar
│   ├── Valida condições (opt-out, limite semanal, horário)
│   └── Enfileira o disparo no BullMQ
│
└── Worker processa a fila:
    ├── Envia mensagem (WhatsApp / E-mail / SMS)
    ├── Registra Disparo com status e timestamp
    └── Retenta até 3x em caso de falha (backoff exponencial)
```

---

## Regras de Negócio Importantes

- **Horário de envio:** apenas entre 08:00 e 20:00 (horário de Brasília) — conforme CDC
- **Frequência:** máximo 3 contatos por semana por devedor
- **Opt-out:** respeitado imediatamente, sem exceções
- **Valores:** armazenados em centavos (integer) — nunca float
- **Isolamento:** toda query ao banco inclui `tenantId` — dados nunca vazam entre empresas
- **Score:** recalculado diariamente por um job às 07:00

---

## Rotas da API

### Devedores
```
GET    /devedores              Lista com filtros e paginação
GET    /devedores/:id          Perfil com dívidas e histórico
POST   /devedores              Criar
PATCH  /devedores/:id          Atualizar
DELETE /devedores/:id          Soft delete
POST   /devedores/importar     Importação em lote (JSON array)
```

### Portal Público (sem autenticação)
```
GET    /portal/:token          Dados da dívida para o devedor
POST   /portal/:token/aceitar  Aceitar acordo + gerar cobrança
```

### Webhooks
```
POST   /webhooks/clerk         Criação de tenant via Clerk
POST   /webhooks/asaas         Confirmação de pagamento
POST   /webhooks/whatsapp/:id  Mensagem recebida / status atualizado
```

---

## Variáveis de Ambiente

Veja o arquivo [`.env.example`](.env.example) para a lista completa.

As variáveis obrigatórias para desenvolvimento são:

| Variável | Onde obter |
|---|---|
| `CLERK_SECRET_KEY` | [clerk.com](https://clerk.com) → API Keys |
| `CLERK_PUBLISHABLE_KEY` | [clerk.com](https://clerk.com) → API Keys |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Mesma chave acima |
| `DATABASE_URL` | Gerado automaticamente pelo Docker Compose |
| `REDIS_URL` | Gerado automaticamente pelo Docker Compose |

---

## Roadmap

### Sprint 1 — Fundação ✅
- [x] Monorepo Turborepo com Next.js + Fastify
- [x] Schema Prisma com soft-delete
- [x] Autenticação e multitenancy via Clerk
- [x] CRUD de devedores com importação CSV

### Sprint 2 — Engine de Régua
- [ ] Builder visual de régua (drag-and-drop com dnd-kit)
- [ ] Job cron + fila BullMQ + worker
- [ ] Integração WhatsApp (Evolution API)
- [ ] Integração E-mail (Resend)

### Sprint 3 — Acordos e Pagamento
- [ ] Portal público do devedor (`/acordo/:token`)
- [ ] Integração Asaas (Pix + boleto)
- [ ] Assinatura digital (Autentique)

### Sprint 4 — Dashboard e Polish
- [ ] Dashboard de métricas com Recharts
- [ ] Score de recuperabilidade
- [ ] Relatório aging list em PDF
- [ ] Billing com Stripe (planos Starter / Pro / Business)

### Fase 2 (pós-MVP)
- [ ] Negativação Serasa via Boa Vista API
- [ ] Integração ERP (Omie, Bling, Conta Azul)
- [ ] Voz automatizada para devedores sem resposta
- [ ] API pública para integrações externas

---

## Licença

Proprietário — todos os direitos reservados. Não é permitido uso, cópia ou distribuição sem autorização expressa.
