# JobKoI browser extension

Chrome/Edge Manifest V3 application built with React, TypeScript and Vite.

## Entry points

- `dashboard.html`: full extension workspace
- `sidepanel.html`: 招聘网页内的悬浮工作台 UI
- `src/entries/ui/main.tsx`: React bootstrap
- `src/entries/background/index.ts`: service worker
- `src/infrastructure/sync`: offline outbox, revision metadata and cloud synchronization
- `public/content.js`: page content script
- `public/adapter-registry.js`: shared three-layer site/ATS routing registry
- `public/form-adapters.js`: ATS field mappings
- `public/manifest.json`: extension manifest

## Three-layer form rules

Job application pages are resolved once by `OfferFlowAdapterRegistry`; job
extraction and form filling consume the same route. Rules are merged in this
order, with the first matching field mapping winning:

1. archived company overlay (for example `duxiaoman`)
2. platform adapter (for example `feishu`, `beisen`, `moka`, `nowcoder`)
3. generic fallback

An unseen tenant on a known ATS inherits the platform adapter immediately. An
unknown site remains on the generic adapter. A company exception can be archived
without editing the scanner:

```js
await OfferFlowAdapterRegistry.saveOverrides({
  companies: {
    "example-campus": {
      hosts: ["^campus\\.example\\.com$"],
      basePlatformId: "feishu",
      formAdapterId: "feishu-career",
      mappings: [{ key: "referralCode", pattern: "内部候选码" }]
    }
  }
});
```

The structured overrides are stored under
`offerflow.adapterRegistryOverrides`. The previous
`offerflow.formMappingOverrides` platform mapping shape is still loaded for
backward compatibility. Final application submission is intentionally outside
the autofill rule system and is never clicked by these adapters.

## Commands

From the repository root:

```powershell
pnpm dev:extension
pnpm build:extension
```

Load `apps/extension/dist` as an unpacked extension after building.

In the extension settings, use “登录 JobKoI 并同步投递” for the normal flow.
It opens the Web login page and returns to the extension automatically. Existing
local applications are uploaded in batches after the first login. The one-time
pairing code remains available under the developer connection details.
Local application edits are coalesced into an idempotent outbox, uploaded in the
background every five minutes, and pulled back with a server cursor. Revision
conflicts preserve the local record and are shown in settings.

The "为当前岗位定制简历" action now creates a short-lived handoff and opens the
full JobKoI Web resume studio. Local development defaults to
`http://127.0.0.1:5173`; set `VITE_WEB_APP_URL` for a deployed Web origin. Only a
single-use code is placed in the URL—resume data and long-lived access tokens are
never included in the handoff link.

Campus opportunities are read from the shared public JSON endpoint configured in
`src/features/opportunities/opportunities.ts`. `public/opportunities.json` is
retained only as an offline development fixture.
