# Scholis API service.
#
# Built from the repository root, same as the web image — pnpm needs the
# workspace root and every manifest before it can resolve anything. Railway is
# pointed at this file with the root as build context.
#
# The API had no production image at all. Its `start` script runs tsx against
# TypeScript with dotenv-cli reading ../../.env; all three are development-only
# and none exist here. This image runs a bundle and takes configuration from
# the platform.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
# Manifests before source, so this layer survives code changes.
#
# Every workspace manifest has to be listed. --frozen-lockfile compares the
# lockfile against the workspace it can see, and one missing package.json is
# ERR_PNPM_OUTDATED_LOCKFILE rather than a quiet omission.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/config/package.json    ./packages/config/
COPY packages/schema/package.json    ./packages/schema/
COPY packages/engine/package.json    ./packages/engine/
COPY packages/scoring/package.json   ./packages/scoring/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json        ./packages/db/
COPY apps/web/package.json           ./apps/web/
COPY apps/api/package.json           ./apps/api/
RUN pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY . .
RUN pnpm --filter @scholis/api build

# ---- runtime ----------------------------------------------------------------
# esbuild inlines every dependency, so there is no node_modules here and nothing
# to install. Leaving drizzle-orm external was tried first and broke on boot:
# its entry points mix CJS and ESM, and Node raised ERR_REQUIRE_CYCLE_MODULE.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 hono

COPY --from=builder --chown=hono:nodejs /app/apps/api/dist ./dist

# The migration SQL, so the pre-deploy step runs from this same image instead of
# needing drizzle-kit and the whole workspace.
COPY --from=builder --chown=hono:nodejs /app/packages/db/migrations ./migrations
ENV MIGRATIONS_DIR=/app/migrations

USER hono
EXPOSE 3001

# PORT comes from Railway. No dotenv-cli, no tsx, no .env file.
CMD ["node", "dist/index.mjs"]
