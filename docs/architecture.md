# JobKoI architecture

## Goals

JobKoI delivers two user-facing products: a website and a browser extension.
They share business language and server contracts, but they remain independently
buildable and deployable.

The architecture follows four rules:

1. applications own runtime-specific code;
2. packages contain reusable, runtime-neutral code;
3. the API is the only database and platform-secret boundary;
4. the extension remains local-first and can run before the website/backend exist.

## System boundary

```text
Public JSON / official sites / manual admin
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
- `src/integrations`: DeepSeek BYOK and external service integrations;
- `public`: manifest, content scripts and offline/static assets.

The extension is built independently into `apps/extension/dist`.

### `apps/web`

Owns the account experience and the three primary product areas:

- `/app/chat`: conversation list, knowledge-grounded SSE chat, retry and attachments;
- `/app/opportunities`: filter/table shell and empty import boundary for the collaborator-owned pipeline;
- `/app/applications`: application CRUD, table/board views and revision-aware updates;
- `/app/settings`: account controls and connected-device management.

The Web UI calls the API only through `@offerflow/api-client`; it does not import
extension screens or database code.

### `apps/api`

Server-only boundary for:

- authentication and authorization;
- profiles and applications;
- opportunity catalogue queries;
- extension synchronization;
- public JSON/official-site imports;
- platform-owned AI requests;
- database transactions.

The Node HTTP runtime selects PostgreSQL whenever `DATABASE_URL` is present.
The file-backed memory repository exists only for local development and tests;
production startup validation rejects it.
Chat uses deterministic SSE locally and an OpenAI-compatible server-side model
when the corresponding environment variables are configured.

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

The concrete application synchronization cycle is:

```text
local save -> coalesced outbox(changeId + baseRevision)
           -> POST /v1/applications/sync
           -> accepted ids + conflicts + cursor-based remote changes
           -> update local cache and revision metadata
```

`changeId` makes retries idempotent. A stale `baseRevision` produces an explicit
conflict; server data is not silently overwritten, and an old device cannot
resurrect a server tombstone.

See `docs/database.md` and `packages/db/migrations` for the concrete schema.

## Build and deployment boundaries

- root `pnpm build` checks shared packages/API and builds both Web and extension;
- the extension store artifact comes from `apps/extension/dist`;
- the website artifact comes from `apps/web/dist`;
- API and website deployments can share infrastructure initially while retaining
  separate source boundaries;
- development, staging and production use separate databases and credentials.
