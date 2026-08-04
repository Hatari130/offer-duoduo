# API modules

The API is the only runtime allowed to access the production database or
platform-owned AI credentials.

- `auth`: identity and session verification
- `profiles`: private candidate profile data
- `applications`: private application records and timelines
- `opportunities`: public recruitment campaigns and job postings
- `sync`: extension offline-first synchronization
- `imports`: Feishu/official-site ingestion jobs

This application is intentionally a compile-checked boundary for now. Add the
HTTP runtime and database adapter here when backend implementation begins.
