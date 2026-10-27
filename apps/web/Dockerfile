# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global bun@1.3.1

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

COPY . .
# next.config bakes the /api rewrite at build time, so the API origin is a build arg.
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN bun run --cwd packages/shared build && bun run --cwd apps/web build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app/apps/web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# shortcut: whole workspace is copied; switch to `output: "standalone"` when image size matters.
# chown because the server writes its fetch/ISR cache under .next as this user.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
