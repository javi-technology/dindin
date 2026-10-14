#!/usr/bin/env bash
# Roda a cada vez que o container sobe (issue #538).
set -euo pipefail

# O ai-memory fica num servidor externo, alcançado pelo túnel SSH que o host
# abre em 127.0.0.1:${AI_MEMORY_PORT}. O servidor recusa com 403 ("forbidden
# host") o pedido endereçado a host.docker.internal, então o agente chama
# 127.0.0.1 aqui dentro e o socat repassa ao túnel do host.
if ! pgrep -f "socat TCP-LISTEN:${AI_MEMORY_PORT}" >/dev/null; then
  nohup socat TCP-LISTEN:"${AI_MEMORY_PORT}",bind=127.0.0.1,fork,reuseaddr \
    TCP:host.docker.internal:"${AI_MEMORY_PORT}" \
    >/tmp/ai-memory-repasse.log 2>&1 &
fi
