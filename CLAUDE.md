# CLAUDE.md — Quitr · SaaS de Cobrança e Recuperação de Crédito

## Contexto do negócio

O Quitr é um SaaS B2B multi-tenant de automação de cobrança e recuperação de dívidas para o
mercado brasileiro. O fundador tem 4 anos de experiência prática como cobrador de dívidas, o que
informa diretamente as regras de negócio, os perfis comportamentais de devedores, a lógica das
réguas de cobrança e todos os módulos operacionais do sistema.

O produto permite que empresas (credores) automatizem toda a operação de cobrança: régua de
contato via WhatsApp, e-mail e SMS, geração de acordos online com assinatura digital, pagamento
via Pix/boleto, negativação no Serasa, comissionamento de equipe, enriquecimento de contato por
CPF e score duplo de recuperabilidade + contactabilidade.

---

## Arquitetura do projeto

Monorepo com Turborepo + pnpm workspaces.

```
quitr/
├── apps/
│   ├── web/          # Next.js 14 App Router — dashboard do credor
│   └── api/          # Fastify + TypeScript — backend REST + jobs
├── packages/
│   ├── db/           # Prisma schema + migrations + client
│   ├── types/        # tipos TypeScript compartilhados entre apps
│   └── utils/        # helpers de formatação, datas, cálculos financeiros
├── infra/            # Terraform (OpenTofu) — toda a infraestrutura AWS
└── CLAUDE.md
```

### Stack de aplicação

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router), shadcn/ui, Tailwind CSS, TanStack Table, dnd-kit, Recharts |
| Backend | Fastify, TypeScript, Zod (validação) |
| Banco de dados | PostgreSQL via Prisma ORM |
| Filas (jobs diários) | BullMQ + ElastiCache Redis |
| Filas (disparos) | AWS SQS FIFO + Lambda workers |
| Auth | Clerk (multitenancy) |
| WhatsApp | Evolution API (self-hosted) ou Z-API |
| E-mail | Resend |
| SMS | Zenvia |
| Pagamento | Asaas (boleto, Pix, split) |
| Assinatura digital | Autentique |
| Negativação | Boa Vista SCPC B2B API |
| Enriquecimento CPF | Big Data Corp / Assertiva / Neoway |
| Storage | AWS S3 + CloudFront |
| Monitoramento | Sentry (erros) + CloudWatch (logs, métricas, alertas) |
| Tracing | AWS X-Ray |

### Stack de infraestrutura AWS

| Serviço | Uso |
|---|---|
| ECS Fargate | API Fastify — containers sem gerenciar EC2 |
| App Runner | Next.js — scale-to-zero, deploy via ECR |
| RDS Aurora Serverless v2 | PostgreSQL — escala automática 0.5–N ACUs |
| ElastiCache Redis | BullMQ, cache de score, sessions |
| SQS FIFO + DLQ | Fila de disparos WhatsApp/e-mail/SMS |
| Lambda | Workers que consomem SQS — escala automática |
| EventBridge Scheduler | Crons diários (régua 08:05, score 07:00, acordos 09:00) |
| ALB | Load balancer HTTPS para ECS |
| CloudFront + WAF | CDN global + proteção contra ataques |
| Route 53 | DNS |
| ACM | Certificados SSL (gratuitos) |
| ECR | Registry privado de imagens Docker |
| S3 | Documentos, acordos assinados, assets, Terraform state |
| Secrets Manager | Credenciais de APIs e banco — nunca env vars em texto puro |
| Parameter Store | Configs não-sensíveis e feature flags (grátis no tier Standard) |
| IAM | Roles com least privilege para ECS, Lambda e GitHub Actions |
| VPC | Rede isolada: subnets públicas (ALB, NAT) + privadas (app, dados) |
| CloudWatch | Logs, métricas, alarmes, dashboards |
| X-Ray | Distributed tracing entre serviços |

---

## Infraestrutura como código — Terraform (OpenTofu)

