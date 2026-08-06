# OfferFlow browser extension

Chrome/Edge Manifest V3 application built with React, TypeScript and Vite.

## Entry points

- `dashboard.html`: full extension workspace
- `sidepanel.html`: side-panel/overlay UI
- `src/entries/ui/main.tsx`: React bootstrap
- `src/entries/background/index.ts`: service worker
- `public/content.js`: page content script
- `public/form-adapters.js`: ATS field mappings
- `public/extraction-rules.js`: occupation/process lexicons and platform adapter rules
- `public/manifest.json`: extension manifest

## Page extraction

Application-progress extraction is structure-first:

1. `extraction-rules.js` classifies occupation, campaign, metadata and process text.
2. `content.js` finds a complete progress region, resolves one surrounding record card,
   and only accepts a position from outside that progress region.
3. Host adapters provide company defaults, preferred position selectors and application
   identifier rules for JD, Alibaba and Baidu; unknown hosts use the guarded generic adapter.
4. Low-confidence or process-like titles are left unselected or blank for user confirmation.

Regression fixtures cover the JD `AI面试`, Alibaba `简历投递`, and Baidu progress-page
examples. Run them with `pnpm --filter @offerflow/extension test:extraction`.

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
