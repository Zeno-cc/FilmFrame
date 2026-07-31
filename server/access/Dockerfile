ARG ACCESS_NODE_IMAGE=node:22.23.2-bookworm-slim@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46

FROM ${ACCESS_NODE_IMAGE} AS build

ARG FILMFRAME_REVISION=uncommitted

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm_config_build_from_source=true npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM ${ACCESS_NODE_IMAGE} AS runtime

ARG FILMFRAME_REVISION=uncommitted

LABEL org.opencontainers.image.title="FilmFrame access service" \
      org.opencontainers.image.revision="${FILMFRAME_REVISION}"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/access.sqlite

WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations

RUN groupadd --gid 10001 filmframe \
    && useradd --uid 10001 --gid filmframe --shell /usr/sbin/nologin --create-home filmframe \
    && mkdir -p /data \
    && chown -R filmframe:filmframe /app /data \
    && chmod 700 /data

USER 10001:10001
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz',{headers:{Host:'access'}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/src/server.js"]
