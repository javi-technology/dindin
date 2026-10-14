# Ambiente isolado para os agentes de IA (issue #538).
#
# As versões vêm do devcontainer.json, que a suíte confere contra o CI e o
# `apps/mobile/.flutter-version`: fixá-las aqui as faria divergir do pipeline
# na primeira atualização.
ARG NODE_VERSION
FROM mcr.microsoft.com/devcontainers/javascript-node:1-${NODE_VERSION}-bookworm

ARG FLUTTER_VERSION

# O Flutter roda só `flutter test` e `flutter analyze` aqui: simulador iOS
# exige macOS e o emulador Android, KVM. Por isso só o pré-cache de Linux.
RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip xz-utils zip \
  && rm -rf /var/lib/apt/lists/*

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
