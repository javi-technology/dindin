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
- Conta Google e projeto Firebase (`dindin-dev`)

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

## Próximos passos

1. Criar o projeto `dindin-dev` no Firebase Console (ou renomear em `.firebaserc`).
2. Inicializar o Angular em `apps/web`.
3. Implementar autenticação e CRUD de carteira.
