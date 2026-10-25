# DevFlow

Issue tracking and workflow management for software teams.

Monorepo (Bun workspaces):

- `apps/api`: NestJS 12 + Prisma 7 + PostgreSQL, REST under `/api/v1`, Swagger at `/api/docs`
- `apps/web`: Next.js 16 (App Router) + Tailwind CSS 4
- `packages/shared`: enums, workflow transition map, sort allowlist used by both sides

## Run locally

Requires Bun 1.3+, Node 22.12+ and PostgreSQL 18 (local install, or `docker compose up -d db`).

```bash
bun install
cp .env.example apps/api/.env          # then set real JWT secrets
cd apps/api
bunx prisma generate
bunx prisma migrate dev
bun run start:dev                      # API on http://localhost:4000
```

In a second terminal:

```bash
bun run --cwd apps/web dev             # web on http://localhost:3000
```

The web app proxies `/api/v1/*` to the API, so auth cookies stay first-party.

## Checks

```bash
bun run test        # shared unit tests + API integration tests (needs the database)
bun run typecheck
bun run build
```

## Auth model

- HttpOnly cookies: access JWT (15 min) and a refresh token (7 days, stored hashed, rotated on every refresh)
- Double-submit CSRF token (`X-CSRF-Token` header must match the `csrf_token` cookie) on every mutation
- Passwords hashed with Argon2id; login and register are rate limited to 10/min per IP
