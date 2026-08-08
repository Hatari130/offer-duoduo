# OfferFlow database

PostgreSQL schema and forward-only migrations for public recruitment data and
private user application data.

Ownership rules:

- only `apps/api` can execute queries against the production database;
- `apps/web` and `apps/extension` use the HTTP API;
- `public/opportunities.json` is a seed/offline snapshot, not the source of truth;
- migrations are ordered, immutable after deployment and reviewed with API changes.

The initial migration intentionally supports applications that do not map to a
known job posting by keeping `job_posting_id` nullable and storing immutable
company/position/source snapshots on each application.

`0002_chat_auth_sync.sql` adds self-hosted credentials, device pairing,
conversation persistence, knowledge documents/chunks, citations and idempotent
extension synchronization. The first knowledge implementation uses PostgreSQL
full-text search so the base schema has no external extension requirement; the
API retrieval boundary can later move to pgvector without changing Web contracts.
