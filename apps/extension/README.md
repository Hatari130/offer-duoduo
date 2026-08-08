# OfferFlow browser extension

Chrome/Edge Manifest V3 application built with React, TypeScript and Vite.

## Entry points

- `dashboard.html`: full extension workspace
- `sidepanel.html`: side-panel/overlay UI
- `src/entries/ui/main.tsx`: React bootstrap
- `src/entries/background/index.ts`: service worker
- `src/infrastructure/sync`: offline outbox, revision metadata and cloud synchronization
- `public/content.js`: page content script
- `public/form-adapters.js`: ATS field mappings
- `public/manifest.json`: extension manifest

## Commands

From the repository root:

```powershell
pnpm dev:extension
pnpm build:extension
```

Load `apps/extension/dist` as an unpacked extension after building.

In the extension settings, use “登录 OfferFlow 并同步投递” for the normal flow.
It opens the Web login page and returns to the extension automatically. Existing
local applications are uploaded in batches after the first login. The one-time
pairing code remains available under the developer connection details.
Local application edits are coalesced into an idempotent outbox, uploaded in the
background every five minutes, and pulled back with a server cursor. Revision
conflicts preserve the local record and are shown in settings.

`public/opportunities.json` is currently retained as an offline/default feed. It
will become a generated fallback snapshot after the API opportunity catalogue is
implemented.
