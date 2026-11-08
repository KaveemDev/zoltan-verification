# Build from the repo root:  docker build -f apps/api/Dockerfile -t agreements-api .
FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer \
    PUPPETEER_SKIP_DOWNLOAD=true \
    # Chrome's sandbox can't start in most containers. Rendering is locked down instead:
    # JavaScript off, all network requests blocked, every value HTML-escaped.
    PUPPETEER_NO_SANDBOX=1

# Fonts for the PDFs: Liberation is metric-compatible with Arial/Helvetica, Noto covers
# Devanagari and other Indian scripts in customer names.
# pg_dump 16 for the nightly database backup (Debian bookworm only ships 15, which can't dump a 16 server).
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-liberation fonts-noto-core ca-certificates curl \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*

# Dependencies first for layer caching. The Prisma schema is needed by `prisma generate` (postinstall).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --omit=dev -w @app/api -w @app/shared && npm cache clean --force

# Chrome pinned to the installed Puppeteer version, plus its system libraries.
RUN apt-get update \
 && npx puppeteer browsers install chrome --install-deps \
 && rm -rf /var/lib/apt/lists/*

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN chown -R node:node /app/.cache

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Applies pending migrations, then starts the API (and its scheduled jobs).
# shortcut: runs TypeScript through tsx because @app/shared ships as source; add a bundling step if startup time matters.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma && exec node_modules/.bin/tsx apps/api/src/index.ts"]
