# OfferFlow API

Server boundary shared by the website and browser extension. It owns database
access, authentication, synchronization, opportunity imports and platform AI
requests. The local runtime uses Node's HTTP server and an in-memory repository,
so `pnpm --filter @offerflow/api dev` starts a complete development API without
external services. The repository boundary is ready for the PostgreSQL schema
in `packages/db` when deployment infrastructure is connected.

Without `AI_API_KEY`, chat uses a deterministic career-assistant provider and
still streams SSE for local development and tests. Configure an OpenAI-compatible
endpoint through `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY` to use a real model.

Development demo account: `demo@offerflow.cn` / `offerflow2026`.

Database migrations live in `packages/db`. Browser code must never import that
package or receive `DATABASE_URL`.
