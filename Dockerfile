# Imagen oficial de Playwright: trae Chromium + todas las dependencias del sistema.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

ENV NODE_ENV=production
WORKDIR /app

# Herramientas para compilar módulos nativos (better-sqlite3) — la imagen trae
# Node 24, que no tiene binario prebuilt de better-sqlite3.
RUN apt-get update && apt-get install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

# Instala dependencias (cachea capa si no cambian los manifests).
COPY package*.json ./
RUN npm ci

# Copia el resto del código.
COPY . .

# Render inyecta PORT; el servidor de salud lo usa.
EXPOSE 3000

CMD ["node", "src/index.js"]
