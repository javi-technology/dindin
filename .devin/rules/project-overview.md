---
description: "Visão geral do projeto DinDin: stack e estrutura do monorepo"
trigger: always_on
---

# DinDin — Visão Geral

Monorepo de app financeiro pessoal. Stack: Angular 19 + Tailwind CSS 3 (frontend), Cloud Functions + Express + Node 22 (backend), Firestore, Firebase Auth/Hosting. Projeto Firebase: `dindin-4e720`.

## Estrutura do Repositório

```
apps/
  api/    # Cloud Functions (Express + TypeScript) — src/ e tests/
  web/    # Angular + Tailwind — src/app/{core,features,shared}/
packages/
  models/        # Models do Firestore (User, Wallet, Position, Fridge, FridgeItem)
  shared-types/  # Tipos compartilhados (ex: HealthResponse)
```

## Idioma do Agente

- **Sempre responder em português do Brasil (pt-BR)**. Todas as interações, explicações e comentários devem ser feitos neste idioma.
