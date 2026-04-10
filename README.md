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

## Por que o Quitr existe

Quem já trabalhou com cobrança sabe: a maior parte do esforço vai para tarefas repetitivas. Mandar mensagem no WhatsApp um por um, controlar quem respondeu, gerar boleto na mão, cobrar de novo quem não pagou. O processo não escala e ainda corre o risco de violar o CDC se a frequência ou o horário estiver errado.

O Quitr resolve isso com uma régua de cobrança configurável que roda sozinha. O credor monta a régua uma vez, associa às dívidas e o sistema cuida do resto: manda as mensagens nos canais certos, na hora certa, respeita quem pediu para não ser contactado, e quando o devedor está pronto para negociar, gera o link de acordo com as opções de pagamento automaticamente.

---

## Funcionalidades

<table>
<tr>
<td width="50%" valign="top">

**Gestão de Devedores**
- Cadastro manual ou importação em lote via CSV
- Perfil comportamental calculado automaticamente: Pagador, Negligente, Negociador, Fantasma
- Score de recuperabilidade 0-100 recalculado todo dia
- Histórico completo de contatos por devedor

**Régua de Cobrança**
- Builder visual com drag-and-drop de etapas
- Canais: WhatsApp, E-mail, SMS
- Templates com variáveis dinâmicas
- Condições por etapa (sempre, sem resposta, não abriu)
- Compliance CDC automático (8h às 20h, máximo 3 contatos por semana)

</td>
<td width="50%" valign="top">

**Acordos e Pagamento**
- Link único por dívida com 72h de validade
- Portal de autoatendimento para o devedor, sem precisar criar conta
- Pix e boleto via Asaas
- Parcelamento configurável com desconto progressivo
- Assinatura digital do termo via Autentique

**Dashboard e Relatórios**
- Métricas de recuperação em tempo real
- Aging list por faixa de atraso
- Taxa de resposta por canal
- Exportação de relatório em PDF

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
                    └──────────────┬───────────────────┘
                                   │ HTTP (Bearer token)
                    ┌──────────────▼───────────────────┐
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
| Banco de dados | PostgreSQL 16 via Prisma ORM |
| Filas | BullMQ + Redis |
| Auth | Clerk com Organizations para multi-tenancy |
| WhatsApp | Evolution API (self-hosted) ou Z-API |
| E-mail | Resend |
| SMS | Zenvia |
| Pagamentos | Asaas (Pix, boleto, split) |
| Assinatura | Autentique |
| Negativação | Boa Vista SCPC B2B API |
| Storage | Cloudflare R2 |
| Monitoramento | Sentry + Axiom |
| Deploy | Railway |

---

## Estrutura do projeto

