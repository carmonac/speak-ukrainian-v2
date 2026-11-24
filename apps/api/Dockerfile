# syntax=docker/dockerfile:1.7
# Build context: the repository root.
#   docker build -f apps/api/Dockerfile -t speakukrainian-api .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY scripts/package.json scripts/
# Present before the install because the root postinstall runs it.
COPY scripts/fetch-h5p-core.ts scripts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter @speakukrainian/api... \
      --filter @speakukrainian/shared... \
      --filter @speakukrainian/scripts

# The H5P core and editor client libraries, from pinned commits, hash-checked.
# `--require` fails the build if they cannot be fetched: an image without them
# would boot and then answer 503 for every exercise.
FROM deps AS h5p-assets
RUN node scripts/fetch-h5p-core.ts --require

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @speakukrainian/shared build \
 && pnpm --filter @speakukrainian/api build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --filter @speakukrainian/api --prod --legacy /app

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=build /app ./
COPY --from=h5p-assets /repo/apps/api/h5p/core ./h5p/core
COPY --from=h5p-assets /repo/apps/api/h5p/editor ./h5p/editor
RUN useradd --system --create-home --uid 10001 nodeapp \
 && mkdir -p /app/h5p/temporary-storage \
 && chown -R nodeapp:nodeapp /app
USER nodeapp
EXPOSE 8080
CMD ["node", "dist/main.js"]
