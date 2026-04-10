# CLAUDE.md — SaaS de Cobrança e Recuperação de Crédito

## Contexto do negócio

Este é um SaaS B2B multi-tenant de automação de cobrança e recuperação de dívidas para o mercado brasileiro. O fundador tem 4 anos de experiência prática como cobrador de dívidas, o que informa as regras de negócio, os perfis de devedores e a lógica das réguas de cobrança embutida no sistema.

O produto permite que empresas (credores) automatizem toda a régua de cobrança de clientes inadimplentes via WhatsApp, e-mail e SMS, com geração de acordos online, pagamento via Pix/boleto e negativação no Serasa.

---

## Arquitetura do projeto

Monorepo com Turborepo.

```
cobranca-saas/
├── apps/
│   ├── web/          # Next.js 14 App Router — dashboard do credor
│   └── api/          # Fastify + TypeScript — backend REST + jobs
├── packages/
│   ├── db/           # Prisma schema + migrations + client
│   ├── types/        # tipos TypeScript compartilhados entre apps
│   └── utils/        # helpers de formatação, datas, cálculos financeiros
└── CLAUDE.md
```

### Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router), shadcn/ui, Tailwind CSS, TanStack Table, dnd-kit, Recharts |
| Backend | Fastify, TypeScript, Zod (validação) |
| Banco de dados | PostgreSQL via Prisma ORM |
| Filas | BullMQ + Redis |
| Auth | Clerk (multitenancy) |
| WhatsApp | Evolution API (self-hosted) ou Z-API |
| E-mail | Resend |
| SMS | Zenvia |
| Pagamento | Asaas (boleto, Pix, split) |
| Assinatura digital | Autentique |
| Negativação | Boa Vista SCPC B2B API |
| Deploy | Railway (PostgreSQL + Redis + app) |
| Storage | Cloudflare R2 |
| Monitoramento | Sentry (erros) + Axiom (logs) |

---

## Domínio — entidades principais

### Tenant
Empresa cliente do SaaS (o credor). Cada tenant tem sua própria configuração de réguas, integrações e devedores. Nunca misturar dados entre tenants.

### Devedor
Pessoa física ou jurídica que deve ao credor. Possui perfil comportamental calculado automaticamente:
- `pagador`: histórico de pagamento positivo — abordagem gentil
- `negligente`: nunca abre mensagens — escala para SMS e voz
- `negociador`: respondeu mas pediu prazo — propor parcelamento
- `fantasma`: sem resposta há mais de 30 dias — negativação + notificação extrajudicial

### Divida
Cada devedor pode ter múltiplas dívidas. Uma dívida tem: valor original, valor atualizado (com multa e juros), data de vencimento, status (`em_aberto`, `em_negociacao`, `acordo_firmado`, `quitada`, `protestada`, `negativada`).

### Regua
Template de cobrança configurado pelo credor. Contém uma lista ordenada de EtapaRegua. O credor pode ter múltiplas réguas para perfis diferentes de dívida (ex: "Régua Padrão 30 dias", "Régua Agressiva 90 dias").

### EtapaRegua
Uma etapa dentro de uma régua. Campos:
- `diaOffset`: quantos dias após o vencimento esta etapa é executada (pode ser negativo para pré-vencimento)
- `canal`: `whatsapp` | `email` | `sms`
- `mensagemTemplate`: string com variáveis `{nome}`, `{valor}`, `{vencimento}`, `{linkAcordo}`, `{empresa}`
- `condicao`: `sempre` | `semResposta` | `comResposta` | `naoAbriu`
- `acao`: `enviarMensagem` | `gerarAcordo` | `negativar` | `protestar`

### Disparo
Registro de cada mensagem enviada (ou tentativa). Armazena: status (`pendente`, `enviado`, `entregue`, `lido`, `respondido`, `falhou`), timestamp de cada evento, conteúdo exato enviado. Essencial para auditoria e compliance.

### Acordo
Negociação firmada entre credor e devedor. Contém: valor total, entrada, número de parcelas, data de assinatura, link do documento assinado (Autentique), status de cada parcela.

### Cobranca
Registro financeiro de cada boleto ou Pix gerado no Asaas. Referencia o Acordo e a Parcela correspondente. Webhook do Asaas atualiza o status automaticamente.

---

## Regras de negócio críticas

### Compliance de cobrança (CDC + LGPD)
- **Nunca** enviar mensagens antes das 8h ou após as 20h (horário de Brasília)
- **Nunca** enviar mais de 3 contatos por semana para o mesmo devedor
- **Nunca** expor informações da dívida para terceiros
- Toda mensagem deve ter identificação clara do credor
- Registrar timestamp e conteúdo de todos os disparos para auditoria
- Devedor pode solicitar opt-out a qualquer momento — respeitar imediatamente