Todo recurso AWS é criado e gerenciado via Terraform. **Nunca criar recursos manualmente pelo
console AWS.** Se criou no console para testar, codificar imediatamente depois ou destruir.

Usamos **OpenTofu** — fork open-source 100% compatível com HCL do Terraform, mantido pela Linux
Foundation, sem restrições de licença comercial. Comandos idênticos ao Terraform, só substitui
o binário `terraform` por `tofu`.

### Estrutura da pasta infra/

```
infra/
├── main.tf                  # provider AWS, região sa-east-1, backend S3
├── variables.tf             # inputs (ambiente, tamanhos, domínio)
├── outputs.tf               # outputs (URLs, ARNs, connection strings)
├── terraform.tfvars         # valores do ambiente — nunca commitar segredos
│
├── modules/
│   ├── vpc/                 # VPC, subnets, IGW, NAT Gateway, route tables
│   ├── ecs/                 # cluster, task definition, service, ECR, IAM roles
│   ├── rds/                 # Aurora Serverless v2, subnet group, parameter group
│   ├── elasticache/         # Redis cluster, subnet group
│   ├── sqs/                 # filas FIFO de disparos + dead-letter queue
│   ├── lambda/              # workers de disparo, event source mapping SQS→Lambda
│   ├── eventbridge/         # crons diários (régua, score, acordo vencido)
│   ├── alb/                 # Application Load Balancer, target groups, listeners
│   ├── cdn/                 # CloudFront, WAF, Route 53, ACM
│   ├── secrets/             # Secrets Manager, Parameter Store
│   └── monitoring/          # CloudWatch dashboards, alarmes, budget alert
│
└── environments/
    ├── dev/                 # instâncias mínimas, sem Multi-AZ, scale-to-zero
    └── prod/                # Multi-AZ, backup 7 dias, alarmes ativos
```

### Backend remoto — state no S3 (obrigatório desde o primeiro recurso)

O `terraform.tfstate` contém segredos em texto puro — nunca vai para o git.

```hcl
terraform {
  backend "s3" {
    bucket         = "quitr-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "sa-east-1"
    encrypt        = true
    dynamodb_table = "quitr-terraform-locks"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "sa-east-1"
  default_tags {
    tags = {
      Project     = "quitr"
      Environment = var.env
      ManagedBy   = "terraform"
    }
  }
}
```

### Padrões de código Terraform no projeto

```hcl
# Todos os recursos seguem snake_case com prefixo do módulo
resource "aws_ecs_service" "api" { ... }
resource "aws_security_group" "ecs_api" { ... }

# Variáveis de ambiente sensíveis vêm do Secrets Manager — nunca hardcoded
resource "aws_ecs_task_definition" "api" {
  container_definitions = jsonencode([{
    name  = "api"
    image = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
      { name = "CLERK_SECRET_KEY", valueFrom = aws_secretsmanager_secret.clerk.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options   = { "awslogs-group" = "/quitr/api", "awslogs-region" = "sa-east-1" }
    }
  }])
}

# Security Groups: regra mínima — só abrir o que é necessário
resource "aws_security_group_rule" "ecs_to_rds" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
  security_group_id        = aws_security_group.ecs_api.id
}
```

### Comandos do dia a dia

```bash
# Inicializar (primeira vez ou novo módulo adicionado)
tofu init

# Ver o que vai mudar ANTES de aplicar — obrigatório sempre
tofu plan -var-file=environments/dev/terraform.tfvars

# Aplicar
tofu apply -var-file=environments/dev/terraform.tfvars

# Destruir tudo (economizar crédito AWS nos fins de semana)
tofu destroy -var-file=environments/dev/terraform.tfvars

# Ver outputs gerados (URLs, ARNs, connection strings)
tofu output

# Importar recurso criado manualmente para o state (quando necessário)
tofu import aws_s3_bucket.state quitr-terraform-state
```

### CI/CD com GitHub Actions

OIDC com IAM role — sem AWS keys no repositório.

