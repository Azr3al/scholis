# Scholis web service — Railway.
#
# Multi-stage so the runtime image carries only Next.js standalone output and
# no build toolchain. `output: 'standalone'` in next.config.ts is what makes
# this possible; it traces the exact node_modules the server needs.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
# Manifests are copied before source so this layer caches across code changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/config/package.json  ./packages/config/
COPY packages/schema/package.json  ./packages/schema/
COPY packages/engine/package.json  ./packages/engine/
COPY packages/scoring/package.json ./packages/scoring/
COPY packages/db/package.json      ./packages/db/
COPY apps/web/package.json         ./apps/web/
RUN pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @scholis/web build

# ---- runtime ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

# Next's standalone server reads PORT and HOSTNAME from the environment, which
# is how Railway assigns the port.
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
