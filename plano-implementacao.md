# Plano de Implementação — Quitr
# Arquivo de referência completo para uso no Claude Code

---

## COMO USAR ESTE ARQUIVO

Cole cada prompt no Claude Code na ordem indicada. Cada bloco é autossuficiente.
O Claude Code vai criar os arquivos, instalar dependências e conectar as peças.
Teste ao final de cada sprint antes de avançar.

---

## PRÉ-REQUISITOS

### Contas e ferramentas necessárias

```bash
# Ferramentas locais
node -v        # 20+
pnpm -v        # instalar: npm i -g pnpm
docker -v      # Docker Desktop
tofu -v        # instalar: brew install opentofu (ou https://opentofu.org/docs/intro/install)
aws --version  # instalar: https://aws.amazon.com/cli

# Contas externas (ter em mãos antes de começar)
# - AWS com crédito configurado + MFA ativado
# - Clerk (clerk.com) — plano free
# - Asaas sandbox (sandbox.asaas.com)
# - Resend (resend.com) — plano free
# - Autentique (autentique.com.br)
# - Evolution API (self-hosted via Docker)
```

### Configuração inicial AWS (fazer uma única vez)

```bash
# 1. Criar usuário IAM com permissões de administrador (não usar root)
# AWS Console → IAM → Users → Create user → AdministratorAccess

# 2. Configurar AWS CLI localmente
aws configure
# AWS Access Key ID: [da sua conta IAM]
# AWS Secret Access Key: [da sua conta IAM]
# Default region name: sa-east-1
# Default output format: json

# 3. Criar bucket S3 para Terraform state (fazer antes do primeiro tofu init)
aws s3 mb s3://quitr-terraform-state --region sa-east-1
aws s3api put-bucket-versioning \
  --bucket quitr-terraform-state \
  --versioning-configuration Status=Enabled

# 4. Criar tabela DynamoDB para locking do Terraform state
aws dynamodb create-table \
  --table-name quitr-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region sa-east-1

# 5. Criar budget alert para não estourar o crédito
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget '{"BudgetName":"quitr-alert","BudgetLimit":{"Amount":"80","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
  --notifications-with-subscribers '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"seu@email.com"}]}]'
```

---

## SPRINT 1 — FUNDAÇÃO DA APLICAÇÃO (semana 1–2)

### Prompt 1.1 — Criar o monorepo

```
Crie um monorepo chamado "quitr" usando Turborepo com pnpm workspaces.

Estrutura:
quitr/
├── apps/
│   ├── web/          (Next.js 14 App Router)
│   └── api/          (Fastify + TypeScript)
├── packages/
│   ├── db/           (Prisma)
│   ├── types/        (tipos compartilhados)
│   └── utils/        (helpers)
├── infra/            (pasta vazia por ora — Terraform vem no Sprint 5)
└── CLAUDE.md         (copiar o arquivo CLAUDE.md do projeto)

Configurações:
- TypeScript strict em todos os packages
- ESLint + Prettier compartilhados na raiz
- Path aliases: @/components, @/lib, @repo/db, @repo/types, @repo/utils
- turbo.json com pipelines: build, dev, lint, test
- .gitignore incluindo: *.tfstate, *.tfstate.*, .terraform/, .env

No apps/web: instale Next.js 14, shadcn/ui (init), Tailwind CSS
No apps/api: instale Fastify, @fastify/cors, @fastify/helmet, dotenv, zod
No packages/db: instale prisma, @prisma/client

Crie o arquivo .env.example na raiz com todas as variáveis listadas no CLAUDE.md.
Crie docker-compose.yml na raiz para desenvolvimento local:
- postgres:16 na porta 5432
- redis:7 na porta 6379
- Volumes para persistência entre restarts
```

### Prompt 1.2 — Schema do banco

```
No package packages/db, crie o schema.prisma completo conforme o arquivo
schema.prisma do projeto (já fornecido). Depois:

1. Configure o Prisma Client como singleton em src/index.ts
2. Adicione soft delete para Devedor e Divida (campo deletedAt DateTime?)
3. Crie seed.ts com dados de exemplo:
   - 1 tenant "Quitr Demo Ltda"
   - 2 users: 1 admin + 1 operador com carteira atribuída
   - 5 devedores com perfis variados (pagador, fantasma, negociador, negligente, reincidente)
   - 2–3 dívidas por devedor com datas de vencimento variadas
   - Acordos em diferentes estágios (1 ativo, 1 quebrado, 1 quitado)
   - 1 régua padrão com 6 etapas (dia -3, 0, +3, +7, +15, +30)
   - Histórico de disparos para os devedores mais antigos

Execute: pnpm db:migrate && pnpm db:seed
```

### Prompt 1.3 — Auth e multitenancy

```
Configure autenticação multitenancy com Clerk no projeto.

No apps/api (Fastify):
1. Instale @clerk/fastify
2. Crie middleware auth.middleware.ts que:
   - Valida Bearer token do header Authorization
   - Extrai userId e tenantId via metadata do Clerk
   - Injeta req.user = { id, tenantId, papel } em todas as rotas autenticadas
   - Retorna 401 se token inválido, 403 se sem tenantId
3. Crie middleware tenant.middleware.ts que previne acesso cruzado entre tenants
4. Crie middleware plano.middleware.ts que verifica limite de devedores por plano

No apps/web (Next.js):
1. Instale @clerk/nextjs
2. Configure middleware.ts para proteger rotas do dashboard
3. Crie hook useCurrentTenant() que retorna dados do tenant logado

Crie rota POST /api/webhooks/clerk que:
- Recebe user.created → cria User no banco
- Recebe organization.created → cria Tenant no banco com trial de 14 dias
```

### Prompt 1.4 — CRUD de devedores e prontuário

