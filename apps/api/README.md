# JobKoI API

Server boundary shared by the website and browser extension. It owns database
access, authentication, synchronization, opportunity imports and platform AI
requests. With `DATABASE_URL`, the runtime uses the PostgreSQL store and refuses
to start before all migrations are present. Without it, development and tests can
use the file-backed `MemoryStore`; production configuration explicitly rejects
that fallback.

Without `AI_API_KEY`, chat uses a deterministic career-assistant provider and
still streams SSE for local development and tests. Configure an OpenAI-compatible
endpoint through `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY` to use a real model.
The resume studio also uses this server-side provider for evidence-grounded,
field-level tailoring proposals. It never asks the model to generate resume HTML.
Without an API key, manual editing, autosave and PDF export remain available,
while the AI-tailoring action shows a configuration message.

Development demo account: `demo@offerflow.cn` / `offerflow2026`.

Database migrations live in `packages/db`. Browser code must never import that
package or receive `DATABASE_URL`.

Run `pnpm --filter @offerflow/api db:migrate` before a PostgreSQL start. See
`docs/production-security.md` for legacy-state import and deployment steps.

Interview audio transcription defaults to the free, unofficial BcutASR adapter
(`INTERVIEW_ASR_PROVIDER=bcut`) and requires `ffmpeg` plus `ffprobe` on the API
host. Set the provider to `disabled` to prevent third-party audio processing.
Uploaded audio is kept only in a temporary transcription workspace and removed
after success or failure; only the private transcript and extracted Q&A are
persisted and made available to that user's chat retrieval context.
