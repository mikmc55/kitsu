# ============================================
# Deploy.cx Node.js Application
# ============================================
# Auto-generated Dockerfile for deploy.cx
# ============================================

FROM debian:12.5-slim

EXPOSE 80
WORKDIR /home

# ============================================
# SYSTEM DEPENDENCIES
# ============================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ============================================
# INSTALL NODE.JS
# ============================================
ARG NODE_VERSION=18.19.0

RUN curl -fSL -o node.tar.gz https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz \
    && mkdir -p /usr/local/nodejs \
    && tar -xzf node.tar.gz -C /usr/local/nodejs --strip-components=1 \
    && rm node.tar.gz \
    && ln -s /usr/local/nodejs/bin/node /usr/local/bin/node \
    && ln -s /usr/local/nodejs/bin/npm /usr/local/bin/npm

# ============================================
# DOWNLOAD APPLICATION SOURCE
# ============================================
ARG GITHUB_REPO=mikmc55/kitsu
ARG GITHUB_BRANCH=main4

RUN curl -L -o source.zip https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip \
    && unzip source.zip && rm source.zip \
    && mv *-${GITHUB_BRANCH}/* . && rm -rf *-${GITHUB_BRANCH}

# ============================================
# PORT CONFIGURATION
# ============================================
ARG OLD_PORT=3003

RUN find . -type f -name "*.js" -exec sed -i "s/${OLD_PORT}/3000/g" {} \; || true && \
    find . -type f -name "*.json" -exec sed -i "s/${OLD_PORT}/3000/g" {} \; || true && \
    find . -type f -name "*.ts" -exec sed -i "s/${OLD_PORT}/3000/g" {} \; || true

# ============================================
# INSTALL DEPENDENCIES
# ============================================
RUN npm ci --only=production && npm cache clean --force

# ============================================
# CREATE APPLICATION DIRECTORIES
# ============================================
RUN mkdir -p \
    data/cache \
    log \
    public \
    temp \
    uploads \
    && chmod -R 777 data log temp uploads

# ============================================
# ENVIRONMENT VARIABLES
# ============================================
ENV NODE_ENV=production

ENV LOG_LEVEL=info
ENV BASE_URL=

# ============================================
# STARTUP COMMAND
# ============================================
CMD ["node", "index.js"]