```
Implemente o módulo completo de devedores incluindo prontuário e gestão de contatos.

Backend (apps/api/src/modules/devedores/):

devedores.schema.ts — Zod schemas:
- CreateDevedorSchema: nome (required), telefone (required, E.164), email (optional),
  cpfCnpj (optional), tipo (PF|PJ), endereço (optional)
- UpdateDevedorSchema: todos os campos optional

devedores.service.ts:
- listarDevedores(tenantId, filtros: { busca?, perfil?, scoreMin?, scoreMax?, page, limit })
- buscarDevedor(tenantId, id) — inclui dívidas, contatos, timeline de disparos e scores
- criarDevedor(tenantId, data)
- atualizarDevedor(tenantId, id, data)
- importarDevedores(tenantId, rows) — upsert por cpfCnpj, retorna { criados, atualizados, erros }

contatos.service.ts:
- listarContatos(tenantId, devedorId) — todos os números/e-mails com fonte e status
- adicionarContato(tenantId, devedorId, { valor, tipo, fonte }) — entra como pendente_confirmacao
- aprovarContato(tenantId, contatoId) — muda status para ativo
- inativarContato(tenantId, contatoId)

Rotas Fastify:
- GET/POST/PATCH/DELETE /devedores (com paginação e filtros)
- POST /devedores/importar
- GET /devedores/:id/timeline — disparos ordenados por data
- POST /devedores/:id/notas — adiciona nota interna do operador
- POST /devedores/:id/promessa — registra promessa de pagamento com data
- GET/POST/PATCH /devedores/:id/contatos

Frontend (apps/web/app/(dashboard)/devedores/):

page.tsx — tabela com TanStack Table:
- Colunas: nome, CPF/CNPJ, telefone, total em aberto, score recuper. (badge colorido),
  score contact. (badge colorido), perfil, última atividade
- Filtros: busca, perfil comportamental, faixa de score
- Paginação server-side

[id]/page.tsx — prontuário completo:
- Header: nome, CPF, badges de score (recuperabilidade + contactabilidade), perfil
- Seção scores: gauge semicircular duplo + explicação de cada fator
- Timeline cronológica: disparos (com conteúdo), notas internas, acordos, pagamentos
- Promessas de pagamento pendentes com alerta de vencimento
- Lista de contatos com fonte de origem e botão de aprovação (para contatos bureau)
- Lista de dívidas com status e valor
- Botões: "Adicionar dívida", "Buscar contato via CPF" (bureau), "Registrar nota"

importar/page.tsx:
- Drag-and-drop CSV com preview e mapeamento de colunas
- Relatório de resultado detalhado
```

---

## SPRINT 2 — ENGINE DE RÉGUA (semana 3–4)

### Prompt 2.1 — Builder visual de régua

```
Implemente o builder visual de régua de cobrança com drag-and-drop.

Backend (apps/api/src/modules/reguas/):
- CRUD completo de Regua e EtapaRegua
- Ao salvar, reordenar etapas pelo campo ordem automaticamente
- Validação: diaOffset único por régua
- Endpoint POST /reguas/:id/duplicar — clona a régua com todas as etapas

Frontend (apps/web/app/(dashboard)/reguas/[id]/page.tsx):
Use dnd-kit para drag-and-drop.

Cada etapa é um card arrastável com:
- Indicador de dia ("Dia -3" em roxo = pré-vencimento, "Dia +7" em vermelho = atraso)
- Ícone do canal (WhatsApp = verde, Email = azul, SMS = laranja)
- Preview das primeiras 60 chars do template
- Badge da condição e da ação
- Botão editar (drawer lateral) e remover

Drawer de edição da etapa:
- Input numérico: dias após vencimento (aceita negativo)
- Select: Canal — WhatsApp / E-mail / SMS
- Select: Condição — Sempre / Sem resposta / Com resposta / Não abriu / Acordo não firmado
- Select: Ação — Enviar mensagem / Gerar link de acordo / Negativar / Protestar
- Textarea do template com botões de inserção de variável:
  {nome} {valor} {vencimento} {diasAtraso} {linkAcordo} {empresa} {telefoneEmpresa}
- Preview em tempo real com dados fictícios

Barra superior: nome editável inline, toggle Ativa, toggle Padrão, botão Salvar
```

### Prompt 2.2 — Engine de execução com SQS + Lambda

```
Implemente o engine de execução da régua usando AWS SQS FIFO e Lambda.

Arquivo apps/api/src/modules/disparos/sqs.producer.ts:
- Função publicarDisparo(disparo: DisparoPayload): Promise<void>
- Publica no SQS FIFO com MessageGroupId = devedorId (garante ordem por devedor)
- MessageDeduplicationId = `${dividaId}-${etapaId}-${hoje}` (evita duplicatas)

Arquivo apps/api/src/jobs/regua.handler.ts (Lambda handler):
Handler exportado como "handler" — será acionado pelo EventBridge às 08:05 BRT.

Lógica:
1. Buscar todos os Tenants ativos
2. Para cada tenant, buscar Dividas com status EM_ABERTO ou EM_NEGOCIACAO
3. Para cada Divida:
   a. diasAtraso = today (BRT) - divida.dataVencimento
   b. Buscar Regua ativa (reguaId da dívida ou régua padrão do tenant)
   c. Para cada EtapaRegua onde diaOffset <= diasAtraso E ativa = true:
      - Verificar Disparo existente para (dividaId + etapaId) com status != FALHOU
      - Verificar condição da etapa
      - Verificar opt-out do devedor para o canal
      - Verificar maxContatosSemana do tenant
      - Verificar janela 08:00–20:00 BRT
      - Interpolar template
      - Criar Disparo com status PENDENTE
      - Publicar no SQS FIFO via sqs.producer.ts

Arquivo apps/api/src/modules/disparos/lambda-worker.ts (Lambda handler):
Consome eventos SQS (batchSize: 1, maximumConcurrency: 5):
1. Parsear o corpo da mensagem SQS
2. Buscar Disparo no banco pelo disparoId
3. Chamar integração do canal correto
4. Sucesso: atualizar Disparo para ENVIADO + externalId
5. Falha: lançar exceção (SQS faz retry automático até 3x → DLQ)
6. Nunca retornar erro silencioso — deixar SQS gerenciar retentativas

IMPORTANTE: este handler é um arquivo separado que será empacotado como Lambda
independente. Não misturar com o código do servidor Fastify.
```

### Prompt 2.3 — Integração WhatsApp (Evolution API)

