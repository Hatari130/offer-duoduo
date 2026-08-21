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

The "为当前岗位定制简历" action now creates a short-lived handoff and opens the
full OfferFlow Web resume studio. Local development defaults to
`http://127.0.0.1:5173`; set `VITE_WEB_APP_URL` for a deployed Web origin. Only a
single-use code is placed in the URL—resume data and long-lived access tokens are
never included in the handoff link.

Campus opportunities are read from the shared public JSON endpoint configured in
`src/features/opportunities/opportunities.ts`. `public/opportunities.json` is
retained only as an offline development fixture.
