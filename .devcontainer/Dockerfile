# Ambiente isolado para os agentes de IA (issue #538).
#
# As versões vêm do devcontainer.json, que a suíte confere contra o CI e o
# `apps/mobile/.flutter-version`: fixá-las aqui as faria divergir do pipeline
# na primeira atualização.
ARG NODE_VERSION
# A imagem oficial acompanha a linha 22.x, como o `setup-node` do CI; a
# `devcontainers/javascript-node` parou numa versão abaixo da que o Angular
# exige. A base é o Debian estável atual (trixie).
FROM node:${NODE_VERSION}-trixie

ARG FLUTTER_VERSION

# O Flutter roda só `flutter test` e `flutter analyze` aqui: simulador iOS
# exige macOS e o emulador Android, KVM. O `sudo` é do post-create.sh, que
# acerta o dono dos volumes, e o `socat` do post-start.sh, que repassa o
# ai-memory.
RUN apt-get update \
  && apt-get install -y --no-install-recommends socat sudo unzip xz-utils zip \
  && rm -rf /var/lib/apt/lists/* \
  && echo 'node ALL=(root) NOPASSWD:ALL' >/etc/sudoers.d/node \
  && chmod 0440 /etc/sudoers.d/node

RUN git clone --depth 1 --branch "${FLUTTER_VERSION}" \
    https://github.com/flutter/flutter.git /opt/flutter \
  && chown -R node:node /opt/flutter

ENV PATH="/opt/flutter/bin:${PATH}"

USER node

RUN git config --global --add safe.directory /opt/flutter \
  && flutter config --no-analytics \
  && dart --disable-analytics \
  && flutter precache --no-android --no-ios --no-web \
  && flutter --version