```
Implemente a integração com Evolution API para WhatsApp.

Arquivo apps/api/src/integrations/whatsapp/evolution.client.ts:
- enviarTexto(instancia, telefone, mensagem): Promise<{ messageId: string }>
- verificarNumero(instancia, telefone): Promise<boolean>
- obterStatus(instancia): Promise<{ connected: boolean, number: string }>

Credenciais buscadas do Secrets Manager em produção,
de process.env em desenvolvimento.

Arquivo apps/api/src/webhooks/whatsapp.webhook.ts:
Rota POST /webhooks/whatsapp/:tenantId (sem auth, verificar assinatura HMAC):

Eventos Evolution API a tratar:
- MESSAGES_UPSERT (mensagem recebida do devedor):
  → Buscar ContatoDevedor pelo número
  → Buscar último Disparo ativo da dívida mais recente
  → Atualizar Disparo para RESPONDIDO + salvar resposta
  → Atualizar perfilComportamental do devedor se necessário
  → Se devedor era fantasma e respondeu: atualizar perfil para negociador

- MESSAGE_UPDATE (atualização de status):
  → DELIVERY_ACK: atualizar Disparo para ENTREGUE
  → READ: atualizar Disparo para LIDO + salvar lidoEm

Frontend (settings/integracoes/page.tsx):
Card de configuração WhatsApp com URL, API Key, instância e botão "Testar conexão".
```

### Prompt 2.4 — Integração e-mail com Resend

```
Implemente integração de e-mail com Resend.

Arquivo apps/api/src/integrations/email/resend.client.ts:
- enviarEmail(to, subject, html, from?): Promise<{ id: string }>
- from padrão: "Financeiro <cobranca@quitr.com.br>"
- Incluir header List-Unsubscribe com link de opt-out

Templates em apps/api/src/integrations/email/templates/:

cobranca.html:
- Header com logo do credor (URL configurável no tenant)
- Box destacado: valor em aberto (grande) + dias de atraso + data vencimento
- CTA button: "Regularizar minha situação" → linkAcordo
- Footer com dados do credor e link de opt-out

acordo.html:
- Resumo do acordo: valor com desconto, número de parcelas
- CTA: "Ver proposta e assinar"
- Validade da proposta (72 horas)

confirmacao-pagamento.html:
- Confirmação de pagamento recebido
- Resumo: valor pago, data, forma de pagamento
- Link para baixar comprovante (se disponível)

Pixel de rastreamento de abertura: URL no próprio backend que atualiza
o Disparo para LIDO ao ser requisitada.
```

---

## SPRINT 3 — ACORDOS E PAGAMENTO (semana 5–6)

### Prompt 3.1 — Portal público do devedor

```
Implemente o portal público de acordo acessível pelo link único do devedor.

Backend:
Rota GET /portal/:token (sem auth) — retorna:
{
  devedor: { nome, primeiroNome },
  divida: { descricao, valorOriginal, valorAtualizado, diasAtraso, dataVencimento },
  credorNome: string,
  expiradoEm: string,
  opcoesPagamento: {
    aVistaValor: number,
    aVistaDesconto: number,    // % de desconto
    parcelado: Array<{
      numeroParcelas: number,
      entradaValor: number,
      parcelaValor: number,
      totalFinal: number
    }>
  }
}

Rota POST /portal/:token/aceitar:
Body: { modalidade: 'avista' | 'parcelado', numeroParcelas?: number }
Ação:
1. Validar token e expiração
2. Criar Acordo no banco com tentativasRefatoracao = 0
3. Criar Parcelas (1 para à vista, N para parcelado)
4. Gerar cobrança Pix no Asaas para a entrada/valor à vista
5. Gerar documento de acordo e enviar ao Autentique
6. Enviar link de assinatura ao devedor via WhatsApp
7. Retornar: { acordoId, pixQrCode, pixCopiaECola, boletoUrl, valor }

Frontend (apps/web/app/acordo/[token]/page.tsx):
Página pública sem autenticação — 3 estados:

Estado 1 — apresentação:
- "Olá, {primeiroNome}! Você tem uma pendência com {credorNome}"
- Box vermelho: valor em aberto + dias em atraso
- Descrição da dívida

Estado 2 — escolha de pagamento:
- Card "À vista" com desconto destacado (badge "MELHOR OFERTA")
- Cards de parcelamento: 2x, 3x, 6x com valores calculados
- Ao selecionar: resumo do acordo antes de confirmar
- Botão "Confirmar acordo"

Estado 3 — pagamento:
- Pix: QR code grande + botão copiar código Pix + timer 30min
- Mensagem: "Acordo registrado. Você receberá confirmação assim que o pagamento entrar."

Tratar erros: token expirado, dívida já quitada, acordo já existente.
```

### Prompt 3.2 — Módulo de acordo com quebra e refatoração

```
Implemente o ciclo de vida completo do acordo incluindo quebra e refatoração.

Backend (apps/api/src/modules/acordos/refatoracao.service.ts):

verificarAcordosVencidos():
- Buscar acordos com status ASSINADO que têm parcelas vencidas há N dias
  (N = tenant.diasToleranciaQuebraAcordo, padrão = 5)
- Para cada acordo inadimplente:
  1. Atualizar Acordo.status → INADIMPLENTE
  2. Cancelar parcelas em aberto (não as já pagas)
  3. Notificar credor via e-mail/WhatsApp
  4. Notificar devedor: "Seu acordo foi cancelado por falta de pagamento"
  5. Incrementar Devedor.acordosQuebrados
  6. Atualizar perfilComportamental → reincidente (se acordosQuebrados >= 2)

refatorarAcordo(tenantId, acordoId, opcoes):
- Verificar se tentativasRefatoracao < tenant.limiteRefatoracoes (padrão = 2)
- Se >= limite: lançar erro "Limite de refatorações atingido" → negativar automaticamente
- Calcular saldo devedor:
  parcelas não pagas + juros pro rata sobre período de inadimplência + multaQuebraPercentual
- Criar novo Acordo com:
  - valorOriginal = saldo devedor calculado
  - tentativasRefatoracao = acordoAnterior.tentativasRefatoracao + 1
  - referencia ao acordo anterior para histórico
- Invalidar token do acordo anterior, gerar novo token

Timeline do acordo ([id]/page.tsx):
Linha do tempo visual mostrando:
- Data de criação + valor original
- Cada parcela: data, valor, status (paga/pendente/vencida)
- Evento de quebra (se houver) com motivo
- Refatoração: link para o novo acordo + saldo recalculado
- Data de quitação (se concluído)

Handler Lambda apps/api/src/jobs/acordo-vencido.handler.ts:
Acionado pelo EventBridge às 09:00 BRT diariamente.
Chama verificarAcordosVencidos() e loga resultado.
```

