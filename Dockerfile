# Opcional: servidor com LibreOffice, para converter PowerPoint em PDF na hospedagem.
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-impress fonts-liberation fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server/index.js"]
