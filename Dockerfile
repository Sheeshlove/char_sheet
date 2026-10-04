# syntax=docker/dockerfile:1.7
# Продакшен-образ `web` (SPEC §16.2): Next.js standalone + подготовка при старте
# (миграции → первый администратор → content:load).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable
WORKDIR /repo

# 1. Зависимости — отдельным слоем, чтобы не переустанавливать их при каждой правке кода.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/content-schema/package.json packages/content-schema/
COPY packages/content-data/package.json packages/content-data/
COPY packages/rules-engine/package.json packages/rules-engine/
COPY packages/importer/package.json packages/importer/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ps/web..."

# 2. Сборка приложения и скрипта подготовки.
FROM deps AS build
COPY . .
ENV NODE_ENV=production
RUN pnpm --filter @ps/web build \
 && pnpm --filter @ps/web build:prestart \
 && mkdir -p /out/content-data \
 && cp -r packages/content-data/. /out/content-data/ \
 && rm -rf /out/content-data/node_modules /out/content-data/src

# 3. Рантайм: только standalone-сервер, статика, миграции и JSON-пакеты контента.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads \
    CONTENT_DATA_DIR=/app/content-data \
    MIGRATIONS_DIR=/app/drizzle \
    NODE_PATH=/app/node_modules/.pnpm/node_modules
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist/prestart.cjs ./prestart.cjs
COPY --from=build /out/content-data ./content-data
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
 && mkdir -p /data/uploads \
 && chown -R node:node /data /app/apps/web/.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "apps/web/server.js"]
