# JobKoI

JobKoI is a pnpm monorepo for a companion website, a Chrome/Edge Manifest V3
extension, a shared API boundary and a PostgreSQL data model.

## Current status

| Workspace | Status | Purpose |
| --- | --- | --- |
| `apps/web` | runnable | Login, career chat, opportunity shell, application management and device pairing |
| `apps/api` | runnable local runtime | Authentication, SSE chat, knowledge retrieval, applications and incremental sync |
| `apps/extension` | runnable | Capture/autofill workspace plus local-first Web synchronization |
| `packages/db` | migration-ready | PostgreSQL schema for auth, chat, knowledge, recruitment and private application data |

## Repository shape

```text
apps/
  api/                Node HTTP API and local in-memory repository
  extension/          browser extension
  web/                React/Vite companion website
packages/
  api-client/         typed HTTP client shared by web and extension
  contracts/          API and autofill message contracts
  db/                 PostgreSQL migrations (server-only)
  domain/             framework-free business types and rules
  ui/                 shared design primitives
docs/
  architecture.md
  database.md
```

## Development

Install all workspace dependencies:

```powershell
pnpm install
```

Run each application in a separate terminal:

```powershell
pnpm dev:api
pnpm dev:web
pnpm dev:extension
```

Type-check every implemented workspace:

```powershell
pnpm typecheck
```

Build every implemented workspace, including the production extension:

```powershell
pnpm build
```

Run contract, API end-to-end and synchronization conflict tests:

```powershell
pnpm test
```

After a successful build, load this directory as an unpacked Chrome/Edge
extension:

```text
apps/extension/dist
```

## Dependency rules

- `apps/web` and `apps/extension` may use domain, contracts, API client and UI packages.
- Browser applications never import `packages/db` or receive database credentials.
- Only `apps/api` may access the production database and platform-owned AI secrets.
- `packages/domain` stays independent of React, Chrome APIs, DOM APIs, storage and HTTP.
- Extension-only APIs remain under `apps/extension`.

See [docs/architecture.md](docs/architecture.md) for runtime boundaries and
[docs/database.md](docs/database.md) for data ownership.
