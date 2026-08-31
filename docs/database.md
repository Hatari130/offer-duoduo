# Database ownership

JobKoI uses PostgreSQL as the production cloud source of truth. Browser storage
is an extension offline cache, not a replacement for authenticated cloud data.

## Data groups

### Public recruitment catalogue

| Table | Purpose |
| --- | --- |
| `companies` | normalized company identity |
| `recruitment_campaigns` | spring/autumn/internship recruitment batches |
| `job_postings` | individual jobs belonging to an optional campaign |
| `opportunity_sources` | Public JSON, official site and manual sources |
| `opportunity_import_runs` | observable ingestion history |
| `opportunity_source_records` | source-row identity, payload hash and raw evidence |

### Private user data

| Table | Purpose |
| --- | --- |
| `users` | identity link to the chosen authentication provider |
| `auth_credentials` / `auth_sessions` | scrypt password material and hashed revocable sessions |
| `email_verification_codes` | HMAC-only, rate-limited and single-use email verification state |
| `profiles` | sensitive candidate profile document and revision |
| `applications` | private application state plus immutable job snapshots |
| `application_events` | assessment/interview/offer timeline |
| `sync_devices` | extension devices and acknowledged cursor |
| `sync_changes` | ordered incremental synchronization log |
| `conversations` / `messages` | private chat history and citations |
| `resume_versions` / `tailor_tasks` | versioned resume tailoring work |
| `interview_records` | private transcripts and extracted Q&A; no original audio |
| `consent_records` / `audit_logs` | policy acceptance and minimal security events |

### Operational data

`form_mapping_versions` stores published ATS mapping versions. Platform AI
credentials are environment secrets in `apps/api`; they are never persisted in
browser bundles or committed files.

## Source-of-truth rules

- `apps/extension/public/opportunities.json` is development/offline fallback data.
- Public JSON and official sites are import sources, not application runtime databases.
- PostgreSQL catalogue records become canonical after import and verification.
- user application data is always scoped by `user_id` at the API boundary.
- `job_posting_id` is nullable because a user may capture a job not yet in the catalogue.
- application snapshot fields preserve history when source records change.

## Migration policy

Migrations live in `packages/db/migrations` and are forward-only after deployment.
Create separate databases for local development, staging and production. Apply
migrations from the API deployment pipeline, never from the extension or website.
The API migration runner records each file atomically in `schema_migrations` and
uses a PostgreSQL advisory lock so concurrent deployments cannot race.
