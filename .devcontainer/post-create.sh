#!/usr/bin/env bash
# Preparação do container depois de criado (issue #538).
set -euo pipefail

# Volumes nomeados nascem do root: sem isto o `npm ci` não grava neles.
sudo chown node:node \
  node_modules apps/api/node_modules apps/web/node_modules \
  apps/mobile/.dart_tool /home/node/.claude /home/node/.config/gh

# O socket do ssh-agent repassado pelo host chega do root.
if [ -S /run/host-services/ssh-auth.sock ]; then
  sudo chmod 666 /run/host-services/ssh-auth.sock
fi

# As chaves do GitHub vêm da API por HTTPS, em vez de aceitar no escuro a
# primeira que o `ssh` receber. A ~/.ssh do host não é montada.
mkdir -p ~/.ssh && chmod 700 ~/.ssh
curl -fsSL https://api.github.com/meta |
  node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{for(const k of JSON.parse(s).ssh_keys)console.log(`github.com ${k}`)})' \
    >~/.ssh/known_hosts

npm ci
(cd apps/mobile && flutter pub get)
