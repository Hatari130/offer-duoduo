# JobKoI Web

React/Vite companion website for JobKoI. It provides:

- account login and registration;
- a streaming career assistant with conversations, retry, stop, attachments and knowledge citations;
- an intentionally empty opportunity-import surface reserved for the external table pipeline;
- table and board views for personal applications;
- one-click browser-extension login and synchronization, with one-time pairing
  codes retained only as a developer fallback.

Run it with `pnpm dev:web` after starting `pnpm dev:api`. The default development
URLs are `http://127.0.0.1:5173` and `http://127.0.0.1:8787`.

The website may import `@offerflow/domain`, `@offerflow/contracts`,
`@offerflow/api-client` and `@offerflow/ui`. It must not import anything from
`apps/extension` or `packages/db`.
