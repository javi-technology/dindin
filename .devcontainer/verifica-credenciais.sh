#!/usr/bin/env bash
# Roda a cada conexão ao container (issue #538).
#
# As opções do VS Code que impedem a entrada das credenciais do host são do
# usuário, e o repositório não as controla. O container impede o git de
# usá-las, mas não impede a leitura direta: por isso elas são pré-requisito,
# e este script avisa quando encontra sinal de que alguma está ligada.
set -uo pipefail

avisos=()

# O ~/.gitconfig da imagem traz esta marca; sem ela, o arquivo foi trocado.
if ! grep -q 'Vazio de propósito (issue #538)' ~/.gitconfig 2>/dev/null; then
  avisos+=("~/.gitconfig não é o da imagem: desligue dev.containers.copyGitConfig")
fi

for arquivo in /etc/gitconfig ~/.gitconfig "${GIT_CONFIG_GLOBAL:-}"; do
  if [ -n "$arquivo" ] && grep -qi 'credential' "$arquivo" 2>/dev/null; then
    avisos+=("credential helper registrado em $arquivo: ajuste dev.containers.gitCredentialHelperConfigLocation para \"none\"")
  fi
done

if grep -q '"credsStore"' ~/.docker/config.json 2>/dev/null; then
  avisos+=("credStore do Docker registrado: desligue dev.containers.dockerCredentialHelper")
fi

if [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
  avisos+=("token do GitHub no ambiente: desligue dev.containers.githubCLILoginWithToken")
fi

if [ "${#avisos[@]}" -gt 0 ]; then
  echo
  echo "ATENÇÃO: credenciais do host podem ter entrado no container."
  for aviso in "${avisos[@]}"; do
    echo "  - $aviso"
  done
  echo "Ajuste as opções no VS Code do host e reconstrua o container"
  echo "(docs/devcontainer.md, seção \"Primeiro uso\")."
  echo
fi
exit 0
