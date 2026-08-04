# OfferFlow browser extension

Chrome/Edge Manifest V3 application built with React, TypeScript and Vite.

## Entry points

- `dashboard.html`: full extension workspace
- `sidepanel.html`: side-panel/overlay UI
- `src/entries/ui/main.tsx`: React bootstrap
- `src/entries/background/index.ts`: service worker
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

`public/opportunities.json` is currently retained as an offline/default feed. It
will become a generated fallback snapshot after the API opportunity catalogue is
implemented.
