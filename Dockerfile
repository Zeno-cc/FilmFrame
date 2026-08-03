ARG NODE_BUILD_IMAGE=node:22.23.2-bookworm-slim@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46
ARG NGINX_RUNTIME_IMAGE=nginx:1.30.0-alpine@sha256:0272e4604ed93c1792f03695a033a6e8546840f86e0de20a884bb17d2c924883

FROM ${NODE_BUILD_IMAGE} AS build

ARG FILMFRAME_REVISION=uncommitted
ARG FILMFRAME_VERSION=0.0.0-dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM ${NGINX_RUNTIME_IMAGE}

ARG FILMFRAME_REVISION=uncommitted
ARG FILMFRAME_VERSION=0.0.0-dev

LABEL org.opencontainers.image.title="FilmFrame static application" \
      org.opencontainers.image.source="https://github.com/Zeno-cc/FilmFrame" \
      org.opencontainers.image.version="${FILMFRAME_VERSION}" \
      org.opencontainers.image.revision="${FILMFRAME_REVISION}"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1
