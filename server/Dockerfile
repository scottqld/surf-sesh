# SurfSesh API — multi-stage so the native better-sqlite3 build tools don't ship
# in the runtime image. Targets linux/amd64 (TerraMaster F4-424 Pro, i3-N305).
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain for better-sqlite3's native addon (used only if no prebuilt binary).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
EXPOSE 8098
# DB lives on a mounted volume (see docker-compose); created on first run.
ENV DB_PATH=/data/surfsesh.db
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8098)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