```yaml
# .github/workflows/deploy.yml
name: Deploy Quitr
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # necessário para OIDC
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: sa-east-1

      - name: Build e push imagem API
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
          docker build -t quitr-api:${{ github.sha }} ./apps/api
          docker push $ECR_URL/quitr-api:${{ github.sha }}

      - name: Terraform apply
        run: |
          cd infra
          tofu init
          tofu apply -auto-approve \
            -var="api_image_tag=${{ github.sha }}" \
            -var-file=environments/prod/terraform.tfvars
```

### Estimativa de custo mensal — região sa-east-1

| Serviço | Custo/mês |
|---|---|
| ECS Fargate API (1–2 tasks 0.5vCPU/1GB) | ~$20 |
| App Runner Next.js (scale-to-zero) | ~$8 |
| RDS Aurora Serverless v2 (0.5–2 ACUs) | ~$25 |
| ElastiCache Redis (cache.t4g.micro) | ~$15 |
| ALB + CloudFront + Route 53 | ~$5 |
| Lambda + SQS + EventBridge + S3 | ~$2 |
| **Total MVP** | **~$75/mês** |

Com $100 de crédito: ~5–6 semanas. Rodar `tofu destroy` nos fins de semana quando não há
desenvolvimento pode estender para 3–4 meses.

---

## Domínio — entidades principais

### Tenant
Empresa cliente do SaaS (o credor). Cada tenant tem configuração própria de réguas, integrações,
políticas de desconto e equipe. Dados nunca se misturam entre tenants.

### Devedor
PF ou PJ que deve ao credor. Possui dois scores calculados diariamente:

**Score de recuperabilidade (0–100):** vai pagar?
- ≥ 70 → verde → régua leve + acordo imediato
- 40–69 → amarelo → régua progressiva + desconto escalonado
- < 40 → vermelho → negativação + encaminhar para escritório parceiro

**Score de contactabilidade (0–100):** consegue falar com ele?
- Alto recuper. + baixo contact. → vale gastar crédito de bureau para achar novo número
- Baixo recuper. + alto contact. → régua rápida, negativar logo
- Baixo nos dois → sugerir venda da carteira

**Perfil comportamental** (calculado a partir do histórico de disparos):
- `pagador`: histórico positivo — abordagem gentil, 1 contato
- `negligente`: nunca abre mensagens — escala para SMS + voz
- `negociador`: respondeu mas pediu prazo — propor parcelamento
- `fantasma`: sem resposta há 30+ dias — negativação + notificação extrajudicial
- `reincidente`: quebrou 2+ acordos — badge "alto risco", sem desconto, régua agressiva

### Divida
Múltiplas dívidas por devedor. Campos críticos:
- `valorOriginal` e `valorAtualizado` — sempre em centavos (integer)
- `dataVencimento` — base para diasAtraso e execução da régua
- `acordoToken` (UUID v4) + `acordoTokenExpira` — link público do portal
- `scoreRecuperabilidade` + `scoreContactabilidade` — recalculados diariamente

Status: `em_aberto` | `em_negociacao` | `acordo_firmado` | `quitada` | `protestada` |
`negativada` | `cancelada`

### Regua
Template de cobrança configurado pelo credor com EtapaReguas ordenadas.

### EtapaRegua
- `diaOffset`: dias após vencimento (negativo = antes)
- `canal`: `whatsapp` | `email` | `sms`
- `condicao`: `sempre` | `semResposta` | `comResposta` | `naoAbriu` | `acordoNaoFirmado`
- `acao`: `enviarMensagem` | `gerarAcordo` | `negativar` | `protestar` | `encaminhar`
- `mensagemTemplate`: variáveis `{nome}`, `{valor}`, `{vencimento}`, `{diasAtraso}`,
  `{linkAcordo}`, `{empresa}`, `{telefoneEmpresa}`

### Disparo
Registro imutável de cada tentativa de contato. Armazena canal, status, conteúdo exato enviado,
timestamps de cada evento (enviado, entregue, lido, respondido), resposta do devedor. Essencial
para auditoria, compliance e prova jurídica.

