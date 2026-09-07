# ==============================================================================
# STAGE 1: MONOREPO PRUNING
# ==============================================================================
FROM node:22.23.2-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284 AS pruner
WORKDIR /app
RUN npm install -g turbo@1.13.4
COPY . .
ARG TARGET_SERVICE
# NOTE: `turbo prune --scope=<target>` is deprecated in favor of the positional
# form (`turbo prune <target>`) per Turborepo's current support policy. The
# positional form has existed since `prune` was introduced, so this is a
# drop-in replacement that stays correct across this pinned 1.x line and any
# future 2.x upgrade.
RUN turbo prune @medsphere/${TARGET_SERVICE} --docker

# ==============================================================================
# STAGE 2: WORKSPACE COMPILATION
# ==============================================================================
FROM node:22.23.2-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284 AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy the pruned source before dependency installation because the repository
# postinstall contract generates Prisma Client and therefore requires the
# database schema to exist when lifecycle scripts execute.
COPY --from=pruner /app/out/full/ .

# Workspace package tsconfigs extend the repository root TypeScript contract.
# Turbo 1.13 prune does not reliably materialize this root file into out/full,
# so carry the exact repository-owned config explicitly from the pruner stage.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3 \
    pnpm install --frozen-lockfile

ARG TARGET_SERVICE
RUN if [ -d "packages/database" ]; then pnpm --filter @medsphere/database prisma:generate; fi

RUN pnpm turbo run build --filter=@medsphere/${TARGET_SERVICE}
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
FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:4e4fb0ce55fd73901600796ef079a9490369d2515d7da31633a91608c82ca13b AS runner
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