### Prompt 3.3 — Integração Asaas e Autentique

```
Implemente integração completa com Asaas para cobranças e Autentique para assinatura.

Arquivo apps/api/src/integrations/pagamento/asaas.service.ts:
- criarCliente(dados): Promise<{ id: string }>
- criarCobrancaPix(dados): Promise<AsaasCobranca>
- criarCobrancaBoleto(dados): Promise<AsaasCobranca>
- cancelarCobranca(id): Promise<void>

Rota POST /webhooks/asaas (sem auth, validar via HMAC com ASAAS_WEBHOOK_SECRET):
Eventos:
- PAYMENT_RECEIVED / PAYMENT_CONFIRMED:
  → Atualizar Parcela para PAGA + dataPagamento
  → Se todas as parcelas do Acordo estão pagas: Acordo → PAGO, Divida → QUITADA
  → Enviar confirmação via WhatsApp: "Seu pagamento foi confirmado!"
  → Atualizar perfilComportamental → pagador
  → Recalcular score imediatamente

- PAYMENT_OVERDUE:
  → Parcela → VENCIDA
  → Se acordo tem parcela vencida há > N dias: acionar verificarAcordosVencidos()

Arquivo apps/api/src/integrations/assinatura/autentique.client.ts:
- criarDocumento(dados): Promise<{ id, linkAssinatura }>
- buscarDocumento(id): Promise<{ status, assinadoEm? }>

Rota POST /webhooks/autentique:
- Evento document.signed: Acordo → ASSINADO, salvar documentoUrl

Template HTML do acordo (autentique.client.ts → gerarHtmlAcordo()):
Incluir: identificação das partes, dívida original, condições negociadas
(valor, desconto, parcelas com datas), cláusulas de inadimplência e foro.
```

---

## SPRINT 4 — MÓDULOS AVANÇADOS DE NEGÓCIO (semana 7–8)

### Prompt 4.1 — Score duplo: recuperabilidade + contactabilidade

```
Implemente o sistema de score duplo: recuperabilidade e contactabilidade.

Arquivo apps/api/src/modules/score/score.service.ts:

calcularScoreRecuperabilidade(dividaId): Promise<number>
Algoritmo rules-based (0–100):
- diasAtraso (40%): 0-15d=100, 16-30d=80, 31-60d=50, 61-90d=30, 90+d=10
- respondeuUltimaMsg (20%): últimos 7d=100, últimos 30d=70, nunca=20
- tentativasSemResposta (20%): 0-2=100, 3-5=60, 6+=20
- historicoPagamento (10%): quitou antes=100, neutro=50, quebrou acordo=20
- valorDivida (10%): <500=90, 500-2k=70, 2k-10k=50, >10k=30

calcularScoreContactabilidade(devedorId): Promise<number>
- totalContatos (30%): 1=50, 2=80, 3+=100
- contatosConfirmados (30%): % de contatos com status ativo
- ultimoContatoRespondeу (20%): sim=100, não=0
- diasSemContato (20%): <7d=100, 7-30d=60, 30-60d=30, 60+d=10

Lógica combinada — recomendação de ação:
- Recuper. alto + Contact. alto  → régua leve + acordo imediato
- Recuper. alto + Contact. baixo → buscar novo contato via bureau (vale o ROI)
- Recuper. baixo + Contact. alto → régua rápida, negativar em seguida
- Recuper. baixo + Contact. baixo → sugerir venda da carteira, custo > retorno

Handler apps/api/src/jobs/score.handler.ts:
EventBridge às 07:00 BRT — recalcula scores de todas as dívidas ativas.

Frontend:
- Tabela de devedores: dois badges coloridos (R: recuperab. C: contact.)
- Perfil do devedor: dois gauges semicirculares lado a lado + recomendação de ação
  baseada na combinação dos dois scores + explicação fator a fator
```

### Prompt 4.2 — Módulo de comissão da equipe

```
Implemente o módulo de comissão para equipe de cobradores.

Backend (apps/api/src/modules/comissao/):

comissao.service.ts:
- calcularComissaoParcela(parcelaId):
  Busca parcela → busca cobrador responsável pela dívida → aplica percentual configurado
  pelo tenant (podendo variar por faixa de valor recuperado no mês)

- calcularComissaoMensal(tenantId, mes, ano):
  Agrupa pagamentos confirmados no período por cobrador
  Aplica tabela de faixas: ex: até R$5k=5%, R$5k-15k=7%, acima=9%
  Retorna { cobrador, valorRecuperado, comissao, acordosFechados, acordosQuebrados }

- fecharComissaoMensal(tenantId, mes, ano):
  Gera snapshot imutável do fechamento
  Marca comissões como "aguardando pagamento"
  Gera PDF de fechamento via @react-pdf/renderer

comissao.routes.ts:
- GET /comissao/equipe — resumo do mês atual por cobrador (atualizado em tempo real)
- GET /comissao/meu — dashboard individual do cobrador logado
- GET /comissao/historico — fechamentos anteriores
- POST /comissao/fechar — gestor fecha o mês (gera PDF e bloqueia edição)
- GET /comissao/ranking — ranking tempo real para exibir na TV da empresa

Frontend (apps/web/app/(dashboard)/comissao/):

page.tsx — visão do gestor:
- Grid de metric cards: total recuperado no mês, total comissão a pagar, meta do time
- Tabela da equipe: cobrador, carteira (qtd), recuperado, acordos fechados,
  acordos quebrados (%), comissão calculada, % da meta
- Ranking visual (barra de progresso por cobrador)
- Botão "Fechar mês" (disponível só no dia 1 do mês seguinte)

[userId]/page.tsx — visão individual do cobrador:
- Minha comissão estimada no mês
- Minha carteira: devedores atribuídos com score e status
- Meus acordos: fechados, quebrados, em andamento
- Histórico de comissões pagas

Handler apps/api/src/jobs/comissao-fechamento.handler.ts:
EventBridge dia 1 de cada mês, 06:00 BRT — gera relatório automático e notifica gestores.
```

