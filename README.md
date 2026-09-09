# DinDin

[![CI](https://github.com/javi-technology/dindin/actions/workflows/ci.yml/badge.svg)](https://github.com/javi-technology/dindin/actions/workflows/ci.yml)

Sistema de controle de carteira de Fundos Imobiliários (FIIs) com estratégia de "geladeira".

## Stack

- **Frontend**: Angular + Tailwind CSS
- **Backend**: Firebase Cloud Functions + Express.js + Node.js
- **Banco de dados**: Firestore
- **Hospedagem**: Firebase Hosting
- **Autenticação**: Firebase Authentication

## Estrutura

```
dindin/
├── apps/
│   ├── web/          # Aplicação Angular
│   └── api/          # Cloud Functions (Express)
├── packages/
│   └── shared-types/ # Tipos compartilhados
├── firebase.json
├── firestore.rules
└── firestore.indexes.json
```

## Pré-requisitos

- Node.js 22
- Firebase CLI
- Secret `OPENROUTER_API_KEY` configurado nas Cloud Functions (e,
  opcionalmente, `OPENROUTER_MODEL`, padrão `openai/gpt-5.6-luna`) com:
  `firebase functions:secrets:set OPENROUTER_API_KEY`
- Conta Google e projeto Firebase (`dindin-4e720`)

## Comandos

```bash
# Instalar dependências
npm install

# Rodar emuladores locais
npm run emulators

# Build da API
npm run api:build

# Servir API localmente
npm run api:serve

# Deploy
npm run deploy
```

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

## Assinatura

Os recursos de IA (sugestão mensal da carteira recomendada, chat com a IA e
futuras features) são liberados mediante assinatura do plano `basic`
(R$ 10,00/mês ou R$ 100,00/ano, com 7 dias de teste grátis).

### Modelo

A assinatura fica em `users/{uid}/billing/subscription` (tipo
`UserSubscription` em `packages/shared-types`). A ausência do documento
equivale a `status: 'none'`. O cliente pode ler o próprio documento, mas a
escrita é exclusiva do Admin SDK (integração com o provedor de pagamento ou
concessão manual pelo admin).

| Campo                                           | Descrição                                                   |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `status`                                        | `none`, `trialing`, `active`, `past_due` ou `canceled`      |
| `plan` / `interval`                             | `basic` e `month`/`year` (ou `null`)                        |
| `provider`                                      | `stripe`, `manual` ou `null`                                |
| `providerCustomerId` / `providerSubscriptionId` | Ids no provedor (nunca expostos na API)                     |
| `currentPeriodEnd`                              | Fim do período pago (ISO) — define a carência de `past_due` |
| `cancelAtPeriodEnd`                             | Cancelamento agendado para o fim do período                 |

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

## Próximos passos

1. Criar o projeto `dindin-4e720` no Firebase Console (ou ajustar em `.firebaserc`).
2. Configurar a secret `FIREBASE_SERVICE_ACCOUNT` no repositório para habilitar o deploy contínuo.
3. Implementar CRUD de posições dentro de uma carteira.
