# DinDin

[![CI](https://github.com/javi-technology/dindin/actions/workflows/ci.yml/badge.svg)](https://github.com/javi-technology/dindin/actions/workflows/ci.yml)

Sistema de controle de carteira de Fundos Imobiliários (FIIs) com estratégia de "geladeira".

## Stack

- **Frontend**: Angular 20 + Tailwind CSS 4 (builder `@angular/build`)
- **Backend**: Firebase Cloud Functions + Express.js + Node.js 22
- **Requisitos locais**: Node.js 22 (Angular 20 exige Node >= 20.19)
- **Banco de dados**: Firestore
- **Hospedagem**: Firebase Hosting
- **Autenticação**: Firebase Authentication

## Estrutura do Projeto

O projeto utiliza uma estrutura de monorepo para compartilhar código entre o frontend e o backend:

- `apps/api`: Cloud Functions (Express) que processam as regras de negócio.
- `apps/web`: Aplicação Frontend em Angular com Tailwind CSS.
- `packages/models`: Definições de modelos do Firestore.
- `packages/shared-types`: Tipos TypeScript compartilhados por ambas as aplicações.

## Como Começar (Setup Local)

Siga os passos abaixo para configurar o ambiente de desenvolvimento local:

1. **Clonar o repositório**

   ```bash
   git clone <url-do-repositório>
   cd dindin
   ```

2. **Instalar dependências**

   ```bash
   npm install
   ```

3. **Configurar Variáveis de Ambiente (Secrets)**
   As segredos devem ser configurados no ambiente do Firebase:

   ```bash
   firebase functions:secrets:set OPENROUTER_API_KEY
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

4. **Configurar o Ambiente Local**
   Crie um arquivo `.env` em `apps/api/` (ou use o arquivo de ambiente de projeto) para configurar chaves de teste da Stripe e URLs base:

   ```env
   STRIPE_PRICE_BASIC_MONTHLY=price_...
   STRIPE_PRICE_BASIC_YEARLY=price_...
   APP_BASE_URL=http://localhost:5173
   ```

5. **Executar o Projeto**
   - Para rodar os emuladores (Firebase, Firestore, etc.): `npm run emulators`
   - Para rodar a API em modo de desenvolvimento: `npm run api:serve`
   - Para iniciar o frontend: `npm run dev` (ou o comando padrão do Angular)

## Integração Contínua

A pipeline de CI roda a cada push ou pull request para as branches `main` e `develop`, executando instalação, build e testes da API e do frontend.

Veja os detalhes em [`.github/workflows/ci.yml`](.github/workflows/ci.yml) e acompanhe as execuções em [Actions](https://github.com/javi-technology/dindin/actions/workflows/ci.yml).

## Deploy contínuo

O deploy para o Firebase Hosting e Cloud Functions é feito automaticamente quando a pipeline de CI passa na branch `main`, no projeto `dindin-4e720`.

O workflow de CD está em [`.github/workflows/cd.yml`](.github/workflows/cd.yml) e exige a secret `FIREBASE_SERVICE_ACCOUNT` configurada no repositório.

> **Nota:** os artefatos de build mantêm-se disponíveis por **1 dia** (`retention-days: 1`). Se for necessário re-executar o CD manualmente após esse prazo, re-execute a CI primeiro para regenerar os artefatos.

## API Endpoints

Todos os endpoints abaixo exigem autenticação via `Authorization: Bearer <token>`.

### Carteiras (`/api/wallets`)

| Método   | Rota               | Descrição                                                 |
| -------- | ------------------ | --------------------------------------------------------- |
| `GET`    | `/api/wallets`     | Lista as carteiras do usuário autenticado                 |
| `POST`   | `/api/wallets`     | Cria uma nova carteira (`name` e `currency` obrigatórios) |
| `GET`    | `/api/wallets/:id` | Retorna uma carteira específica do usuário                |
| `PUT`    | `/api/wallets/:id` | Atualiza uma carteira existente                           |
| `DELETE` | `/api/wallets/:id` | Remove uma carteira existente                             |

### Carteira recomendada BB (`/api/recommended-wallets/bb-fii`)

Os PDFs mensais da carteira FII do Banco do Brasil são armazenados em
`wallets/fii-bb/` no Firebase Storage. O job `syncBbWalletScheduled` consulta
as revisões disponíveis entre os dias 1 e 10 de cada mês, enquanto o trigger de
upload importa automaticamente um PDF colocado nesse prefixo.

| Método | Rota                                                                                      | Descrição                                                     |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET`  | `/api/recommended-wallets/bb-fii`                                                         | Lista as carteiras importadas                                 |
| `GET`  | `/api/recommended-wallets/bb-fii/latest?month=YYYY-MM`                                    | Retorna a carteira do mês ou a mais recente                   |
| `GET`  | `/api/recommended-wallets/bb-fii/compare/:walletId?wallet=renda\|ganho`                   | Compara a carteira do usuário com a recomendação              |
| `GET`  | `/api/recommended-wallets/bb-fii/suggestions?walletId=...&month=YYYY-MM&tab=renda\|ganho` | Retorna a sugestão salva                                      |
| `POST` | `/api/recommended-wallets/bb-fii/suggestions`                                             | Gera uma sugestão (`{ walletId, month, tab, contribution? }`) |
| `POST` | `/api/admin/recommended-wallets/bb-fii/import`                                            | Importa `{ fileName, contentBase64 }` (admin)                 |
| `PUT`  | `/api/admin/recommended-wallets/bb-fii/:id/confirm`                                       | Confirma uma carteira para revisão (admin)                    |

Na aplicação web, usuários autenticados podem acessar
`/carteira-recomendada` pelo link **Carteira recomendada** no dashboard. A
página exibe as abas Renda e Ganho de Capital, permite comparar uma carteira
do usuário e, para administradores, confirmar ou importar um PDF.

## Assinatura e Acesso a Recursos

Os recursos avançados de IA (sugestão mensal da carteira recomendada, chat com a IA e futuras funcionalidades) são liberados mediante assinatura do plano **basic**.

### Modelo de Negócio

A assinatura é gerenciada via **Stripe** e os dados são armazenados em `users/{uid}/billing/subscription` (tipo `UserSubscription`).

| Campo               | Descrição                                              |
| ------------------- | ------------------------------------------------------ |
| `status`            | `none`, `trialing`, `active`, `past_due` ou `canceled` |
| `plan` / `interval` | `basic` e `month`/`year`                               |
| `provider`          | `stripe`, `manual` ou `null`                           |

### Regras de Acesso (Gate de Recursos)

O direito ao recurso **`ai`** é concedido automaticamente se:

1. O usuário possuir assinatura ativa ou em período de teste (`status` é `trialing` ou `active`).
2. O usuário estiver em período de carência (`past_due` e `currentPeriodEnd` no futuro).
3. O usuário for um administrador do sistema (bypass).

O middleware `requireEntitlement('ai')` protege as rotas sensíveis, retornando `403 Forbidden` caso o usuário não cumpra os requisitos.
| `providerCustomerId` / `providerSubscriptionId` | Ids no provedor (nunca expostos na API) |
| `providerEventCreated` | `event.created` do último webhook aplicado (ordenação) |
| `currentPeriodEnd` | Fim do período pago (ISO) — define a carência de `past_due` |
| `cancelAtPeriodEnd` | Cancelamento agendado para o fim do período |

### Gate de recursos

O entitlement `ai` é concedido quando `status` é `trialing` ou `active`, quando
é `past_due` e `currentPeriodEnd` ainda está no futuro (carência), ou quando o
usuário é admin (bypass). O middleware `requireEntitlement('ai')`
(`apps/api/src/middleware/entitlement.middleware.ts`) protege
`GET/POST /api/recommended-wallets/bb-fii/suggestions` e responde
`403 { error: 'Forbidden', code: 'SUBSCRIPTION_REQUIRED' }` sem entitlement.
Com entitlement o fluxo segue inalterado, inclusive o limite diário de
sugestões.

`GET /api/me` devolve
`{ uid, admin, subscription: { status, plan, interval, currentPeriodEnd, cancelAtPeriodEnd }, entitlements: ['ai'] }`.

### Limite diário de sugestões de IA

São 5 gerações por dia por usuário. O contador fica em
`users/{uid}/aiSuggestionUsage/{YYYY-MM-DD}`, com o dia no fuso
`America/Sao_Paulo` — em UTC o limite reiniciaria às 21h de Brasília.

A cota é **reservada numa transação antes** da chamada ao provedor de IA, que
pode levar até 120 s, e devolvida se a geração falhar. Contar o uso só depois
da resposta deixava requisições paralelas passarem todas pelo limite.

Cada documento grava `expiresAt` (30 dias). Para o Firestore apagá-los
sozinho, habilite a política de TTL uma vez por projeto:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=aiSuggestionUsage --enable-ttl --project=dindin-4e720
```

### Stripe

O provedor de pagamento é a Stripe (Checkout + Customer Portal + webhooks).

#### Configuração no painel da Stripe

1. Crie o produto **DinDin Básico** com dois preços recorrentes:
   - `brl 1000` por **mês** (R$ 10,00/mês)
   - `brl 10000` por **ano** (R$ 100,00/ano)
2. Em **Configurações → Portal do cliente**, habilite:
   - Cancelar assinatura (no fim do período)
   - Atualizar método de pagamento
   - Trocar entre plano mensal e anual
   - Histórico de faturas
3. Em **Desenvolvedores → Webhooks**, crie o endpoint
   `https://<região>-<projeto>.cloudfunctions.net/api/api/billing/webhook`
   (ou via Hosting: `https://dindin-4e720.web.app/api/billing/webhook`) com os
   eventos:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

#### Secrets e variáveis

Secrets (nunca versionadas):

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Configuração não secreta — o Functions v2 carrega arquivos `.env` do diretório
`apps/api` no deploy (`apps/api/.env` para todos os projetos ou
`apps/api/.env.<projectId>` por projeto; esses arquivos já estão no
`.gitignore`):

```bash
# apps/api/.env
STRIPE_PRICE_BASIC_MONTHLY=price_...
STRIPE_PRICE_BASIC_YEARLY=price_...
APP_BASE_URL=https://dindin-4e720.web.app   # opcional; sem ela usa esse domínio padrão
```

#### Desenvolvimento local

Com os emuladores rodando (`npm run emulators`), encaminhe os eventos da Stripe
para o Functions emulator (a function se chama `api` e a rota Express é
`/api/billing/webhook`):

```bash
stripe listen --forward-to http://127.0.0.1:5001/dindin-4e720/us-central1/api/api/billing/webhook
```

O `stripe listen` imprime um `whsec_...` — configure-o como
`STRIPE_WEBHOOK_SECRET` local. Também é possível usar o Hosting emulator
(`http://localhost:5002/api/billing/webhook`), que reescreve `/api/**` para a
function `api`.

#### Endpoints

| Método | Rota                            | Descrição                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/api/billing/checkout-session` | Cria sessão de Checkout (`{ interval: 'month'\|'year' }`, trial de 7 dias). Reutiliza a sessão pendente do mesmo intervalo (mesma `url`). `409 ALREADY_SUBSCRIBED` se já ativa/trialing/past_due; `409 CHECKOUT_IN_PROGRESS` se a sessão pendente de outro intervalo não pôde ser expirada |
| `POST` | `/api/billing/portal-session`   | Cria sessão do Customer Portal. `404 NO_CUSTOMER` sem customer; `429 RATE_LIMITED` (com `Retry-After`) acima de 5 sessões por minuto por usuário                                                                                                                                           |
| `POST` | `/api/billing/webhook`          | Webhook da Stripe (fora do `authMiddleware`, assinatura validada). `400` assinatura inválida; idempotência via `billingEvents/{eventId}`                                                                                                                                                   |

#### Reserva de checkout por usuário

Para evitar assinaturas duplicadas e criação ilimitada de objetos na Stripe, o
backend mantém no doc `users/{uid}/billing/subscription` campos internos (nunca
expostos em `GET /api/me`):

- `pendingCheckout: { sessionId, url, expiresAt, interval }` — gravado numa
  transação ao criar a Checkout Session. Enquanto não expirar (`expires_at` da
  sessão, 24h), novas chamadas do mesmo intervalo devolvem a mesma `url`; ao
  trocar de intervalo a sessão anterior é expirada na Stripe antes de criar a
  nova (se ela já estava expirada na Stripe, segue normalmente). A criação usa
  `idempotencyKey` única por requisição, estável nas reexecuções da transação.
  É removido pelos eventos `checkout.session.completed` e
  `checkout.session.expired` (somente se ainda for a mesma sessão).
- `portalRateLimit: { windowStart, count }` — janela fixa de 1 minuto para
  `portal-session`.

## Migração de dados legados

Duas mudanças anteriores deixaram resíduo no Firestore, e o script
`apps/api/src/scripts/migrate-legacy-data.ts` limpa os dois:

1. **`currentPrice` em posições e itens** — a #86 passou a resolver o preço a
   partir de `quotes` na leitura, mas o campo antigo continuou gravado,
   congelado no valor do dia em que o job parou de atualizá-lo.
2. **Proventos automáticos com id antigo** (`YYYY-MM_TICKER`) — o sync atual
   usa `YYYY-MM-DD_TICKER`. Enquanto existirem, `dividend-sync-record`
   precisa do tratamento especial `LEGACY_AUTO_ID`.

O script **simula por padrão** e é idempotente. Requer credenciais com
permissão de escrita no Firestore do projeto, como os demais scripts:

```bash
# simula e conta
GOOGLE_APPLICATION_CREDENTIALS=$PWD/sa-key.json \
  npm run migrate:legacy --workspace=apps/api

# aplica
GOOGLE_APPLICATION_CREDENTIALS=$PWD/sa-key.json \
  npm run migrate:legacy --workspace=apps/api -- --apply
```

Para ensaiar sem tocar em produção, aponte para o emulador:

```bash
firebase emulators:start --only firestore   # em outro terminal
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=dindin-4e720 \
  npm run migrate:legacy --workspace=apps/api -- --apply
```

Sem credencial, o script para com `migrateLegacyData.missingCredentials` e a
instrução do que definir — em vez do stack do `google-auth`.

Depois de aplicado em produção, o tratamento `LEGACY_AUTO_ID` em
`dividend-sync-record.service.ts` pode ser removido.

## Moeda: BRL-only

O app trabalha **apenas com reais** (issue #266, herdada da #105). Projeção de
proventos, patrimônio e totais consolidados somam valores sem conversão de
câmbio, então uma carteira em outra moeda seria calculada como se fosse em
reais. Por isso `POST /api/wallets` e `PUT /api/wallets/:id` rejeitam com 400
qualquer `currency` diferente de `BRL`. Multimoeda está fora da v1.

## Cotações: horários e reconciliação

A cadeia diária roda depois do encerramento do after-market da B3 (19:00), em
`America/Sao_Paulo`: cotações às **19:30**, snapshot patrimonial às **20:00** e
preço-alvo às **20:15** (issue #388). Os três se movem em bloco, porque os dois
últimos leem o preço gravado pelo primeiro.

Cada cotação guarda dois horários distintos: `updatedAt`, quando **nós**
escrevemos, e `quotedAt`, quando a **fonte** apurou o preço (issue #387). É o
`quotedAt` que aparece nas telas de geladeira e de posições como
"Fechamento de dd/MM/aaaa" (issue #390), e é ele que permite medir no Cloud
Logging a que horas a Brapi consolida o fechamento de cada pregão.

Às **23:30**, `reconcileQuotesScheduled` volta e corrige apenas o preço do dia
(issue #389), sem registrar proventos nem tirar a foto de data-com — a Brapi
pode continuar servindo o último negócio do pregão contínuo por horas depois do
fechamento. A cotação só é sobrescrita quando o `quotedAt` da fonte é posterior
ao já gravado, para um dado em cache não substituir um fechamento consolidado.

## Alertas de preço-alvo da geladeira

Todo dia às 20:15 (após a atualização de cotações das 19:30 e o snapshot
patrimonial das 20:00, já depois do encerramento do after-market), a function
`checkTargetPricesScheduled` compara a
cotação atual de cada item da geladeira com o `targetPrice` definido pelo
usuário e grava um alerta em `users/{uid}/alerts/{fridgeId}_{ticker}`.

- O alerta nasce `open` e o usuário recebe **um** e-mail. Enquanto o alerta
  continuar aberto o job não cria outro, então não há aviso diário repetido.
- Quando o preço volta abaixo do alvo ou o item sai da geladeira, o alerta vira
  `cleared` e o ativo é rearmado: se voltar ao alvo, um novo aviso é enviado.

### E-mail (API do Resend)

O aviso é enviado pela **API HTTP do Resend** (`POST https://api.resend.com/emails`)
direto do job. A extensão Trigger Email do Firebase foi descartada porque o
Firebase Extensions será desligado em 31/03/2027 — adotá-la obrigaria a migrar
o envio de novo antes dessa data.

Configuração (uma vez):

1. Verificar o domínio `javitech.online` no Resend criando os registros DNS que
   o painel informar (DKIM em `resend._domainkey`, mais MX e SPF no subdomínio
   `send.`, que é o return-path da infra do Resend).
2. Gerar uma API key com permissão de envio e gravá-la como segredo:

   ```bash
   firebase functions:secrets:set RESEND_API_KEY
   ```

O segredo está vinculado a `checkTargetPricesScheduled` em `apps/api/src/index.ts`.
O remetente padrão é `DinDin <alertas@javitech.online>` e pode ser trocado pela
variável de ambiente `ALERT_MAIL_FROM`. O endereço precisa pertencer ao domínio
verificado.

O `Reply-To` sai preenchido porque o domínio não tem MX: a caixa do remetente
não recebe, e sem ele qualquer resposta ao alerta voltaria com erro. O padrão
pode ser trocado por `ALERT_MAIL_REPLY_TO` — quando houver caixa no próprio
domínio (ex.: `contato@javitech.online`), é para lá que ele deve apontar.

Comportamento em falha, por decisão de projeto:

- Sem `RESEND_API_KEY` ou sem e-mail no Auth, o alerta é criado e o envio é
  pulado com log — o job não quebra.
- Erro do Resend não marca `notifiedAt`: como o alerta segue `open`, a
  execução do dia seguinte o devolve como pendência e tenta de novo, sem
  criar alerta duplicado.
- Os envios são sequenciais e espaçados (`ALERT_MAIL_INTERVAL_MS`, 600ms por
  padrão) para respeitar o limite de requisições por segundo do Resend.
- Cada envio leva uma `Idempotency-Key` estável por alerta, então o retry do
  scheduler não entrega o mesmo e-mail duas vezes.

O destinatário vem do Firebase Auth (`getAuth().getUser(uid).email`).

## Próximos passos

1. Criar o projeto `dindin-4e720` no Firebase Console (ou ajustar em `.firebaserc`).
2. Configurar a secret `FIREBASE_SERVICE_ACCOUNT` no repositório para habilitar o deploy contínuo.
3. Implementar CRUD de posições dentro de uma carteira.