### Prompt 4.3 — Enriquecimento de contato via bureau

```
Implemente o módulo de enriquecimento de contato por CPF.

Arquivo apps/api/src/integrations/bureau/bigdatacorp.client.ts:
- buscarContatosPorCpf(cpf): Promise<{
    telefones: Array<{ numero: string, tipo: string, score: number }>,
    emails: Array<{ email: string, score: number }>
  }>
- Autenticação via API key no header
- Timeout de 10s, retry uma vez em caso de erro 5xx

Arquivo apps/api/src/modules/bureau/consulta.service.ts:

consultarBureau(tenantId, devedorId):
1. Validar CPF do devedor via Serpro DataValid (se CPF inválido, retornar erro)
2. Verificar se já há consulta recente (< 30 dias) para evitar custo duplo
3. Chamar BigDataCorp API (ou Assertiva como fallback)
4. Para cada contato retornado:
   - Criar ContatoDevedor com status = pendente_confirmacao
   - fonte = bureau_bigdatacorp
   - Registrar consultaFinalidade = "cobrança de dívida própria — CDC Art. 42"
   - Registrar consultaTimestamp e consultaIpOperador
5. Registrar custo da consulta para repasse ao tenant (créditos)
6. Retornar lista de contatos para aprovação do operador

Rotas:
- POST /devedores/:id/bureau — realiza consulta, retorna contatos pendentes
- POST /devedores/:id/contatos/:contatoId/aprovar — ativa o contato
- POST /devedores/:id/contatos/:contatoId/rejeitar — marca como inválido

Frontend (perfil do devedor):
Botão "Buscar contato via CPF":
- Confirmar: "Esta consulta consome 1 crédito de bureau (~R$1,50). Continuar?"
- Loading com mensagem "Consultando base de dados..."
- Resultado: lista de contatos encontrados com score de confiança
- Para cada contato: botão "Aprovar" e "Rejeitar"
- Contatos aprovados entram na régua automaticamente
```

### Prompt 4.4 — Dashboard e relatório aging list PDF

```
Implemente o dashboard principal e o relatório de aging list em PDF.

Backend — rota GET /dashboard/metricas:
{
  totalEmAberto: { quantidade, valor },
  recuperadoMes: { quantidade, valor, variacaoPercMesAnterior },
  taxaRecuperacao: number,
  acordosAtivos: { quantidade, valor },
  devedoresPorPerfil: { pagador, negligente, negociador, fantasma, reincidente },
  evolucaoMensal: Array<{ mes, recuperado, emAberto }>,  // últimos 6 meses
  agingList: Array<{ faixa, quantidade, valor }>,
  disparosPorCanal: { whatsapp, email, sms }  // enviados, taxa de resposta
}

Backend — rota GET /relatorios/aging?formato=pdf:
Gerar via @react-pdf/renderer:
- Cabeçalho: logo credor, data de geração, nome da empresa
- Sumário: total em aberto, total devedores, maior concentração de faixa
- Tabela principal:
  Colunas: devedor, CPF/CNPJ, valor original, valor atualizado,
  data vencimento, dias atraso, faixa, status, score recup., score contact., último contato
- Agrupado por faixa (0-30, 31-60, 61-90, 90+) com subtotais por grupo
- Cores por faixa: amarelo claro, laranja claro, vermelho claro, vermelho escuro
- Total geral no rodapé + numeração de páginas

Frontend (apps/web/app/(dashboard)/page.tsx):
- 4 metric cards: total em aberto, recuperado no mês, taxa de recuperação, acordos ativos
- BarChart (Recharts): recuperado vs em aberto — últimos 6 meses
- Donut chart: devedores por perfil comportamental
- Tabela aging list com 4 faixas + percentual do total
- 3 cards de canal: WhatsApp, e-mail, SMS com taxa de resposta

Frontend (apps/web/app/(dashboard)/relatorios/page.tsx):
- Botão "Exportar Aging List" → modal com opções → download do PDF
- Nome do arquivo: "aging-list-quitr-{empresa}-{data}.pdf"
```

### Prompt 4.5 — Billing com Stripe

```
Implemente billing com Stripe.

Planos:
- STARTER: R$297/mês — até 200 devedores, WhatsApp + e-mail, 1 usuário
- PRO: R$697/mês — até 1.000 devedores, todos os canais, 3 usuários, negativação, bureau
- BUSINESS: R$1.497/mês — ilimitado, API pública, 10 usuários, comissão, suporte dedicado

Backend (apps/api/src/modules/billing/stripe.service.ts):
- criarCliente(tenant)
- criarAssinatura(tenantId, plano) → URL de checkout
- cancelarAssinatura(tenantId)
- obterPortalCliente(tenantId) → URL do portal Stripe

Rota POST /webhooks/stripe:
- customer.subscription.created/updated → atualizar Assinatura
- customer.subscription.deleted → status CANCELADA
- invoice.payment_failed → status INADIMPLENTE + notificar admin
- invoice.payment_succeeded → renovar período, status ATIVA

Trial de 14 dias: ao criar conta, trialFim = now + 14 dias.
Banner persistente no dashboard com dias restantes do trial.
```

---

## SPRINT 5 — INFRAESTRUTURA AWS COM TERRAFORM (semana 9–10)

### Prompt 5.1 — Dockerfiles e docker-compose

