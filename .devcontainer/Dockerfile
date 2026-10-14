# Ambiente isolado para os agentes de IA (issue #538).
#
# As versões vêm do devcontainer.json, que a suíte confere contra o CI e o
# `apps/mobile/.flutter-version`: fixá-las aqui as faria divergir do pipeline
# na primeira atualização.
ARG NODE_VERSION
# A imagem oficial acompanha a linha 22.x, como o `setup-node` do CI; a
# `devcontainers/javascript-node` parou numa versão abaixo da que o Angular
# exige. É a trixie porque o binário arm64 do rtk exige a glibc 2.39, e a
# bookworm traz a 2.36.
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

# O AGENTS.md exige o rtk em todo comando de shell. O checksum é o do
# `checksums.txt` da versão: ao subir o RTK_VERSION, atualize os dois, ou o
# build falha aqui.
ARG RTK_VERSION
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      arm64) alvo=aarch64-unknown-linux-gnu; \
        sha=d1cc49dfa2cd443fc32625444b59fe616b6c80478cca210985118347174dd758 ;; \
      amd64) alvo=x86_64-unknown-linux-musl; \
        sha=bc2b8902b0d9c796c82ef45f16ae2307e17757afeca5ee156235a3dc7bda5f89 ;; \
      *) echo "rtk sem binário para ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
  && curl -fsSLo /tmp/rtk.tar.gz \
    "https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}/rtk-${alvo}.tar.gz" \
  && echo "${sha}  /tmp/rtk.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/rtk.tar.gz -C /usr/local/bin rtk \
  && rm /tmp/rtk.tar.gz \
  && rtk --version

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
