# Imagem da aplicação para o Google Cloud Run (também roda em qualquer Docker).
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Instala só as dependências de produção, usando o package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public
COPY scripts ./scripts

# Roda como usuário sem privilégios de administrador
USER node

# O Cloud Run define a variável PORT (8080 por padrão)
ENV PORT=8080
EXPOSE 8080

# O Node é executado diretamente como processo principal (PID 1) do contêiner,
# para receber o SIGTERM enviado pelo Cloud Run e encerrar de forma graciosa.
CMD ["node", "src/server.js"]
