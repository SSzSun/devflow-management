# API documentation

Interactive, always-current reference: **`http://localhost:4000/api/docs`**
(Swagger UI, generated from the DTO decorators by the Nest CLI Swagger plugin).
This page is the hand-written companion: routes, required roles, and the rules
that are not visible in a schema.

Base path: `/api/v1`. All request and response bodies are JSON.

## Conventions

- **Auth**: `access_token` HttpOnly cookie (15 min JWT). The web app refreshes
  silently via `POST /auth/refresh`; a raw client can also send
  `Authorization: Bearer <jwt>` until the token expires.
- **CSRF**: every non-`GET` request that authenticates by cookie must send
  `X-CSRF-Token` equal to the `csrf_token` cookie. `GET /auth/csrf` issues one
  for anonymous clients. Bearer requests are exempt.
- **Pagination**: `?page=1&limit=25`; `limit` maxes at 100. Responses are
  `{ data: [...], meta: { page, limit, total, totalPages } }` where a list is
  paginated.
- **Errors**: `{ statusCode, message, error }`; `message` may be an array of
  validation messages.
- **Rate limits**: 300 req/min per IP globally, 10 req/min on register, login
  and refresh.

## Status codes that carry meaning

| Code | When |
| --- | --- |
| 404 | The caller has no access to the workspace/project/issue (existence is not confirmed) |
| 403 | The caller can see the resource but lacks the required role |
| 409 | Mutating an archived project, or a duplicate name/key/slug |
| 400 | Invalid workflow transition, or an assignee/label outside the project |

## Auth

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/auth/csrf` | anyone | Sets and returns a CSRF token |
| POST | `/auth/register` | anyone | Sets the session cookies, returns `{ csrfToken }` |
| POST | `/auth/login` | anyone | Same; wrong password and unknown email both return 401 |
| POST | `/auth/refresh` | cookie | Rotates the refresh token; replaying an old one fails with 401 |
| POST | `/auth/logout` | anyone | Revokes the refresh token from the cookie and clears all cookies |
| GET | `/auth/me` | signed in | `{ id, email, name, avatarUrl, createdAt }` |

## Workspaces

| Method | Path | Required role |
| --- | --- | --- |
| GET | `/workspaces` | — (lists the caller's workspaces) |
| POST | `/workspaces` | — (creator becomes `OWNER`) |
| GET | `/workspaces/:workspaceId` | workspace `MEMBER` |
| PATCH | `/workspaces/:workspaceId` | workspace `ADMIN` |
| GET | `/workspaces/:workspaceId/members` | workspace `MEMBER` |
| POST | `/workspaces/:workspaceId/members` | workspace `ADMIN` — body `{ email, role }`, user must already exist |
| PATCH | `/workspaces/:workspaceId/members/:userId` | workspace `ADMIN` — the `OWNER` row is immutable |
| DELETE | `/workspaces/:workspaceId/members/:userId` | workspace `ADMIN` — the owner cannot be removed |

## Projects

| Method | Path | Required role |
| --- | --- | --- |
| GET | `/workspaces/:workspaceId/projects` | workspace `MEMBER`; `?includeArchived=true` to include archived |
| POST | `/workspaces/:workspaceId/projects` | workspace `ADMIN` — body `{ name, key, description? }`; `key` is `A-Z0-9`, 2-10 chars |
| GET | `/projects/:projectId` | project `VIEWER` |
| PATCH | `/projects/:projectId` | project `ADMIN` (works on archived projects) |
| DELETE | `/projects/:projectId` | project `ADMIN` — **archives**, does not delete |
| POST | `/projects/:projectId/restore` | project `ADMIN` |
| GET | `/projects/:projectId/members` | project `VIEWER` |
| POST | `/projects/:projectId/members` | project `ADMIN` — body `{ email, role }` |
| PATCH | `/projects/:projectId/members/:userId` | project `ADMIN` |
| DELETE | `/projects/:projectId/members/:userId` | project `ADMIN` |

`VIEWER` is a project-only role. Workspace `OWNER`/`ADMIN` inherit project
`ADMIN` without a `ProjectMember` row.

## Issues

| Method | Path | Required role |
| --- | --- | --- |
| GET | `/projects/:projectId/issues` | project `VIEWER` |
| POST | `/projects/:projectId/issues` | project `MEMBER` |
| GET | `/issues/:issueId` | project `VIEWER` |
| PATCH | `/issues/:issueId` | project `MEMBER` |
| PATCH | `/issues/:issueId/status` | project `MEMBER` |
| DELETE | `/issues/:issueId` | project `MEMBER` — soft delete |
| GET | `/issues/:issueId/activities` | project `VIEWER` — `?limit=` (default 50, max 100) |

List filters: `search` (title/description, case-insensitive), `status`,
`priority`, `labelIds` (comma-separated), `assigneeId` (or `unassigned`),
`sortBy` (`createdAt`, `updatedAt`, `dueDate`, `priority`, `status`),
`sortOrder` (`asc`/`desc`, default `desc`), `page`, `limit`.

**Workflow.** Status changes go through `PATCH /issues/:issueId/status`, never a
plain update. Only these transitions are accepted:

```
TODO → IN_PROGRESS → IN_REVIEW → DONE
                       ↓  ↑        │
                    IN_PROGRESS ←──┘
```

- `IN_REVIEW → IN_PROGRESS` (changes requested) and `DONE → IN_PROGRESS`
  (reopen) are allowed.
- Anything else returns 400.

**Field rules.** `assigneeId` must be a live member of the project (workspace
admins count); `labelIds` must belong to the same project. Both are validated
before the write. Every change writes an `ActivityLog` row in the same
transaction as the update.

## Comments

| Method | Path | Required role |
| --- | --- | --- |
| GET | `/issues/:issueId/comments` | project `VIEWER` — paginated, default 50 |
| POST | `/issues/:issueId/comments` | project `VIEWER` — a viewer may comment |
| PATCH | `/comments/:commentId` | project `VIEWER`, and the author or a project `ADMIN` |
| DELETE | `/comments/:commentId` | same as PATCH |

## Labels

| Method | Path | Required role |
| --- | --- | --- |
| GET | `/projects/:projectId/labels` | project `VIEWER` |
| POST | `/projects/:projectId/labels` | project `MEMBER` — `{ name, color }`, name unique per project |
| PATCH | `/labels/:labelId` | project `MEMBER` |
| DELETE | `/labels/:labelId` | project `ADMIN` |

## Health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{ status: "ok" }`; unauthenticated, used by container healthchecks |

## Walkthrough with curl

```bash
BASE=http://localhost:4000/api/v1
JAR=/tmp/devflow-cookies.txt

# 1. CSRF token (also stored in the jar as a cookie)
CSRF=$(curl -s -c "$JAR" "$BASE/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')

# 2. Sign in
curl -s -b "$JAR" -c "$JAR" -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"owner@devflow.test","password":"devflow123"}' \
  "$BASE/auth/login"

# 3. Read the caller's workspaces
curl -s -b "$JAR" "$BASE/workspaces"
```
