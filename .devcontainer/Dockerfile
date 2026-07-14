FROM mcr.microsoft.com/devcontainers/base:ubuntu

# ── Node.js 22 ────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean -y && rm -rf /var/lib/apt/lists/*

# ── JDK 21 (Eclipse Adoptium) ─────────────────────────────
# Necessário para os emuladores do Firebase (Firestore, Auth)
RUN apt-get update && apt-get install -y wget gnupg && \
    wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | \
    gpg --dearmor -o /usr/share/keyrings/adoptium.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb noble main" \
    > /etc/apt/sources.list.d/adoptium.list && \
    apt-get update && apt-get install -y temurin-21-jdk && \
    apt-get clean -y && rm -rf /var/lib/apt/lists/*

# ── Firebase CLI ──────────────────────────────────────────
RUN npm install -g firebase-tools

# ── rtk (Rust Token Killer) ──────────────────────────────
RUN curl -fsSL -o /tmp/rtk.tar.gz \
    https://github.com/rtk-ai/rtk/releases/latest/download/rtk-aarch64-unknown-linux-gnu.tar.gz && \
    tar xzf /tmp/rtk.tar.gz -C /usr/local/bin/ rtk && \
    rm /tmp/rtk.tar.gz

WORKDIR /workspace
