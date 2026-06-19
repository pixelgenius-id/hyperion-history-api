FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl ca-certificates gnupg build-essential python3 \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pm2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

CMD ["pm2-runtime", "start", "pm2/ecosystem.config.cjs", "--only", "vex-indexer,vex-api"]
