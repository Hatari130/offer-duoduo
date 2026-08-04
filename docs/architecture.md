# OfferFlow architecture

## Goals

OfferFlow delivers two user-facing products: a website and a browser extension.
They share business language and server contracts, but they remain independently
buildable and deployable.

The architecture follows four rules:

1. applications own runtime-specific code;
2. packages contain reusable, runtime-neutral code;
3. the API is the only database and platform-secret boundary;
4. the extension remains local-first and can run before the website/backend exist.

## System boundary

```text
Official sites / Feishu / manual admin
                  |
                  v
              apps/api  <--------> PostgreSQL
               ^   ^
               |   |
       apps/web     extension background
                         ^       ^
                         |       |
                 extension UI   content scripts
                                      |
                               recruiting-page DOM
```

The website and extension use the same HTTP contracts. They never import one
another and never connect directly to PostgreSQL.

## Workspace ownership

### `apps/extension`

Owns all Chrome/Edge runtime behavior:

- `src/entries/ui`: React bootstrap shared by dashboard and side panel;
- `src/entries/background`: Manifest V3 service worker;
- `src/app`: extension shell and global extension styling;
- `src/features`: profile, opportunities and workspace user flows;
- `src/infrastructure`: Chrome storage and future message/API adapters;
- `src/integrations`: DeepSeek BYOK and Obsidian integration;
- `public`: manifest, content scripts and offline/static assets.

The extension is built independently into `apps/extension/dist`.

### `apps/web`

Reserved for the future website. The website may provide public pages, account
UI and cloud dashboards. It must use `@offerflow/api-client` for server data and
must not reuse extension screens wholesale.

### `apps/api`

Server-only boundary for:

- authentication and authorization;
- profiles and applications;
- opportunity catalogue queries;
- extension synchronization;
- Feishu/official-site imports;
- platform-owned AI requests;
- database transactions.

The HTTP runtime is intentionally undecided until backend implementation starts.
Keeping the package compile-checked now prevents browser/server responsibilities
from becoming mixed again.

### Shared packages

| Package | Owns | Must not own |
| --- | --- | --- |
| `@offerflow/domain` | applications, stages, profiles, opportunities and pure types | React, Chrome, storage, fetch |
| `@offerflow/contracts` | API DTOs and autofill/extraction message shapes | database queries or UI |
| `@offerflow/api-client` | authenticated typed HTTP calls | business state or database credentials |
| `@offerflow/ui` | stable design tokens and future primitives | complete product pages |
| `@offerflow/db` | SQL migrations and schema documentation | browser-importable runtime code |

## Extension runtime flow

```text
dashboard.html / sidepanel.html
           |
           v
src/entries/ui/main.tsx
           |
           v
src/app/App.tsx
   |       |        |
profile  opportunities  workspace views
   |       |        |
   +-------+--------+
           |
Chrome storage / background messages / integrations
           |
src/entries/background <----> public/content.js
                                  |
                           recruiting-page DOM
```

Content scripts only inspect and operate the current page. The background worker
owns tab coordination, background synchronization and cross-origin orchestration.
Extension UI components render state and issue commands.

## Application form autofill

Autofill remains rule-first:

```text
content script scan
  -> resolve site adapter (Beisen / Moka / Nowcoder / Tencent / generic)
  -> adapter and section-aware alias mapping
  -> send only unknown field metadata to DeepSeek
  -> fill values available in the local profile
  -> verify values by reading the DOM back
  -> return a per-field result report
```

`apps/extension/public/form-adapters.js` is the mapping-library update boundary.
`apps/extension/public/content.js` owns page-local DOM operations.
`apps/extension/src/features/profile/ProfileView.tsx` owns scan/fill results.
`apps/extension/src/integrations/deepseek/deepseek.ts` resolves ambiguous field
semantics and never submits an application.

## Data and synchronization

The extension is local-first:

- before login, `chrome.storage.local` is the source of truth;
- after login, local storage becomes an offline cache and queue;
- the API accepts versioned changes and returns a synchronization cursor;
- PostgreSQL is the long-term source of truth for authenticated users;
- the website reads the same cloud data through the API.

Every cloud-synchronized entity should carry `id`, `revision` and `updatedAt`.
Application records retain company/position/source snapshots even when their
catalogue job posting is later changed or removed.

See `docs/database.md` and `packages/db/migrations` for the concrete schema.

## Build and deployment boundaries

- root `pnpm build` checks shared packages/API and builds the extension;
- the extension store artifact comes from `apps/extension/dist`;
- the website will receive its own build only when implementation begins;
- API and website deployments can share infrastructure initially while retaining
  separate source boundaries;
- development, staging and production use separate databases and credentials.
