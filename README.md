# OfferFlow

OfferFlow is a pnpm monorepo for a companion website, a Chrome/Edge Manifest V3
extension, a shared API boundary and a PostgreSQL data model.

## Current status

| Workspace | Status | Purpose |
| --- | --- | --- |
| `apps/extension` | runnable | Existing extension, dashboard, side panel, background worker and content scripts |
| `apps/web` | reserved | Website boundary; intentionally has no fake implementation or build yet |
| `apps/api` | compile-checked scaffold | Authentication, synchronization, imports and database access boundary |
| `packages/db` | initial schema | PostgreSQL migrations for recruitment and private application data |

## Repository shape

```text
apps/
  api/                server-only boundary
  extension/          browser extension
  web/                future website
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

Run the extension development server:

```powershell
pnpm dev
```

Type-check every implemented workspace:

```powershell
pnpm typecheck
```

Build every implemented workspace, including the production extension:

```powershell
pnpm build
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