```
Crie Dockerfiles otimizados para as duas aplicações.

apps/api/Dockerfile (multi-stage build):
Stage 1 (builder):
- FROM node:20-alpine AS builder
- Instalar pnpm, copiar package.json de todos os workspaces
- pnpm install --frozen-lockfile
- pnpm build --filter=api

Stage 2 (runner):
- FROM node:20-alpine AS runner
- Copiar apenas os artefatos do build (sem node_modules de dev)
- Instalar apenas dependências de produção
- EXPOSE 3000
- CMD ["node", "dist/index.js"]

apps/web/Dockerfile (Next.js standalone):
Stage 1 (builder):
- next build com output: 'standalone' no next.config.js
Stage 2 (runner):
- Copiar .next/standalone + .next/static + public
- EXPOSE 3000

apps/api/lambda.Dockerfile (para o worker Lambda):
- FROM public.ecr.aws/lambda/nodejs:20
- Copiar apenas o lambda-worker.ts compilado
- CMD ["lambda-worker.handler"]

docker-compose.yml na raiz (desenvolvimento local):
- postgres:16 com healthcheck
- redis:7
- evolution-api (para WhatsApp local)
- Volumes nomeados para persistência
```

### Prompt 5.2 — Módulo VPC no Terraform

```
Crie o módulo Terraform para a VPC do Quitr em infra/modules/vpc/.

Arquivos: main.tf, variables.tf, outputs.tf

Recursos a criar:
- aws_vpc (CIDR 10.0.0.0/16, DNS hostnames habilitado)
- 2x aws_subnet pública (10.0.10.0/24, 10.0.11.0/24) em sa-east-1a e 1b
- 2x aws_subnet privada app (10.0.0.0/24, 10.0.1.0/24) em sa-east-1a e 1b
- 2x aws_subnet privada dados (10.0.2.0/24, 10.0.3.0/24) em sa-east-1a e 1b
- aws_internet_gateway
- aws_nat_gateway (1 por ora — Multi-NAT apenas em prod)
- aws_route_table para subnets públicas (rota para IGW)
- aws_route_table para subnets privadas (rota para NAT)
- aws_route_table_association para todas as subnets

Variáveis de entrada: env (dev|prod), cidr, enable_multi_nat (bool)
Outputs: vpc_id, subnet_public_ids, subnet_private_app_ids, subnet_private_data_ids

Criar infra/main.tf que chama o módulo:
module "vpc" {
  source          = "./modules/vpc"
  env             = var.env
  cidr            = "10.0.0.0/16"
  enable_multi_nat = var.env == "prod"
}
```

### Prompt 5.3 — Módulos RDS e ElastiCache

```
Crie os módulos Terraform para banco de dados e Redis.

infra/modules/rds/main.tf:
- aws_db_subnet_group nas subnets privadas de dados
- aws_security_group: permite entrada na 5432 apenas do security group do ECS
- aws_rds_cluster (Aurora Serverless v2, engine: aurora-postgresql, version: 15)
  - serverlessv2_scaling_configuration: min 0.5, max 4 ACUs (prod: max 16)
  - backup_retention_period = 7
  - deletion_protection = var.env == "prod"
  - skip_final_snapshot = var.env != "prod"
- aws_rds_cluster_instance (1 para dev, 2 para prod — Multi-AZ)
- aws_secretsmanager_secret para a connection string
- aws_secretsmanager_secret_version com o valor postgresql://...

infra/modules/elasticache/main.tf:
- aws_elasticache_subnet_group nas subnets privadas de dados
- aws_security_group: permite entrada na 6379 apenas do security group do ECS
- aws_elasticache_replication_group
  - node_type = var.env == "prod" ? "cache.t4g.small" : "cache.t4g.micro"
  - num_cache_clusters = var.env == "prod" ? 2 : 1
  - at_rest_encryption_enabled = true
  - transit_encryption_enabled = true

Outputs: rds_endpoint, rds_secret_arn, redis_endpoint, redis_secret_arn
```

### Prompt 5.4 — Módulos ECS Fargate e App Runner

```
Crie os módulos Terraform para ECS Fargate (API) e App Runner (Web).

infra/modules/ecs/main.tf:
- aws_ecr_repository para a API (image_tag_mutability = MUTABLE)
  - lifecycle_policy: manter apenas as últimas 10 imagens
- aws_cloudwatch_log_group /quitr/api (retention_in_days = 30)
- aws_iam_role ecs_execution_role:
  - AmazonECSTaskExecutionRolePolicy
  - Permissão para buscar segredos do Secrets Manager (apenas os ARNs necessários)
- aws_iam_role ecs_task_role:
  - Permissão para publicar no SQS FIFO
  - Permissão para escrever no S3 (documentos)
  - Permissão para X-Ray
- aws_security_group ecs_api:
  - Entrada: porta 3000 apenas do security group do ALB
  - Saída: 5432 para RDS, 6379 para Redis, 443 para internet (via NAT)
- aws_ecs_cluster (Container Insights habilitado)
- aws_ecs_task_definition:
  - FARGATE, 512 CPU, 1024 memory
  - Secrets do Secrets Manager injetados como variáveis de ambiente
  - awslogs driver para CloudWatch
- aws_ecs_service:
  - desired_count = var.env == "prod" ? 2 : 1
  - deployment_circuit_breaker habilitado
  - Auto-scaling por CPU > 70%

infra/modules/apprunner/main.tf:
- aws_ecr_repository para o Next.js
- aws_apprunner_service:
  - source.image_repository: ECR
  - instance_configuration: 1 vCPU, 2GB RAM
  - auto_scaling: min 1, max 5, concurrency 100
  - health_check: path /api/health, interval 10s
- aws_apprunner_custom_domain_association para o domínio

Outputs: alb_dns, api_ecr_url, web_ecr_url, ecs_cluster_name, ecs_service_name
```

### Prompt 5.5 — Módulos SQS, Lambda e EventBridge