Monorepo com [Turborepo](https://turbo.build) e pnpm workspaces.

```
quitr/
├── apps/
│   ├── web/                        # Dashboard do credor (Next.js)
│   │   └── src/app/
│   │       ├── (auth)/             # Login e cadastro
│   │       ├── (dashboard)/        # Área autenticada
│   │       │   ├── devedores/      # Listagem, perfil, importação CSV
│   │       │   ├── reguas/         # Builder visual de régua
│   │       │   ├── acordos/        # Gestão de acordos
│   │       │   ├── relatorios/     # Aging list e métricas
│   │       │   └── settings/       # Configurações e integrações
│   │       └── acordo/[token]/     # Portal público do devedor
│   │
│   └── api/                        # REST API + jobs (Fastify)
│       └── src/
│           ├── modules/
│           │   ├── devedores/      # CRUD e importação em lote
│           │   ├── reguas/         # Engine de régua
│           │   ├── disparos/       # Fila BullMQ e worker
│           │   ├── acordos/        # Geração e gestão de acordos
│           │   └── score/          # Score de recuperabilidade
│           ├── integrations/
│           │   ├── whatsapp/       # Evolution API / Z-API
│           │   ├── email/          # Resend e templates
│           │   ├── sms/            # Zenvia
│           │   └── pagamento/      # Asaas
│           ├── jobs/
│           │   ├── regua.job.ts    # Cron 08:05 - executa régua
│           │   └── score.job.ts    # Cron 07:00 - recalcula scores
│           └── middlewares/
│               ├── auth.ts         # Valida JWT Clerk e faz upsert do tenant
│               └── tenant.ts       # Isolamento de dados por empresa
│
└── packages/
    ├── db/                         # Prisma schema, client e extensão de soft-delete
    ├── types/                      # Tipos TypeScript compartilhados
    └── utils/                      # Formatação, datas e interpolação de templates
```

---

## Modelo de dados

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

## Primeiros passos

### O que você precisa ter instalado

- [Node.js 20+](https://nodejs.org)
- [pnpm](https://pnpm.io): `npm i -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- Conta no [Clerk](https://clerk.com) com Organizations ativado (plano free funciona)

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

Preencha as chaves do Clerk no `.env`:

```dotenv
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

As chaves ficam em **Clerk Dashboard > API Keys**. Para ativar Organizations: **Configure > Organizations > Enable Organizations**.

### 3. Subir com Docker

```bash
docker compose up -d

# Acompanhar os logs
docker compose logs -f api web
```

### 4. Criar o banco de dados

```bash
docker compose exec api sh -c \
  'cd /app/packages/db && node_modules/.bin/prisma migrate dev --name init'
```

| Serviço | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API | http://localhost:3001 |
| Health check | http://localhost:3001/health |

---

## Desenvolvimento local sem Docker

Precisa de PostgreSQL e Redis rodando na máquina.

```bash
pnpm dev                         # Sobe tudo em paralelo
pnpm dev --filter=@repo/api      # Só a API
pnpm dev --filter=web            # Só o frontend

pnpm db:migrate                  # Rodar migrations pendentes
pnpm db:studio                   # Abre o Prisma Studio
pnpm build                       # Build de produção
pnpm test                        # Roda os testes
```

---

## Como a régua de cobrança funciona

Todo dia às 08:05 (horário de Brasília) um job processa todas as dívidas em aberto:

```
Para cada dívida ativa:
  1. Calcula quantos dias de atraso tem
  2. Busca a régua associada à dívida
  3. Para cada etapa onde diaOffset <= diasAtraso:
     - Já enviou para esta etapa? Pula.
     - Devedor pediu opt-out? Pula.
     - Atingiu o limite semanal de contatos? Pula.
     - A condição da etapa foi satisfeita? Continua.
     - Interpola o template com os dados do devedor
     - Cria o registro do Disparo e enfileira no BullMQ

Worker (5 instâncias simultâneas):
  - Envia pelo canal configurado (WhatsApp, e-mail ou SMS)
  - Atualiza o status do Disparo com timestamp
  - Se falhar: tenta mais 3 vezes com backoff (15min, 1h, 4h)
```

---

## API

Todas as rotas autenticadas precisam do header `Authorization: Bearer <clerk-jwt>`.

### Devedores

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/devedores` | Lista com filtros e paginação |
| `GET` | `/devedores/:id` | Perfil com dívidas e histórico de disparos |
| `POST` | `/devedores` | Criar devedor |
| `PATCH` | `/devedores/:id` | Atualizar dados |
| `DELETE` | `/devedores/:id` | Soft delete |
| `POST` | `/devedores/importar` | Importação em lote, retorna `{ criados, atualizados, erros }` |

### Portal público

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/portal/:token` | Dados da dívida para o devedor (sem autenticação) |
| `POST` | `/portal/:token/aceitar` | Confirmar acordo e gerar Pix/boleto |

### Webhooks

| Método | Rota | Origem |
|---|---|---|
| `POST` | `/webhooks/clerk` | Criação de tenant via Clerk |
| `POST` | `/webhooks/asaas` | Confirmação ou vencimento de pagamento |
| `POST` | `/webhooks/whatsapp/:tenantId` | Mensagem recebida ou atualização de status |

### Formato de resposta

```typescript
// Sucesso
{ data: T, meta?: { total: number, page: number, pageSize: number, totalPages: number } }

// Erro
{ error: { code: string, message: string, details?: unknown } }
```

---

## Regras de negócio

| Regra | Como funciona |
|---|---|
| Horário de envio | Somente entre 08:00 e 20:00 horário de Brasília, conforme o CDC |
| Frequência | No máximo 3 contatos por semana por devedor |
| Opt-out | Respeitado imediatamente em todos os canais |
| Isolamento de dados | Toda query ao banco filtra por `tenantId`, dados nunca vazam entre empresas |
| Valores monetários | Armazenados em centavos (integer), nunca como float |
| Soft delete | Registros nunca são apagados fisicamente, apenas marcados com `deletedAt` |
| Tokens de acordo | UUID v4, não sequencial e não previsível |
| Webhook Asaas | Validado via HMAC antes de qualquer processamento |

---

## Score de recuperabilidade

Calculado diariamente para cada dívida ativa, de 0 a 100.

| Fator | Peso | Lógica |
|---|---|---|
| Dias em atraso | 40% | Quanto mais dias, menor a nota |
| Respondeu a última mensagem | 20% | Resposta nos últimos 7 dias vale 100 pts |
| Tentativas sem resposta | 20% | 6 ou mais tentativas ignoradas vale 20 pts |
| Histórico de pagamento | 10% | Já quitou dívida antes com o mesmo credor vale 100 pts |
| Valor da dívida | 10% | Dívidas menores têm score ligeiramente maior |

| Faixa | Ação sugerida |
|---|---|
| 70 a 100 | Régua leve com proposta de acordo imediata |
| 40 a 69 | Régua progressiva com desconto escalonado |
| 0 a 39 | Negativação e encaminhamento para escritório parceiro |

---

## Variáveis de ambiente

Veja o [`.env.example`](.env.example) para a lista completa. As obrigatórias para rodar localmente:

| Variável | Onde encontrar |
|---|---|
| `CLERK_SECRET_KEY` | [clerk.com](https://clerk.com) > API Keys |
| `CLERK_PUBLISHABLE_KEY` | mesma página |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | mesma chave |
| `DATABASE_URL` | gerado automaticamente pelo Docker Compose |
| `REDIS_URL` | gerado automaticamente pelo Docker Compose |

---

## Roadmap

### Sprint 1 - Fundação ✅
- Monorepo Turborepo com Next.js 14, Fastify 5 e Prisma
- Auth e multi-tenancy com Clerk Organizations
- CRUD de devedores com importação CSV
- Docker Compose para desenvolvimento local

### Sprint 2 - Engine de cobrança
- [ ] Builder visual de régua com dnd-kit
- [ ] Job cron, filas BullMQ e worker
- [ ] Integração WhatsApp via Evolution API
- [ ] Integração e-mail via Resend

### Sprint 3 - Acordos e pagamento
- [ ] Portal público do devedor em `/acordo/:token`
- [ ] Integração Asaas com Pix, boleto e webhooks
- [ ] Assinatura digital via Autentique

### Sprint 4 - Dashboard e monetização
- [ ] Dashboard de métricas com Recharts
- [ ] Score de recuperabilidade com job diário
- [ ] Exportação de aging list em PDF
- [ ] Billing com Stripe

### Fase 2
- [ ] Negativação Serasa via Boa Vista API
- [ ] Integrações com ERPs brasileiros (Omie, Bling, Conta Azul)
- [ ] Ligação automatizada por voz para devedores sem resposta
- [ ] API pública para integrações externas

---

## Checklist pré-produção

- [ ] Política de privacidade, termos de uso e banner de cookies (LGPD)
- [ ] Validar horários e frequência de envio conforme o CDC
- [ ] Rate limiting nas rotas públicas do portal
- [ ] Tokens de acordo sendo gerados como UUID v4
- [ ] Webhook do Asaas com validação HMAC
- [ ] API keys de terceiros criptografadas no banco
- [ ] Sentry configurado nos dois apps
- [ ] SPF, DKIM e DMARC no domínio de e-mail
- [ ] Backup automático do PostgreSQL ativo
- [ ] Fluxo completo testado no ambiente de sandbox

---

## Licença

Código proprietário. Todos os direitos reservados.
