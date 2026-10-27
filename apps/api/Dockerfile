# syntax=docker/dockerfile:1
# Build context must be the repo root: Bun workspaces link @devflow/shared here.
FROM node:22-bookworm-slim
WORKDIR /app
# Bun installs and runs migrations/seed; Node runs the compiled server.
RUN npm install --global bun@1.3.1

# Manifests first, so editing source does not re-run the install layer.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN cd apps/api && bunx prisma generate \
  && cd /app && bun run --cwd packages/shared build && bun run --cwd apps/api build

# shortcut: single stage keeps devDependencies (Prisma CLI for migrate, Bun for seed); split when image size matters.
ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