### Acordo
Ciclo de vida: `pendente` → `aceito` → `assinado` → `pago` | `inadimplente` | `cancelado`

Campos de controle de quebra:
- `tentativasRefatoracao`: quantas vezes foi refeito (limite configurável por tenant)
- `multaQuebraPercentual`: % adicional ao refazer acordo quebrado
- `autentiqueId` + `documentoUrl`: assinatura digital

### Parcela
Ao quebrar acordo, parcelas em aberto são canceladas e novo Acordo é criado com saldo devedor
recalculado (restante + juros do período de inadimplência do acordo anterior).

### ContatoDevedor
Cada número/e-mail do devedor com rastreabilidade de origem:
- `fonte`: `credor` | `bureau_bigdatacorp` | `bureau_assertiva` | `devedor_confirmou`
- `status`: `ativo` | `pendente_confirmacao` | `invalido` | `optout`
- Contatos via bureau entram como `pendente_confirmacao` — operador aprova antes de usar

### Comissao (módulo da equipe)
- Atribuição de carteira por cobrador
- Modelo configurável: `POR_ACORDO_ASSINADO` | `POR_PARCELA_PAGA`
- Faixas de percentual por valor recuperado no mês
- Dashboard individual + ranking + fechamento mensal em PDF

---

## Regras de negócio críticas

### Compliance (CDC + LGPD)
- Nunca enviar mensagens antes das 8h ou após as 20h (horário de Brasília)
- Máximo 3 contatos por semana por devedor
- Nunca expor dados da dívida para terceiros
- Toda mensagem tem identificação clara do credor
- Opt-out respeitado imediatamente e registrado com data e canal
- Enriquecimento via bureau: registrar finalidade ("cobrança de dívida própria — CDC Art. 42")
  automaticamente em cada consulta

### Cálculo financeiro — regras invioláveis
```
valorAtualizado = valorOriginal * (1 + multaPercentual/100)
                + (valorOriginal * jurosMensais/100 * diasAtraso/30)

multa: aplica UMA vez no primeiro dia de atraso
juros: pro rata die sobre o valor original (não sobre valor + multa)
```
- Valores sempre em centavos (integer) — nunca float
- Todo valor exibido tem botão "ver cálculo" com memória detalhada
- Testes unitários obrigatórios para toda lógica de cálculo

### Ciclo de vida do acordo — quebra e refatoração
```
1. Parcela vencida há N dias → acordo INADIMPLENTE (N configurável por tenant)
2. Notificação automática ao devedor e ao credor
3. Verificar tentativasRefatoracao:
   - Se < limite: oferecer refatoração com saldo atualizado
   - Se >= limite: negativação automática
4. Novo Acordo com:
   - valor = parcelas não pagas + juros do período de quebra + multaQuebraPercentual
   - Histórico do acordo anterior preservado e imutável
```

### Score de recuperabilidade — algoritmo rules-based (v1)

| Fator | Peso | Pontuação |
|---|---|---|
| Dias em atraso | 40% | 0–15d=100, 16–30d=80, 31–60d=50, 61–90d=30, 90+d=10 |
| Respondeu última mensagem | 20% | últimos 7d=100, últimos 30d=70, nunca=20 |
| Tentativas sem resposta | 20% | 0–2=100, 3–5=60, 6+=20 |
| Histórico de pagamento | 10% | quitou antes=100, neutro=50, quebrou acordo=20 |
| Valor da dívida | 10% | <R$500=90, R$500–2k=70, R$2k–10k=50, >R$10k=30 |

V2: modelo ML treinado com dados acumulados após 6 meses de operação.

---

## Fluxo principal — execução da régua

EventBridge aciona Lambda às 08:05 BRT (= `cron(5 11 * * ? *)` em UTC):