```
Crie os módulos Terraform para filas, workers e agendamentos.

infra/modules/sqs/main.tf:
- aws_sqs_queue dead_letter:
  - name = "quitr-disparos-dlq.fifo"
  - fifo_queue = true
  - message_retention_seconds = 1209600 (14 dias)
- aws_sqs_queue disparos:
  - name = "quitr-disparos.fifo"
  - fifo_queue = true
  - content_based_deduplication = false
  - visibility_timeout_seconds = 300
  - redrive_policy: maxReceiveCount = 3, deadLetterTargetArn = DLQ ARN

infra/modules/lambda/main.tf:
- aws_ecr_repository para o worker Lambda
- aws_cloudwatch_log_group /quitr/lambda-worker (retention 14 dias)
- aws_iam_role lambda_role:
  - AWSLambdaBasicExecutionRole
  - Permissão para consumir SQS (ReceiveMessage, DeleteMessage, GetQueueAttributes)
  - Permissão para ler Secrets Manager (apenas segredos do Quitr)
  - Permissão para escrever no banco (via security group, sem permissão IAM de DB)
- aws_lambda_function worker_disparos:
  - package_type = "Image" (imagem ECR)
  - timeout = 300 (5 min por mensagem)
  - reserved_concurrent_executions = 10 (máx workers simultâneos)
  - vpc_config: subnets privadas app, security group que acessa RDS e Redis
- aws_lambda_event_source_mapping:
  - event_source_arn = SQS ARN
  - batch_size = 1
  - maximum_concurrency = 5

infra/modules/eventbridge/main.tf:
Criar aws_scheduler_schedule para cada job:
- quitr-score:      cron(0 10 * * ? *)  = 07:00 BRT → Lambda score.handler
- quitr-regua:      cron(5 11 * * ? *)  = 08:05 BRT → Lambda regua.handler
- quitr-acordo:     cron(0 12 * * ? *)  = 09:00 BRT → Lambda acordo-vencido.handler
- quitr-comissao:   cron(0 9 1 * ? *)   = 06:00 BRT dia 1 → Lambda comissao.handler

Outputs: sqs_disparos_url, sqs_dlq_url, lambda_worker_arn
```

### Prompt 5.6 — ALB, CloudFront, Route 53 e Secrets Manager

```
Crie os módulos finais de infraestrutura.

infra/modules/alb/main.tf:
- aws_security_group alb: entrada 80 e 443 de 0.0.0.0/0, saída porta 3000 para ECS
- aws_lb (internal = false, subnets públicas)
- aws_lb_target_group: ip, porta 3000, health_check /health
- aws_lb_listener porta 80: redirect para HTTPS
- aws_lb_listener porta 443: forward para target group (com certificado ACM)

infra/modules/cdn/main.tf:
- aws_acm_certificate para *.quitr.com.br (us-east-1 — obrigatório para CloudFront)
- aws_cloudfront_distribution para o Next.js (App Runner origin)
- aws_route53_zone para quitr.com.br
- aws_route53_record: app.quitr.com.br → CloudFront, api.quitr.com.br → ALB

infra/modules/secrets/main.tf:
Criar aws_secretsmanager_secret para cada credencial:
- quitr/clerk-secret-key
- quitr/resend-api-key
- quitr/asaas-api-key
- quitr/asaas-webhook-secret
- quitr/evolution-api-key
- quitr/zenvia-api-key
- quitr/autentique-api-key
- quitr/boavista-api-key
- quitr/bigdatacorp-api-key
- quitr/stripe-secret-key

NOTA: Os valores são preenchidos manualmente via console ou CLI após o apply.
O Terraform apenas cria a estrutura — nunca armazena segredos em código.

infra/modules/monitoring/main.tf:
- aws_cloudwatch_dashboard com widgets: ECS CPU, RDS connections, SQS depth,
  Lambda errors, ALB 5xx rate
- aws_cloudwatch_metric_alarm:
  - ECS CPU > 80% por 5 min → SNS → e-mail
  - SQS DLQ com mensagens > 0 → SNS → e-mail
  - RDS FreeableMemory < 100MB → SNS → e-mail
  - Lambda errors > 10 em 5 min → SNS → e-mail
```

---

## CONFIGURAÇÃO DE INTEGRAÇÕES — PASSO A PASSO

### WhatsApp via Evolution API (local/self-hosted)

```bash
# Subir via docker-compose (já incluído no docker-compose.yml)
docker-compose up evolution-api

# Criar instância
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "quitr-principal", "qrcode": true}'

# Conectar número — escanear o QR code com WhatsApp Business
curl http://localhost:8080/instance/connect/quitr-principal \
  -H "apikey: sua-api-key"

# Configurar webhook (em produção, apontar para a URL da API no ALB)
curl -X POST http://localhost:8080/webhook/set/quitr-principal \
  -H "apikey: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://api.quitr.com.br/webhooks/whatsapp/TENANT_ID", "events": ["MESSAGES_UPSERT","MESSAGE_UPDATE"]}'
```

### Asaas — configuração sandbox e produção

```bash
# 1. Criar conta em sandbox.asaas.com
# 2. Copiar API key: Configurações → Integrações → API Key
# 3. Salvar no Secrets Manager:
aws secretsmanager put-secret-value \
  --secret-id quitr/asaas-api-key \
  --secret-string "sua-api-key-sandbox"

# 4. Configurar webhook no painel Asaas:
#    URL: https://api.quitr.com.br/webhooks/asaas
#    Eventos: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE
# 5. Copiar webhook secret e salvar:
aws secretsmanager put-secret-value \
  --secret-id quitr/asaas-webhook-secret \
  --secret-string "seu-webhook-secret"
```

### Deploy inicial na AWS

```bash
# 1. Inicializar Terraform (com backend S3 já criado)
cd infra
tofu init

# 2. Criar infra de dev primeiro
tofu apply -var-file=environments/dev/terraform.tfvars

# 3. Pegar outputs com URLs e ARNs
tofu output

# 4. Build e push das imagens Docker para ECR
API_ECR=$(tofu output -raw api_ecr_url)
WEB_ECR=$(tofu output -raw web_ecr_url)
LAMBDA_ECR=$(tofu output -raw lambda_ecr_url)

aws ecr get-login-password --region sa-east-1 | \
  docker login --username AWS --password-stdin $API_ECR

docker build -t $API_ECR:latest ./apps/api && docker push $API_ECR:latest
docker build -f apps/web/Dockerfile -t $WEB_ECR:latest ./apps/web && docker push $WEB_ECR:latest
docker build -f apps/api/lambda.Dockerfile -t $LAMBDA_ECR:latest ./apps/api && docker push $LAMBDA_ECR:latest

# 5. Rodar migrations no RDS (via instância temporária com acesso à subnet privada)
# Opção: rodar uma task ECS temporária com o comando de migration
aws ecs run-task \
  --cluster quitr \
  --task-definition quitr-migration \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["pnpm","db:migrate"]}]}'

# 6. Forçar deploy do serviço ECS
aws ecs update-service --cluster quitr --service quitr-api --force-new-deployment

# 7. Economizar crédito nos fins de semana (destruir e recriar)
tofu destroy -var-file=environments/dev/terraform.tfvars
# Na segunda: tofu apply novamente (leva ~15 min)
```

