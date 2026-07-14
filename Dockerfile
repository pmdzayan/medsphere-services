# ==============================================================================
# STAGE 1: MONOREPO PRUNING
# ==============================================================================
FROM node:20.11.0-bookworm-slim@sha256:bc863c0048ebca303a74347781b2bfb291d2830f0f3d35bf888698bf02ff8390 AS pruner
WORKDIR /app
RUN npm install -g turbo@1.13.0
COPY . .
ARG TARGET_SERVICE
# NOTE: `turbo prune --scope=<target>` is deprecated in favor of the positional
# form (`turbo prune <target>`) per Turborepo's current support policy. The
# positional form has existed since `prune` was introduced, so this is a
# drop-in replacement that stays correct across this pinned 1.x line and any
# future 2.x upgrade.
RUN turbo prune ${TARGET_SERVICE} --docker

# ==============================================================================
# STAGE 2: WORKSPACE COMPILATION
# ==============================================================================
FROM node:20.11.0-bookworm-slim@sha256:bc863c0048ebca303a74347781b2bfb291d2830f0f3d35bf888698bf02ff8390 AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3 \
    pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ARG TARGET_SERVICE
RUN if [ -d "packages/database" ]; then pnpm --filter @medsphere/database prisma:generate; fi

RUN pnpm turbo run build --filter=${TARGET_SERVICE}
RUN pnpm prune --prod --no-optional

# ==============================================================================
# STAGE 3: MINIMAL NON-ROOT PRODUCTION RUNTIME
#
# Distroless: no shell, no package manager, smallest practical attack surface.
# That is exactly what made the previous wget-based healthcheck impossible
# here — see scripts/healthcheck.js for the Node-only replacement copied in
# below, invoked directly via HEALTHCHECK CMD (no shell needed).
#
# Note on the stage name this replaced: a Dockerfile comment can't make a
# service HIPAA-compliant (or compliant with any regulation) on its own —
# compliance is an organizational and process outcome evaluated across the
# whole system, not a label on an image layer. This stage description sticks
# to what the image actually does.
# ==============================================================================
FROM gcr.io/distroless/nodejs20-debian12:nonroot@sha256:4a38e2ec3aa6df2980d2ef937a3bf2a3d0df62bc7ff6cf2f0851ec3cdd3c7b34 AS runner
WORKDIR /app

USER nonroot:nonroot
ENV NODE_ENV=production
ENV PORT=3000

ARG TARGET_SERVICE
COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/packages ./packages
COPY --from=builder --chown=nonroot:nonroot /app/apps/${TARGET_SERVICE}/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/apps/${TARGET_SERVICE}/package.json ./package.json
COPY --chown=nonroot:nonroot scripts/healthcheck.js ./healthcheck.js

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=20s \
  CMD ["node", "healthcheck.js"]
CMD ["dist/main.js"]