```
1. Buscar todas as Dividas com status = 'em_aberto' ou 'em_negociacao'
2. Para cada Divida:
   a. diasAtraso = today - divida.dataVencimento
   b. Buscar Regua ativa (reguaId da dívida ou régua padrão do tenant)
   c. Para cada EtapaRegua onde diaOffset <= diasAtraso E ativa = true:
      - Verificar se Disparo para (dividaId + etapaId) já existe com status != FALHOU
      - Verificar condição da etapa
      - Verificar opt-out do canal
      - Verificar limite semanal (tenant.maxContatosSemana)
      - Verificar janela 08:00–20:00 BRT
      - Interpolar template com dados reais
      - Criar Disparo com status PENDENTE
      - Publicar no SQS FIFO com MessageGroupId = devedorId
3. Lambda worker consome SQS (até 5 workers simultâneos):
   a. Chamar API do canal
   b. Atualizar Disparo: ENVIADO + externalId
   c. Falha: SQS retry automático até 3x → DLQ
```

---

## Estrutura de pastas detalhada

### apps/api/src/

```
modules/
  devedores/
    devedores.routes.ts
    devedores.service.ts
    devedores.schema.ts
    importacao.service.ts         # CSV + validação + upsert em batch
    contatos.service.ts           # múltiplos contatos + bureau + aprovação
  reguas/
    reguas.routes.ts
    reguas.service.ts
    engine.service.ts             # lógica de execução da régua
  disparos/
    disparos.routes.ts
    disparos.service.ts
    sqs.producer.ts               # publica no SQS FIFO
    lambda-worker.ts              # handler Lambda (entry point separado)
  acordos/
    acordos.routes.ts
    acordos.service.ts
    refatoracao.service.ts        # quebra + recálculo + novo acordo
    portal.routes.ts              # rotas públicas /acordo/:token
  cobrancas/
    asaas.service.ts
    cobrancas.routes.ts
  comissao/
    comissao.service.ts           # cálculo e fechamento mensal
    comissao.routes.ts
  score/
    score.service.ts              # recuperabilidade + contactabilidade
  bureau/
    bigdatacorp.client.ts
    assertiva.client.ts
    consulta.service.ts           # orquestra bureau + validação + registro LGPD
  webhooks/
    asaas.webhook.ts
    whatsapp.webhook.ts
    autentique.webhook.ts

integrations/
  whatsapp/
    evolution.client.ts
    zapi.client.ts
  email/
    resend.client.ts
    templates/
      cobranca.tsx
      acordo.tsx
      confirmacao-pagamento.tsx
  sms/
    zenvia.client.ts
  negativacao/
    boavista.client.ts
  assinatura/
    autentique.client.ts
    acordo-template.ts

jobs/                             # handlers Lambda acionados pelo EventBridge
  regua.handler.ts                # 08:05 BRT
  score.handler.ts                # 07:00 BRT
  acordo-vencido.handler.ts       # 09:00 BRT — verifica inadimplências
  comissao-fechamento.handler.ts  # 1º de cada mês, 06:00 BRT

middlewares/
  auth.middleware.ts
  tenant.middleware.ts
  plano.middleware.ts             # verifica limite de devedores por plano
```

### apps/web/app/

```
(auth)/
  login/page.tsx
  cadastro/page.tsx

(dashboard)/
  layout.tsx
  page.tsx                        # métricas: recuperado, em aberto, taxa, acordos
  devedores/
    page.tsx                      # tabela + score duplo + perfil comportamental
    [id]/page.tsx                 # prontuário: timeline, notas, contatos, scores
    importar/page.tsx
  reguas/
    page.tsx
    [id]/page.tsx                 # builder drag-and-drop
    nova/page.tsx
  acordos/
    page.tsx
    [id]/page.tsx                 # timeline do acordo + parcelas + documentos
  comissao/
    page.tsx                      # dashboard da equipe + ranking + fechamento
    [userId]/page.tsx             # carteira individual do cobrador
  relatorios/
    page.tsx                      # aging list + gráficos + exportação PDF
  settings/
    page.tsx
    integracoes/page.tsx
    plano/page.tsx                # billing Stripe

acordo/
  [token]/page.tsx                # portal público do devedor (sem auth)
```

