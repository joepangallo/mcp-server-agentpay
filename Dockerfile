FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production 2>/dev/null || npm install --production

COPY index.js server.json README.md ./

ENTRYPOINT ["node", "index.js"]
