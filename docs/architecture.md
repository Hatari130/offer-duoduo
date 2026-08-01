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
public/form-adapters.js Versioned Beisen/Moka/牛客/腾讯字段映射库
public/manifest.json  Extension manifest
public/content.js     Content script injected into recruiting pages
```

## Application Form Autofill

The profile workflow is intentionally split into a rule-first pipeline:

```text
Content Script scan
  -> resolve site adapter (Beisen / Moka / 牛客 / 腾讯 / generic)
  -> adapter + section-aware alias mapping (label, section, type, options)
  -> only unknown fields go to DeepSeek (metadata only; no profile values)
  -> immediately fill fields with a mapped, available local value
  -> skip missing/unknown fields and keep a per-field result report
  -> DOM read-back verification and per-field result report
```

`public/content.js` performs page-local DOM work. `src/ProfileView.tsx` owns the
result list and failed-field retry UI. `src/deepseek.ts` only resolves ambiguous
field semantics; it never submits the application. Missing profile values,
unsupported controls, and post-write mismatches are reported separately.

The mapping library uses canonical profile keys plus aliases and page sections.
The Nowcoder taxonomy is covered across basic information, job intention,
education, work, projects, campus experience, awards, languages, computer
skills, certificates, family, publications, patents, self-evaluation, hobbies,
portfolio and competitions. Repeated labels are disambiguated by the section:
for example, `开始时间` becomes an education, work, project or campus date, and
`职位` becomes a work title, project role, campus role or family position.
Aliases such as `籍贯 / 户籍 / 户口 / 生源地` and
`职位名称 / 职位 / 工作职位 / 岗位名称` are treated as the same semantic
family within their relevant section.

For Beisen Phoenix forms (for example `*.zhiye.com`), the scanner consumes the
platform's `data-nc-label` / `data-nc-cls` metadata and recognizes its custom
`phoenix-select`, `phoenix-radio-group`, and `phoenix-checkbox` controls. This
site-level metadata is used before calling DeepSeek, matching the same general
strategy as a maintained recruiting-site field mapping library.

Phoenix date fields are filled through the calendar's year/month/day panels
instead of assigning the hidden input text. Phoenix area fields use the
province/city selector and confirm action, so values such as 安徽 are handled
as a hierarchical selection rather than a flat option lookup.

`public/form-adapters.js` is the update boundary for the mapping library. Each
adapter has a stable id, host matcher, platform-specific aliases and a shared
version. New ATS labels should be added there first. Runtime overrides can be
stored under `offerflow.formMappingOverrides`; the content script loads them
before scanning, so a label fix does not require changing the fill engine.

The rule-first contract is explicit: a field with `source: "rules"` is never
sent to DeepSeek. This preserves the predictable behavior of a maintained ATS
mapping library while keeping the existing AI fallback for new or company-
specific questions.

Filling uses a direct DOM interaction path: the page scrolls the active control
into view, focuses it, triggers the control's click/input/change sequence, and
waits one paint frame before verifying the result. Custom Phoenix selects are
opened and their rendered options are clicked after the next frame. This keeps
the fast “browser is operating the page” effect without using remote browser
automation or submitting the application.

The fill loop is sequential and emits "OFFERFLOW_FILL_PROGRESS" after every
field. The side panel consumes these events to update the progress bar and
result row while the page is being filled. A small configurable inter-field
delay (currently 55 ms) makes scrolling, dropdown selection and verification
observable without turning the operation into slow human simulation.

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