---

## Convenções de código

### Nomenclatura
- Arquivos e pastas: `kebab-case`
- Tipos TypeScript: `PascalCase`
- Funções e variáveis: `camelCase`
- Constantes: `UPPER_SNAKE_CASE`
- Campos Prisma: `camelCase`
- Recursos Terraform: `snake_case` com prefixo do módulo

### Padrão de resposta da API
```typescript
{ data: T, meta?: { total: number, page: number } }    // sucesso
{ error: { code: string, message: string, details?: unknown } }  // erro
```

### Isolamento de tenant — regra inviolável
```typescript
// CORRETO — tenantId sempre do middleware, nunca do body
const devedores = await db.devedor.findMany({
  where: { tenantId: req.tenantId, ...filtros }
})

// ERRADO — nunca fazer
const devedores = await db.devedor.findMany({ where: filtros })
```

### Tratamento de datas
- UTC no banco sempre
- Converter para BRT apenas na exibição (`date-fns-tz`)
- EventBridge cron em UTC: `cron(5 11 * * ? *)` = 08:05 BRT

### Valores monetários
- Centavos (integer) no banco — nunca float
- Exibir: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- Testes unitários obrigatórios em toda lógica financeira

---

## Variáveis de ambiente

Em produção, variáveis sensíveis vivem no **AWS Secrets Manager** e são injetadas no container
ECS via IAM role. O `.env` é apenas para desenvolvimento local.

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

# E-mail / SMS
RESEND_API_KEY=
ZENVIA_API_KEY=

# Pagamento / Assinatura / Negativação
ASAAS_API_KEY=
ASAAS_WEBHOOK_SECRET=
AUTENTIQUE_API_KEY=
BOAVISTA_API_KEY=
BOAVISTA_API_SECRET=

# Bureaus de contato
BIGDATACORP_API_KEY=
ASSERTIVA_API_KEY=

# AWS (apenas local — em produção usa IAM role)
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# SQS
SQS_DISPAROS_URL=https://sqs.sa-east-1.amazonaws.com/.../quitr-disparos.fifo
SQS_DISPAROS_DLQ_URL=

# Storage
S3_BUCKET=quitr-documents
CLOUDFRONT_URL=https://cdn.quitr.com.br

# App
APP_URL=https://app.quitr.com.br
API_URL=https://api.quitr.com.br
NODE_ENV=production
```

---

## Comandos úteis

```bash
# ── Aplicação ─────────────────────────────────────
pnpm install
pnpm dev                           # todas as apps
pnpm dev --filter=api              # só backend
pnpm dev --filter=web              # só frontend
pnpm db:migrate                    # rodar migrations Prisma
pnpm db:studio                     # Prisma Studio
pnpm build
pnpm test

# ── Docker local ──────────────────────────────────
docker build -t quitr-api ./apps/api
docker build -t quitr-web ./apps/web
docker-compose up                  # api + web + postgres + redis

# ── Terraform (OpenTofu) ──────────────────────────
cd infra
tofu init
tofu plan  -var-file=environments/dev/terraform.tfvars
tofu apply -var-file=environments/dev/terraform.tfvars
tofu destroy -var-file=environments/dev/terraform.tfvars
tofu output

# ── AWS CLI úteis ─────────────────────────────────
# Logs em tempo real
aws logs tail /quitr/api --follow --region sa-east-1

# Forçar novo deploy ECS após push de imagem
aws ecs update-service --cluster quitr --service quitr-api --force-new-deployment

# Status da fila SQS
aws sqs get-queue-attributes --queue-url $SQS_DISPAROS_URL --attribute-names All

# Invocar Lambda manualmente (rodar job de régua agora)
aws lambda invoke --function-name quitr-regua-job --payload '{}' /dev/stdout

