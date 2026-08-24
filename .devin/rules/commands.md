---
description: 'Comandos principais do monorepo DinDin (build, testes, emuladores, deploy)'
trigger: always_on
---

# Comandos

```bash
npm install                                    # instalar dependências
firebase emulators:start                       # emuladores (Hosting :5002, Functions :5001, Firestore :8080, Auth :9099)
npm run api:build --workspace=apps/api         # build da API
npm run build --workspace=apps/web             # build do frontend
npm run test --workspace=apps/api              # testes da API (Jest)
npm run test --workspace=apps/web              # testes do frontend (Karma)
npm run format                                # formatar com Prettier
npm run format:check                          # verificar formatação
firebase deploy                               # deploy completo
```
