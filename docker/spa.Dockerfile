# syntax=docker/dockerfile:1.7
# One Dockerfile for both Angular apps. Build context: the repository root.
#   docker build -f docker/spa.Dockerfile --build-arg APP=admin   -t speakukrainian-admin .
#   docker build -f docker/spa.Dockerfile --build-arg APP=student -t speakukrainian-student .

FROM node:22-bookworm-slim AS build
ARG APP
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/${APP}/package.json apps/${APP}/
# `--ignore-scripts`: the root postinstall fetches H5P assets only the API needs.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
      --filter @speakukrainian/${APP}... \
      --filter @speakukrainian/shared...

COPY tsconfig.base.json turbo.json ./
COPY packages/shared packages/shared
COPY apps/${APP} apps/${APP}
RUN pnpm --filter @speakukrainian/shared build \
 && pnpm --filter @speakukrainian/${APP} build

FROM nginx:1.29-alpine AS runtime
ARG APP
COPY docker/spa.nginx.conf /etc/nginx/templates/default.conf.template
# Writes /config.json from the container's environment at start-up, so the same
# image runs against any Supabase project and domain.
COPY --chmod=755 docker/spa-config.sh /docker-entrypoint.d/40-spa-config.sh
COPY --from=build /repo/apps/${APP}/dist/${APP}/browser /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