---

## TESTES RECOMENDADOS POR MÓDULO

### Testes unitários (Vitest)

```typescript
// packages/utils/src/__tests__/template.test.ts
// - interpolação com nome acentuado, valor zero, link undefined

// packages/utils/src/__tests__/calculo-financeiro.test.ts
// - multa aplicada uma vez no primeiro dia
// - juros pro rata die
// - refatoração: cálculo do saldo devedor com período de quebra
// - valores sempre em centavos, sem float

// apps/api/src/modules/score/__tests__/score.test.ts
// - cada fator individualmente
// - score combinado com casos extremos (zero dias atraso, 200 dias atraso)
// - score de contactabilidade

// apps/api/src/modules/disparos/__tests__/engine.test.ts
// - etapa já executada → não executa
// - opt-out → não executa
// - condição SEM_RESPOSTA quando há resposta → não executa
// - limite semanal atingido → não executa
// - fora do horário permitido → não executa

// apps/api/src/modules/acordos/__tests__/refatoracao.test.ts
// - quebra automática após N dias
// - cálculo do saldo devedor na refatoração
// - limite de refatorações respeitado
// - tentativasRefatoracao incrementado corretamente
```

### Teste de integração manual — fluxo completo

```
1. Criar devedor com seu próprio número de WhatsApp
2. Criar dívida com vencimento = ontem
3. Criar régua com etapa dia +0, canal WhatsApp, condição Sempre
4. Associar régua à dívida
5. Invocar Lambda de régua manualmente:
   aws lambda invoke --function-name quitr-regua-job --payload '{}' /dev/stdout
6. Verificar: Disparo criado → mensagem WhatsApp recebida → status atualizado para LIDO
7. Acessar link de acordo → escolher Pix → confirmar pagamento no sandbox Asaas
8. Verificar: Divida → QUITADA, Devedor → PAGADOR, comissão calculada, confirmação recebida

Teste de quebra de acordo:
1. Criar acordo parcelado
2. Alterar dataVencimento da parcela 1 para 10 dias atrás no banco
3. Invocar Lambda de acordo-vencido manualmente
4. Verificar: Acordo → INADIMPLENTE, notificação enviada, tentativasRefatoracao = 0
5. Refatorar o acordo pela UI
6. Verificar: novo Acordo criado com saldo atualizado + multa de quebra aplicada
```

---

## ROADMAP PÓS-MVP

### Fase 2 (mês 3–6)
- Score V2 com ML (treinar modelo com dados acumulados dos primeiros 6 meses)
- Integração ERP: Omie, Bling, Conta Azul via OAuth
- Voz automatizada: ligação com TTS para devedores que ignoram mensagens
- Negativação Serasa via Boa Vista API
- Protesto digital via e-Protest ou Protestar Online
- API pública para score de recuperabilidade (modelo de créditos por consulta)

### Fase 3 (mês 6–12)
- White-label para administradoras de condomínio (vertical específico)
- Marketplace de escritórios de cobrança (take rate sobre valor recuperado)
- App mobile para devedores (portal de autoatendimento com notificações push)
- Relatórios avançados com BI embedded (Metabase ou Redash self-hosted)
- Multi-região: adicionar us-east-1 para expansão internacional

---

## CHECKLIST PRÉ-LANÇAMENTO

### Compliance e legal
- [ ] Política de privacidade publicada (mencionar uso de bureaus para cobrança)
- [ ] Termos de uso publicados
- [ ] Banner de cookies (LGPD)
- [ ] Validar horários de envio: 8h–20h BRT — testar alarme CloudWatch
- [ ] Registro de finalidade em cada consulta de bureau (CDC Art. 42)
- [ ] Opt-out funcionando e registrado com timestamp

### Segurança
- [ ] Rate limiting nas rotas públicas (/portal/:token)
- [ ] Tokens de acordo são UUID v4 (não sequenciais, não previsíveis)
- [ ] Webhooks Asaas e Autentique validados via HMAC
- [ ] Nenhuma API key em código ou variável de ambiente no ECS — apenas Secrets Manager
- [ ] Security Groups revisados: nenhuma porta desnecessária aberta
- [ ] IAM roles com least privilege — revisar policies geradas pelo Terraform
- [ ] WAF configurado no CloudFront (regras básicas de proteção)
- [ ] MFA ativado na conta AWS root e no usuário IAM

### Infraestrutura
- [ ] Budget alert AWS configurado (em $80)
- [ ] CloudWatch alarmes ativos para CPU, memória, erros Lambda, DLQ
- [ ] Backup do RDS testado (restaurar snapshot em ambiente de teste)
- [ ] tofu plan antes de qualquer tofu apply em prod — revisar diff
- [ ] State file versionado no S3 — verificar versioning ativo
- [ ] .gitignore inclui *.tfstate, .terraform/, .env

### Aplicação
- [ ] Rodar fluxo completo em sandbox (Asaas sandbox + número de teste)
- [ ] Testar quebra e refatoração de acordo
- [ ] Testar enriquecimento de bureau com CPF de teste
- [ ] Verificar que emails passam pelo SPF/DKIM/DMARC (Resend configura automaticamente)
- [ ] Trailing slash consistente nas URLs
- [ ] 404 e 500 com páginas customizadas no Next.js
- [ ] Health check /health respondendo 200 no ECS e App Runner

### Monitoramento
- [ ] Sentry configurado no Next.js e no Fastify
- [ ] CloudWatch Logs recebendo logs da API e dos Lambdas
- [ ] X-Ray tracing ativo no ECS
- [ ] Dashboard CloudWatch com métricas principais
- [ ] Alerta de DLQ com mensagens (disparos que falharam 3x)
