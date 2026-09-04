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

| Método | Rota                                                                    | Descrição                                        |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| `GET`  | `/api/recommended-wallets/bb-fii`                                       | Lista as carteiras importadas                    |
| `GET`  | `/api/recommended-wallets/bb-fii/latest?month=YYYY-MM`                  | Retorna a carteira do mês ou a mais recente      |
| `GET`  | `/api/recommended-wallets/bb-fii/compare/:walletId?wallet=renda\|ganho` | Compara a carteira do usuário com a recomendação |
| `POST` | `/api/admin/recommended-wallets/bb-fii/import`                          | Importa `{ fileName, contentBase64 }` (admin)    |
| `PUT`  | `/api/admin/recommended-wallets/bb-fii/:id/confirm`                     | Confirma uma carteira para revisão (admin)       |

Na aplicação web, usuários autenticados podem acessar
`/carteira-recomendada` pelo link **Carteira recomendada** no dashboard. A
página exibe as abas Renda e Ganho de Capital, permite comparar uma carteira
do usuário e, para administradores, confirmar ou importar um PDF.

## Próximos passos

1. Criar o projeto `dindin-4e720` no Firebase Console (ou ajustar em `.firebaserc`).
2. Configurar a secret `FIREBASE_SERVICE_ACCOUNT` no repositório para habilitar o deploy contínuo.
3. Implementar CRUD de posições dentro de uma carteira.
