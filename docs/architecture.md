# Architecture

OfferDuoDuo is currently a browser-extension-first project.

## Current Shape

```text
dashboard.html        Full extension workspace entry
sidepanel.html        Browser side panel entry
src/main.tsx          React bootstrap for extension UI
src/App.tsx           Extension application shell and workflows
src/background.ts     Manifest V3 service worker
src/storage.ts        Local persistence adapters
src/opportunities.ts  External recruiting feed parser/cache
src/obsidian.ts       Obsidian Markdown integration
src/deepseek.ts       DeepSeek page understanding integration
public/manifest.json  Extension manifest
public/content.js     Content script injected into recruiting pages
```

## Removed Boundary

The previous standalone website and Sites deployment layer have been removed:

- no `src/web`
- no `index.html`
- no Sites worker
- no `.openai/hosting.json`
- no Open Graph preview assets
- no website deployment packaging step

## Future Web Boundary

If a companion website is rebuilt later, keep it separate from the extension:

```text
apps/
  extension/
  web/
packages/
  core/
  ui/
```

The website should depend on shared packages, not on extension entry files. The extension should remain buildable and testable without any website runtime.
