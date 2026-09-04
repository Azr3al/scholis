# Scholis web service.
#
# Built from the repository root — pnpm needs the workspace root, the lockfile,
# and every workspace manifest before it can resolve anything. Railway is
# pointed at this file with the root as build context.
#
# Multi-stage so the runtime image carries only Next's standalone output and no
# build toolchain. `output: 'standalone'` in next.config.ts traces the exact
# node_modules the server needs.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
# Manifests before source, so this layer survives code changes.
#
# Every workspace manifest has to be here. --frozen-lockfile compares the
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

# NEXT_PUBLIC_* is inlined into the browser bundle at build time, so it has to
# be present now — reading it at runtime is not an option. Without this the
# shipped bundle calls http://localhost:3001 from the student's browser.
#
# Only ever the public API origin. Nothing secret belongs behind a NEXT_PUBLIC_
# name; anything here is readable by anyone who opens devtools.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Where /api/* is proxied to. Also build-time: Next evaluates rewrites() during
# the build and bakes the destination into routes-manifest.json, so reading it
# at server start does not work — it silently falls back and every proxied call
# 500s. Server-side only; the browser never sees this value.
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=${API_PROXY_TARGET}

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @scholis/web build

# There are no static assets yet, and .gitignore excludes the .gitkeep that
# would otherwise hold the directory open, so a clean checkout has no
# apps/web/public at all. The runtime COPY below is unconditional, so create it
# here — a local build passed only because the directory happened to exist on
# that machine.
RUN mkdir -p apps/web/public

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
# is how Railway assigns the port. 0.0.0.0 because the default binds loopback
# and the platform's health check would never reach it.
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
