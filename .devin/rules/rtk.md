---
description: 'rtk — CLI proxy para otimizar tokens em comandos de shell'
trigger: always_on
---

# RTK — Token-Optimized CLI

**rtk** é um proxy de CLI que filtra e comprime saídas de comandos, economizando 60-90% de tokens.

## Regra

Sempre prefixar comandos de shell com `rtk`:

```bash
# Em vez de:            Use:
git status               rtk git status
git log -10               rtk git log -10
cargo test                rtk cargo test
docker ps                 rtk docker ps
kubectl get pods          rtk kubectl pods
```

## Comandos meta (usar diretamente)

```bash
rtk gain              # Dashboard de economia de tokens
rtk gain --history    # Histórico de economia por comando
rtk discover          # Encontrar oportunidades perdidas de uso do rtk
rtk proxy <cmd>       # Rodar sem filtro (sem filtragem), mas registrar uso
```