### Cálculo de multa e juros
```
valorAtualizado = valorOriginal * (1 + multa) + (valorOriginal * jurosMensais * mesesAtraso)
multa padrão = 2% (aplicada uma vez no primeiro dia de atraso)
juros padrão = 1% ao mês (pro rata die)
```
Os percentuais de multa e juros são configurados por tenant.

### Score de recuperabilidade
Score 0–100 calculado para cada dívida, atualizado diariamente:

| Variável | Peso | Lógica |
|---|---|---|
| Dias em atraso | 40% | Quanto mais dias, menor a nota |
| Respondeu última mensagem | 20% | Sim = nota alta |
| Total de tentativas sem resposta | 20% | Muitas tentativas = nota baixa |
| Histórico de pagamento anterior | 10% | Pagou antes com atraso = nota média |
| Valor da dívida | 10% | Dívidas maiores têm peso ligeiramente menor |

- Score ≥ 70 → verde → ação: régua leve + proposta de acordo
- Score 40–69 → amarelo → ação: régua progressiva + desconto escalonado
- Score < 40 → vermelho → ação: negativação + encaminhar para escritório parceiro

### Geração de link de acordo
Cada devedor recebe um link único `/acordo/{token}` com validade de 72 horas. O token é um UUID v4 armazenado em `Divida.acordoToken`. O portal é público (sem login) e exibe apenas as informações da dívida referenciada pelo token.

---

## Fluxo principal — execução da régua

O job diário roda às 08:05 (horário de Brasília) e executa:

```
1. Buscar todas as Dividas com status = 'em_aberto' ou 'em_negociacao'
2. Para cada Divida:
   a. Calcular diasAtraso = today - divida.dataVencimento
   b. Buscar a Regua ativa do tenant
   c. Para cada EtapaRegua onde etapa.diaOffset <= diasAtraso:
      - Verificar se já existe Disparo para esta etapa nesta dívida
      - Verificar condicao da etapa (semResposta, comResposta, etc.)
      - Se elegível: enfileirar no BullMQ
3. Worker do BullMQ processa cada disparo:
   a. Interpolar template com dados do devedor
   b. Chamar API do canal (WhatsApp/email/SMS)
   c. Registrar Disparo com status e timestamp
   d. Em caso de falha: retentar até 3x com backoff exponencial
```

---

## Estrutura de pastas detalhada

### apps/api/src/

```
modules/
  devedores/
    devedores.routes.ts       # GET /devedores, POST /devedores, etc.
    devedores.service.ts      # lógica de negócio
    devedores.schema.ts       # Zod schemas de validação
    importacao.service.ts     # parse CSV + validação + upsert em batch
  reguas/
    reguas.routes.ts
    reguas.service.ts
    engine.service.ts         # lógica de execução da régua
  disparos/
    disparos.routes.ts
    disparos.service.ts
    queue.ts                  # configuração BullMQ
    worker.ts                 # consumer da fila
  acordos/
    acordos.routes.ts
    acordos.service.ts
    portal.routes.ts          # rotas públicas /acordo/:token
  cobrancas/
    asaas.service.ts          # integração Asaas
    cobrancas.routes.ts
  webhooks/
    asaas.webhook.ts          # pagamento confirmado
    whatsapp.webhook.ts       # mensagem recebida/lida
  score/
    score.service.ts          # cálculo do score de recuperabilidade

integrations/
  whatsapp/
    evolution.client.ts       # Evolution API
    zapi.client.ts            # Z-API (alternativa)
  email/
    resend.client.ts
    templates/
      cobranca.tsx            # template React Email
      acordo.tsx
  sms/
    zenvia.client.ts
  negativacao/
    boavista.client.ts

jobs/
  regua.job.ts                # cron diário 08:05
  score.job.ts                # cron diário 07:00 — recalcula scores
  acordo.job.ts               # verifica acordos vencidos

middlewares/
  auth.middleware.ts          # valida token Clerk + injeta tenantId
  tenant.middleware.ts        # garante isolamento de dados
```

### apps/web/app/