# Ver mensagens na DLQ
aws sqs receive-message --queue-url $SQS_DISPAROS_DLQ_URL --max-number-of-messages 10
```

---

## Ordem de implementação recomendada

### Fase 1 — Aplicação (semanas 1–8)
1. Setup monorepo (Turborepo, TypeScript, ESLint, Prettier)
2. Schema Prisma completo
3. Auth + multitenancy (Clerk)
4. CRUD de devedores + importação CSV
5. Builder de régua (drag-and-drop)
6. Engine de régua (SQS FIFO + Lambda worker)
7. Integração WhatsApp (Evolution API)
8. Integração e-mail (Resend + React Email)
9. Portal do devedor (página pública de acordo)
10. Integração Asaas (Pix/boleto + webhook)
11. Score de recuperabilidade + contactabilidade
12. Módulo de acordo (quebra + refatoração + ciclo de vida completo)
13. Módulo de comissão da equipe
14. Enriquecimento de contato via bureau (Big Data Corp / Assertiva)
15. Dashboard, aging list PDF, relatórios
16. Billing (Stripe, planos, trial 14 dias)

### Fase 2 — Infraestrutura AWS com Terraform (paralelo à fase 1)
1. Setup AWS: MFA, IAM user com permissões mínimas, budget alert $80, AWS CLI
2. Criar bucket S3 + tabela DynamoDB para Terraform state remoto
3. Módulo VPC: subnets públicas/privadas, IGW, NAT Gateway, route tables
4. Módulos de dados: RDS Aurora Serverless v2, ElastiCache Redis
5. ECR: repositórios para imagens api e web
6. Dockerfiles multi-stage + docker-compose local
7. ECS Fargate + ALB: cluster, task definition, service, target group, HTTPS
8. App Runner: serviço Next.js + domínio customizado
9. SQS FIFO + Lambda workers: filas de disparos + DLQ + event source mapping
10. EventBridge Scheduler: crons diários para cada job handler
11. Secrets Manager: migrar todas as env vars sensíveis
12. CloudFront + Route 53 + ACM: CDN, DNS, SSL
13. CloudWatch: dashboards, alarmes de custo e erro, budget alerts
14. GitHub Actions: OIDC com IAM role, build Docker + push ECR + tofu apply

---

## Notas críticas para o Claude Code

### Geral
- Antes de criar arquivo, verificar se já existe algo similar na estrutura
- Sempre validar inputs com Zod antes de qualquer operação no banco
- Ao criar rotas Fastify, sempre incluir middleware de auth e de tenant
- Nunca expor stacktrace ao cliente em produção
- Ao integrar APIs externas, sempre retry com backoff exponencial
- `tenantId` nunca vem do body — sempre do token autenticado

### Financeiro
- Nunca usar float para valores monetários — sempre centavos (integer)
- Todo cálculo financeiro tem teste unitário obrigatório
- Todo valor exibido tem memória de cálculo acessível ao operador

### Negócio
- Nunca enviar mensagem fora da janela 08:00–20:00 BRT
- Quebra de acordo preserva histórico imutável — nunca deletar
- Enriquecimento via bureau registra finalidade automaticamente (LGPD)
- Contato encontrado via bureau entra como `pendente_confirmacao` — nunca ativar direto
- Acordos quebrados alimentam `tentativasRefatoracao` — respeitar o limite configurado

### AWS / Terraform
- Nunca criar recurso AWS pelo console — sempre via Terraform (OpenTofu)
- Nunca hardcodar credenciais — sempre Secrets Manager, referenciado pelo ARN
- ECS e Lambda acessam banco via Security Group — nunca IP público
- `tofu plan` obrigatório antes de qualquer `tofu apply` — sem exceções
- State file nunca vai para o git: `.gitignore` inclui `*.tfstate`, `*.tfstate.*`, `.terraform/`
- Todos os recursos têm tags `Project = "quitr"` e `Environment = var.env`
- Security Groups: regra mínima — só abrir portas explicitamente necessárias
- IAM roles com least privilege — sem `*` em actions ou resources sem justificativa