```
(auth)/
  login/page.tsx
  cadastro/page.tsx

(dashboard)/
  layout.tsx                  # sidebar + header com tenant info
  page.tsx                    # dashboard com métricas
  devedores/
    page.tsx                  # tabela com filtros e paginação
    [id]/page.tsx             # perfil do devedor + histórico
    importar/page.tsx         # upload CSV com preview
  reguas/
    page.tsx                  # listagem de réguas
    [id]/page.tsx             # builder visual drag-and-drop
    nova/page.tsx
  acordos/
    page.tsx                  # acordos em andamento
    [id]/page.tsx
  relatorios/
    page.tsx                  # aging list + gráficos
  settings/
    page.tsx                  # configurações do tenant
    integracoes/page.tsx      # conectar WhatsApp, Asaas, etc.

acordo/
  [token]/page.tsx            # portal público do devedor (sem auth)
```

---

## Convenções de código

### Nomenclatura
- Arquivos e pastas: `kebab-case`
- Classes e tipos TypeScript: `PascalCase`
- Funções e variáveis: `camelCase`
- Constantes globais: `UPPER_SNAKE_CASE`
- Campos do banco Prisma: `camelCase`

### Padrão de resposta da API
```typescript
// Sucesso
{ data: T, meta?: { total: number, page: number } }

// Erro
{ error: { code: string, message: string, details?: unknown } }
```

### Isolamento de tenant
Toda query ao banco DEVE incluir `tenantId` como filtro. Nunca fazer query sem `where: { tenantId }`. O `tenantId` vem sempre do middleware de auth, nunca do body da requisição.

```typescript
// CORRETO
const devedores = await db.devedor.findMany({
  where: { tenantId: req.tenantId, ...filtros }
})

// ERRADO — nunca fazer isso
const devedores = await db.devedor.findMany({ where: filtros })
```

### Tratamento de datas
- Sempre usar UTC no banco de dados
- Converter para horário de Brasília apenas na exibição (use `date-fns-tz`)
- Verificar horário de Brasília antes de qualquer disparo (08:00–20:00)

### Valores monetários
- Armazenar sempre em **centavos** (integer) no banco — nunca float
- Exibir formatado com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`

---

## Variáveis de ambiente necessárias

```bash
# Banco
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=

# WhatsApp
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
ZAPI_INSTANCE=
ZAPI_TOKEN=

# E-mail
RESEND_API_KEY=

# SMS
ZENVIA_API_KEY=

# Pagamento
ASAAS_API_KEY=
ASAAS_WEBHOOK_SECRET=

# Assinatura digital
AUTENTIQUE_API_KEY=

# Negativação
BOAVISTA_API_KEY=
BOAVISTA_API_SECRET=

# Storage
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_ACCESS_KEY=
CLOUDFLARE_R2_SECRET_KEY=

# App
APP_URL=https://app.seudominio.com.br
API_URL=https://api.seudominio.com.br
NODE_ENV=production
```

---

## Comandos úteis

```bash
# Instalar dependências
pnpm install

# Rodar em desenvolvimento
pnpm dev

# Rodar apenas o backend
pnpm dev --filter=api

# Rodar apenas o frontend
pnpm dev --filter=web

# Rodar migrations do banco
pnpm db:migrate

# Abrir Prisma Studio
pnpm db:studio

# Build de produção
pnpm build

# Rodar testes
pnpm test
```

---

## Ordem de implementação recomendada (MVP)

1. **Setup do monorepo** — Turborepo, ESLint, TypeScript, Prettier
2. **Schema Prisma** — todas as entidades com relacionamentos
3. **Auth + multitenancy** — Clerk, middleware de tenant, isolamento
4. **CRUD de devedores** — listagem, cadastro manual, importação CSV
5. **Builder de régua** — UI drag-and-drop + persistência
6. **Engine de régua** — job cron + fila BullMQ + worker
7. **Integração WhatsApp** — Evolution API, envio e webhook de resposta
8. **Integração e-mail** — Resend + templates React Email
9. **Portal do devedor** — página pública de acordo
10. **Integração Asaas** — geração de cobrança Pix/boleto + webhook
11. **Score de recuperabilidade** — cálculo diário, exibição no perfil
12. **Dashboard e relatórios** — métricas de recuperação, aging list PDF
13. **Billing** — Stripe, planos, trial 14 dias

---

## Notas importantes para o Claude Code

- Antes de criar qualquer arquivo, verifique se já existe algo similar na estrutura
- Sempre validar inputs com Zod antes de qualquer operação no banco
- Ao criar rotas no Fastify, sempre incluir o middleware de auth e o de tenant
- Nunca expor stacktrace de erros ao cliente em produção
- Ao integrar APIs externas, sempre implementar retry com backoff exponencial
- Todas as operações financeiras (valores, cálculos) devem ter testes unitários
- Ao trabalhar com templates de mensagem, nunca executar string como código
- O campo `tenantId` nunca deve vir do body — sempre do token autenticado