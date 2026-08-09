// Builds the printable, editable, JD-aware resume HTML.
//
// Design goals (vs the original tailor-resume shell):
//   * Single source of truth, no Python build step needed inside the
//     extension. We assemble the HTML directly from `ResumeData`.
//   * Modern, type-led hierarchy: bigger name, thin accent line, softer
//     section headers, clean hanging-indent bullets.
//   * Native support for CJK fonts, photo slot (data-url or remote), and
//     skill chips with rounded corners instead of the old `□` glyphs.
//   * Print stylesheet hides toolbar, removes shadows, forces exact page
//     geometry so Chrome's "Save as PDF" matches the visible layout.
//   * Each editable block carries a stable `data-edit-key` so the on-page
//     editor can autosave to localStorage and the JD mappings in
//     `data-map-ids` make the click-to-highlight review surface work.

import type {
  JdAnalysis,
  JdMapping,
  ResumeData,
  ResumeEducation,
  ResumeExperience,
  ResumeProject
} from "./types";
import type { PersonalProfile } from "@/shared/types";

export interface ResumeShellOptions {
  resume: ResumeData;
  jd?: JdAnalysis;
  pageSize?: "a4" | "letter";
  accentColor?: string;
  photoDataUrl?: string;
  showJdSidebar?: boolean;
  variant?: "modern" | "source-aligned";
  sourceProfile?: PersonalProfile;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

export function buildResumeHtml(options: ResumeShellOptions): string {
  const {
    resume,
    jd,
    pageSize = "a4",
    accentColor = "#1d4ed8",
    photoDataUrl,
    showJdSidebar = true,
    variant = "modern",
    sourceProfile
  } = options;
  const layout = pageGeometry(pageSize);
  const safeJd = jd || { source: "fallback", responsibility: [], must_haves: [], differentiators: [], bonus: [], keywords: [], mappings: [] };
  const idMap = buildIdMap(resume, safeJd);

  const css = renderCss({ layout, accentColor, variant });
  const toolbar = renderToolbar();
  const jdSidebar = showJdSidebar ? renderJdSidebar(safeJd) : "";
  const page = renderPage({
    resume,
    photoDataUrl,
    idMap,
    showSummary: variant !== "source-aligned" || Boolean(sourceProfile?.selfIntroduction || sourceProfile?.strengths),
    showTargetIntent: variant !== "source-aligned"
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="generator" content="offerflow-tailor">
  <title>${escape(resume.targetCompany || "")} · ${escape(resume.targetRole || "")} · ${escape(resume.header.name || "定制简历")}</title>
  <style>${css}</style>
</head>
<body class="surface ${variant}">
  ${toolbar}
  <div class="layout ${showJdSidebar ? "with-jd" : "no-jd"}">
    ${jdSidebar}
    <main class="page" id="resume" data-page-width-pt="${layout.widthPt}" data-page-height-pt="${layout.heightPt}">
      ${page}
    </main>
  </div>
  <script>${editorScript()}</script>
</body>
</html>`;
}

interface PageGeometry {
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  paddingTop: number;
  paddingBottom: number;
  paddingSide: number;
}

function pageGeometry(pageSize: "a4" | "letter"): PageGeometry {
  if (pageSize === "letter") {
    return {
      widthPx: 816,
      heightPx: 1056,
      widthPt: 612,
      heightPt: 792,
      paddingTop: 60,
      paddingBottom: 60,
      paddingSide: 64
    };
  }
  return {
    widthPx: 794,
    heightPx: 1123,
    widthPt: 595,
    heightPt: 842,
    paddingTop: 56,
    paddingBottom: 56,
    paddingSide: 60
  };
}

function renderCss({ layout, accentColor, variant }: { layout: PageGeometry; accentColor: string; variant: "modern" | "source-aligned" }) {
  return `
  @page { size: ${layout.widthPt}pt ${layout.heightPt}pt; margin: 0; }
  :root {
    --page-width: ${layout.widthPx}px;
    --page-height: ${layout.heightPx}px;
    --padding-top: ${layout.paddingTop}px;
    --padding-side: ${layout.paddingSide}px;
    --padding-bottom: ${layout.paddingBottom}px;
    --accent: ${accentColor};
    --ink: #0f172a;
    --muted: #475569;
    --line: #e2e8f0;
    --chip: #f1f5f9;
    --body-font: 10.5px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #f5f6f8;
    color: var(--ink);
    font-family: "Inter", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
    font-size: var(--body-font);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  .surface {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  .layout {
    display: flex;
    gap: 24px;
    padding: 32px 24px 80px;
    align-items: flex-start;
    justify-content: center;
  }
  .layout.with-jd { max-width: 1240px; margin: 0 auto; }
  .layout.no-jd .page { margin: 0 auto; }
  .jd-sidebar {
    flex: 0 0 320px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
    padding: 18px 18px 22px;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    position: sticky;
    top: 88px;
  }
  .jd-sidebar h2 {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .jd-sidebar .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background: var(--chip);
    color: var(--accent);
    font-size: 10px;
    font-weight: 600;
    border-radius: 999px;
    letter-spacing: 0.06em;
  }
  .jd-sidebar .panel-title {
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0 8px;
    color: var(--ink);
  }
  .jd-sidebar ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .jd-card {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
    cursor: pointer;
    transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
    background: #ffffff;
  }
  .jd-card[data-active="true"] {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
    background: rgba(37, 99, 235, 0.06);
  }
  .jd-card strong { display: block; font-size: 11px; color: var(--ink); margin-bottom: 3px; }
  .jd-card span { color: var(--muted); font-size: 10.5px; }
  .jd-card[data-active="true"] strong { color: var(--accent); }
  .jd-card .map-id {
    display: inline-block;
    font-size: 9.5px;
    font-family: "JetBrains Mono", "Menlo", monospace;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .jd-sidebar .keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .jd-sidebar .keywords span {
    background: var(--chip);
    color: var(--muted);
    font-size: 10px;
    padding: 3px 7px;
    border-radius: 999px;
  }
  .page {
    flex: 0 0 auto;
    width: var(--page-width);
    min-height: var(--page-height);
    background: #ffffff;
    padding: var(--padding-top) var(--padding-side) var(--padding-bottom);
    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.12);
    border-radius: 6px;
    color: var(--ink);
    overflow: visible;
    position: relative;
  }
  .page header {
    border-bottom: 0.5px solid var(--line);
    padding-bottom: 14px;
    margin-bottom: 16px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 18px;
    align-items: flex-end;
  }
  .page header .identity { display: flex; flex-direction: column; gap: 6px; }
  .page header h1 {
    margin: 0;
    font-size: 24px;
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .page header .headline {
    color: var(--accent);
    font-weight: 600;
    font-size: 12.5px;
    letter-spacing: 0.04em;
  }
  .page header .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    color: var(--muted);
    font-size: 11px;
  }
  .page header .meta-row .divider { color: #cbd5e1; }
  .page header .meta-row a {
    color: var(--accent);
    text-decoration: none;
  }
  .page header .meta-row a:hover { text-decoration: underline; }
  .page header .photo {
    width: 92px;
    height: 116px;
    object-fit: cover;
    border-radius: 6px;
    border: 0.5px solid var(--line);
  }
  .page section { margin: 0 0 14px; }
  .page section:last-child { margin-bottom: 0; }
  .page h2 {
    margin: 0 0 6px;
    padding-bottom: 4px;
    border-bottom: 1.5px solid var(--accent);
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--accent);
  }
  .summary {
    margin: 0;
    color: var(--ink);
    line-height: 1.6;
  }
  .entry {
    margin-bottom: 10px;
    page-break-inside: avoid;
  }
  .entry:last-child { margin-bottom: 0; }
  .entry-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: baseline;
    font-size: 11.5px;
    font-weight: 600;
  }
  .entry-head .role {
    display: block;
    font-size: 10px;
    color: var(--muted);
    margin-top: 2px;
    font-weight: 500;
  }
  .entry-head .date {
    font-size: 10.5px;
    color: var(--muted);
    font-weight: 500;
    white-space: nowrap;
  }
  .entry-head .label {
    color: var(--ink);
    font-weight: 700;
  }
  .bullets {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .bullets li {
    position: relative;
    padding-left: 14px;
    line-height: 1.55;
  }
  .bullets li::before {
    content: "";
    position: absolute;
    left: 4px;
    top: 0.6em;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.7;
  }
  .bullets li[data-active="true"] {
    background: rgba(37, 99, 235, 0.08);
    border-radius: 4px;
    transition: background .25s ease;
  }
  .skill-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px 10px;
  }
  .skill-group { display: flex; flex-direction: column; gap: 4px; }
  .skill-group .label {
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .skill-group .items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .skill-group .chip {
    background: var(--chip);
    color: var(--ink);
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10.5px;
  }
  .compact-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 0;
    padding: 0;
  }
  .compact-list li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    color: var(--ink);
    font-size: 11px;
  }
  .compact-list .meta { color: var(--muted); font-size: 10px; }
  .interests {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 12px 20px;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
  }
  .toolbar .title { font-weight: 700; font-size: 13px; letter-spacing: 0.02em; }
  .toolbar .subtitle { color: var(--muted); font-size: 11.5px; }
  .toolbar .actions { display: flex; gap: 6px; margin-left: auto; }
  .toolbar button {
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: var(--ink);
    border-radius: 8px;
    padding: 7px 12px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease, background-color .15s ease, filter .15s ease;
  }
  .toolbar button:hover { border-color: var(--accent); color: var(--accent); }
  .toolbar button.primary { background: var(--accent); border-color: var(--accent); color: #ffffff; }
  .toolbar button.primary:hover { filter: brightness(1.05); color: #ffffff; }
  .toolbar .status { color: var(--muted); font-size: 11px; margin-left: 8px; }
  body.editing [data-edit-key] { background: #fff8d5; outline: 1px dashed #d6a800; border-radius: 2px; }
  ${variant === "source-aligned" ? `
  body.source-aligned {
    --accent: #202421;
    --ink: #151816;
    --muted: #4f5752;
    --line: #cfd4d0;
    --chip: transparent;
    font-family: Arial, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
    line-height: 1.5;
  }
  .source-aligned .page {
    padding: 46px 52px 52px;
    border-radius: 0;
  }
  .source-aligned .page header {
    display: block;
    padding-bottom: 12px;
    margin-bottom: 13px;
    border-bottom: 1px solid var(--ink);
    text-align: center;
  }
  .source-aligned .page header .identity { align-items: center; gap: 5px; }
  .source-aligned .page header h1 { font-size: 22px; letter-spacing: .04em; }
  .source-aligned .page header .headline { color: var(--ink); font-size: 11px; letter-spacing: .02em; }
  .source-aligned .page header .meta-row { justify-content: center; color: #343a36; }
  .source-aligned .page section { margin-bottom: 12px; }
  .source-aligned .page h2 {
    margin-bottom: 7px;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--ink);
    color: var(--ink);
    font-size: 13px;
    letter-spacing: .02em;
    text-transform: none;
  }
  .source-aligned .entry { margin-bottom: 9px; }
  .source-aligned .entry-head { font-size: 11px; }
  .source-aligned .bullets { gap: 1px; margin-top: 3px; }
  .source-aligned .bullets li { padding-left: 13px; }
  .source-aligned .bullets li::before { left: 3px; width: 3px; height: 3px; background: var(--ink); opacity: 1; }
  .source-aligned .skill-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 4px 16px; }
  .source-aligned .skill-group .items { gap: 3px 10px; }
  .source-aligned .skill-group .chip { padding: 0; border-radius: 0; background: transparent; }
  ` : ""}
  @media print {
    html, body { background: #ffffff; }
    .layout { padding: 0; gap: 0; }
    .jd-sidebar { display: none; }
    .toolbar { display: none !important; }
    .page {
      box-shadow: none;
      border-radius: 0;
      margin: 0;
      width: var(--page-width);
      min-height: var(--page-height);
      height: auto;
    }
    body.editing [data-edit-key] { background: transparent; outline: none; }
    .bullets li[data-active="true"] { background: transparent; }
  }
  `;
}

function renderToolbar() {
  return `<aside class="toolbar" aria-label="简历编辑工具">
    <span class="title">流式编辑简历</span>
    <span class="subtitle">按完整段落编辑；增删文字会自动换行和重排。</span>
    <span class="status" id="editor-status">点击「开始编辑」后可直接修改完整字段和经历描述。</span>
    <span class="actions">
      <button type="button" id="tailor-edit-toggle" class="primary">开始编辑</button>
      <button type="button" id="tailor-save-html">保存 HTML</button>
      <button type="button" id="tailor-reset">恢复文件版本</button>
      <button type="button" id="tailor-print">保存为 PDF</button>
    </span>
  </aside>`;
}

function renderJdSidebar(jd: JdAnalysis) {
  const cards: string[] = [];
  const pushCards = (items: string[], category: JdMapping["category"], label: string) => {
    items.forEach((item, index) => {
      const mapping = jd.mappings.find((m) => m.text === item && m.category === category);
      const mapId = mapping?.map_id || `JD-${category.toUpperCase()}-${index + 1}`;
      cards.push(
        `<li class="jd-card" data-map-id="${escape(mapId)}">
          <span class="map-id">${escape(mapId)}</span>
          <strong>${escape(label)}</strong>
          <span>${escape(item)}</span>
        </li>`
      );
    });
  };
  pushCards(jd.responsibility, "responsibility", "工作职责");
  pushCards(jd.must_haves, "requirement", "硬性要求");
  pushCards(jd.differentiators, "differentiator", "加分项");
  pushCards(jd.bonus, "bonus", "额外优势");
  pushCards(jd.keywords, "keyword", "关键词");

  return `<aside class="jd-sidebar" aria-label="JD 映射">
    <h2>JD 映射</h2>
    <span class="eyebrow">${jd.source === "deepseek" ? "DeepSeek 定制" : "本地兜底"}</span>
    ${jd.responsibility.length
      ? `<p class="panel-title">工作职责</p><ul>${cards.filter((c) => c.includes("工作职责")).join("")}</ul>`
      : ""}
    ${jd.must_haves.length
      ? `<p class="panel-title">硬性要求</p><ul>${cards.filter((c) => c.includes("硬性要求")).join("")}</ul>`
      : ""}
    ${jd.differentiators.length
      ? `<p class="panel-title">加分项</p><ul>${cards.filter((c) => c.includes("加分项")).join("")}</ul>`
      : ""}
    ${jd.bonus.length
      ? `<p class="panel-title">额外优势</p><ul>${cards.filter((c) => c.includes("额外优势")).join("")}</ul>`
      : ""}
    ${jd.keywords.length
      ? `<p class="panel-title">关键词</p>
         <div class="keywords">${jd.keywords
           .map((keyword) => `<span data-map-id="${escape(`JD-KEYWORD-${keyword}`)}">${escape(keyword)}</span>`)
           .join("")}</div>`
      : ""}
    <p class="panel-title" style="margin-top:18px">点击 JD 卡片 · 高亮简历对应 bullet</p>
  </aside>`;
}

interface ResumeRenderArgs {
  resume: ResumeData;
  photoDataUrl?: string;
  idMap: Map<string, string>;
  showSummary: boolean;
  showTargetIntent: boolean;
}

function renderPage({ resume, photoDataUrl, idMap, showSummary, showTargetIntent }: ResumeRenderArgs) {
  const { header, summary } = resume;
  const headerHtml = `
    <header>
      <div class="identity">
        <h1 data-edit-key="header.name">${escape(header.name)}</h1>
        <span class="headline" data-edit-key="header.headline">${escape(resume.targetRole || header.headline)}</span>
        <div class="meta-row">
          ${header.email ? `<span data-edit-key="header.email">${escape(header.email)}</span>` : ""}
          ${header.email && header.phone ? '<span class="divider">·</span>' : ""}
          ${header.phone ? `<span data-edit-key="header.phone">${escape(header.phone)}</span>` : ""}
          ${(header.email || header.phone) && header.city ? '<span class="divider">·</span>' : ""}
          ${header.city ? `<span data-edit-key="header.city">${escape(header.city)}</span>` : ""}
          ${header.links
            .filter((link) => link.href)
            .map((link) => `<a href="${escape(link.href)}" data-edit-key="header.link.${escape(link.label)}">${escape(link.label)}</a>`)
            .join('<span class="divider">·</span>')}
        </div>
        ${showTargetIntent && resume.targetCompany ? `<div class="meta-row" style="margin-top:6px;"><strong style="color:var(--ink);font-size:11px;">意向：</strong><span data-edit-key="resume.targetCompany">${escape(resume.targetCompany)}</span><span class="divider">·</span><span data-edit-key="resume.targetRole">${escape(resume.targetRole)}</span></div>` : ""}
      </div>
      ${photoDataUrl ? `<img src="${escape(photoDataUrl)}" alt="证件照" class="photo" />` : ""}
    </header>
  `;

  const summaryHtml = showSummary && summary
    ? `<section>
        <h2>个人摘要</h2>
        <p class="summary" data-edit-key="resume.summary">${escape(summary)}</p>
      </section>`
    : "";

  const educationHtml = resume.education.length
    ? `<section>
        <h2>教育经历</h2>
        ${resume.education.map((item) => renderEducation(item, idMap)).join("")}
      </section>`
    : "";

  const experienceHtml = resume.experience.length
    ? `<section>
        <h2>实习 / 工作经历</h2>
        ${resume.experience.map((item) => renderExperience(item, idMap)).join("")}
      </section>`
    : "";

  const projectsHtml = resume.projects.length
    ? `<section>
        <h2>项目经历</h2>
        ${resume.projects.map((item) => renderProject(item, idMap)).join("")}
      </section>`
    : "";

  const campusHtml = resume.campus.length
    ? `<section>
        <h2>在校经历</h2>
        <div class="compact-list">
          ${resume.campus
            .map(
              (item) => `<li>
                <span><strong data-edit-key="campus.${escape(item.id)}.role">${escape(item.type)} · ${escape(item.role)}</strong>
                  <small style="display:block;color:var(--muted);font-size:10.5px;" data-edit-key="campus.${escape(item.id)}.description">${escape(item.description)}</small>
                </span>
                <span class="meta" data-edit-key="campus.${escape(item.id)}.date">${escape(formatRange(item.start, item.end))}</span>
              </li>`
            )
            .join("")}
        </div>
      </section>`
    : "";

  const awardsHtml = resume.awards.length
    ? `<section>
        <h2>获奖情况</h2>
        <div class="compact-list">
          ${resume.awards
            .map(
              (item) => `<li>
                <span><strong data-edit-key="award.${escape(item.id)}.name">${escape(item.name)}</strong>${item.level ? `<small style="color:var(--muted);">${escape(item.level)}</small>` : ""}</span>
                <span class="meta" data-edit-key="award.${escape(item.id)}.date">${escape(item.date)}</span>
              </li>`
            )
            .join("")}
        </div>
      </section>`
    : "";

  const skillsHtml = resume.skills.length
    ? `<section>
        <h2>技能 / 证书</h2>
        <div class="skill-grid">
          ${resume.skills
            .map(
              (group) => `<div class="skill-group">
                <span class="label">${escape(group.label)}</span>
                <span class="items">${group.items
                  .map((item) => `<span class="chip" data-edit-key="skill.${escape(group.id)}.${escape(item)}">${escape(item)}</span>`)
                  .join("")}</span>
              </div>`
            )
            .join("")}
        </div>
      </section>`
    : "";

  const languagesHtml = resume.languages.length
    ? `<section>
        <h2>语言</h2>
        <div class="compact-list">
          ${resume.languages
            .map(
              (item) => `<li>
                <span><strong data-edit-key="language.${escape(item.id)}.name">${escape(item.name)}</strong></span>
                <span class="meta" data-edit-key="language.${escape(item.id)}.level">${escape(item.level)}</span>
              </li>`
            )
            .join("")}
        </div>
      </section>`
    : "";

  const publicationsHtml = resume.publications.length
    ? `<section>
        <h2>论文 / 专利</h2>
        <div class="compact-list">
          ${resume.publications
            .map(
              (item) => `<li>
                <span><strong data-edit-key="publication.${escape(item.id)}.title">${escape(item.title)}</strong>${item.venue ? `<small style="color:var(--muted);"> · ${escape(item.venue)}</small>` : ""}</span>
                <span class="meta" data-edit-key="publication.${escape(item.id)}.date">${escape(item.date)}</span>
              </li>`
            )
            .join("")}
        </div>
      </section>`
    : "";

  const interestsHtml = resume.interests.length
    ? `<section>
        <h2>兴趣爱好</h2>
        <p class="interests" data-edit-key="resume.interests">${escape(resume.interests.join(" · "))}</p>
      </section>`
    : "";

  return [headerHtml, summaryHtml, educationHtml, experienceHtml, projectsHtml, campusHtml, awardsHtml, skillsHtml, languagesHtml, publicationsHtml, interestsHtml]
    .filter(Boolean)
    .join("\n");
}

function renderEducation(item: ResumeEducation, idMap: Map<string, string>) {
  const title = `${item.school}${item.major ? ` · ${item.major}` : ""}`;
  const range = formatRange(item.start, item.end);
  const mapIds = idMap.get(item.id) || "";
  return `<div class="entry" data-resume-id="${escape(item.id)}" data-map-ids="${escape(mapIds)}">
    <div class="entry-head">
      <div>
        <span class="label" data-edit-key="edu.${escape(item.id)}.label">${escape(title)}</span>
        <span class="role" data-edit-key="edu.${escape(item.id)}.degree">${escape([item.degree, item.gpa ? `GPA ${item.gpa}` : "", item.rank].filter(Boolean).join(" · "))}</span>
      </div>
      <span class="date" data-edit-key="edu.${escape(item.id)}.date">${escape(range)}</span>
    </div>
    ${item.highlights.length
      ? `<ul class="bullets">${item.highlights
          .map(
            (bullet, index) =>
              `<li data-edit-key="edu.${escape(item.id)}.highlight.${index}" data-resume-id="${escape(item.id)}.highlight-${index}" data-map-ids="${escape(mapIds)}">${escape(bullet)}</li>`
          )
          .join("")}</ul>`
      : ""}
    ${item.courses ? `<p style="margin:4px 0 0;color:var(--muted);font-size:10.5px;" data-edit-key="edu.${escape(item.id)}.courses">主修课程：${escape(item.courses)}</p>` : ""}
  </div>`;
}

function renderExperience(item: ResumeExperience, idMap: Map<string, string>) {
  const range = formatRange(item.start, item.end);
  const mapIds = idMap.get(item.id) || "";
  return `<div class="entry" data-resume-id="${escape(item.id)}" data-map-ids="${escape(mapIds)}">
    <div class="entry-head">
      <div>
        <span class="label" data-edit-key="exp.${escape(item.id)}.company">${escape(item.company)}</span>
        <span class="role" data-edit-key="exp.${escape(item.id)}.title">${escape(item.title)}${item.location ? ` · ${escape(item.location)}` : ""}</span>
      </div>
      <span class="date" data-edit-key="exp.${escape(item.id)}.date">${escape(range)}</span>
    </div>
    ${item.bullets.length
      ? `<ul class="bullets">${item.bullets
          .map(
            (bullet, index) =>
              `<li data-edit-key="exp.${escape(item.id)}.bullet.${index}" data-resume-id="${escape(item.id)}.bullet-${index}" data-map-ids="${escape(mapIds)}">${escape(bullet)}</li>`
          )
          .join("")}</ul>`
      : ""}
  </div>`;
}

function renderProject(item: ResumeProject, idMap: Map<string, string>) {
  const range = formatRange(item.start, item.end);
  const mapIds = idMap.get(item.id) || "";
  return `<div class="entry" data-resume-id="${escape(item.id)}" data-map-ids="${escape(mapIds)}">
    <div class="entry-head">
      <div>
        <span class="label" data-edit-key="project.${escape(item.id)}.name">${escape(item.name)}</span>
        <span class="role" data-edit-key="project.${escape(item.id)}.role">${escape(item.role)}${item.link ? ` · ${escape(item.link)}` : ""}</span>
        ${item.summary ? `<p style="margin:4px 0 0;color:var(--muted);font-size:10.5px;" data-edit-key="project.${escape(item.id)}.summary">${escape(item.summary)}</p>` : ""}
      </div>
      <span class="date" data-edit-key="project.${escape(item.id)}.date">${escape(range)}</span>
    </div>
    ${item.bullets.length
      ? `<ul class="bullets">${item.bullets
          .map(
            (bullet, index) =>
              `<li data-edit-key="project.${escape(item.id)}.bullet.${index}" data-resume-id="${escape(item.id)}.bullet-${index}" data-map-ids="${escape(mapIds)}">${escape(bullet)}</li>`
          )
          .join("")}</ul>`
      : ""}
  </div>`;
}

function formatRange(start: string, end: string) {
  if (!start && !end) return "";
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

function buildIdMap(resume: ResumeData, jd: JdAnalysis) {
  const map = new Map<string, string>();
  const allResumeIds = [
    ...resume.experience.map((item) => item.id),
    ...resume.projects.map((item) => item.id),
    ...resume.education.map((item) => item.id)
  ];
  jd.mappings.forEach((mapping) => {
    mapping.resume_ids.forEach((resumeId) => {
      if (!allResumeIds.includes(resumeId.split(".")[0])) return;
      const current = map.get(resumeId.split(".")[0]) || "";
      map.set(resumeId.split(".")[0], `${current} ${mapping.map_id}`.trim());
    });
  });
  return map;
}

function editorScript() {
  return `(() => {
    const nodes = [...document.querySelectorAll('[data-edit-key]')];
    const storageKey = 'offerflow-tailor:' + document.title;
    const originals = Object.fromEntries(nodes.map((node) => [node.dataset.editKey, node.innerHTML]));
    const status = document.getElementById('editor-status');
    const editButton = document.getElementById('tailor-edit-toggle');
    let editing = false;
    let saveTimer = 0;

    const setStatus = (msg) => { status.textContent = msg; };
    const snapshot = () => Object.fromEntries(nodes.map((node) => [node.dataset.editKey, node.innerHTML]));
    const persist = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(snapshot()));
        setStatus('草稿已自动保存到此浏览器。');
      } catch (error) {
        setStatus('草稿保存失败：' + error.message);
      }
    };
    const restoreDraft = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (!saved) return false;
        let restored = 0;
        nodes.forEach((node) => {
          if (saved[node.dataset.editKey] !== undefined) {
            node.innerHTML = saved[node.dataset.editKey];
            restored += 1;
          }
        });
        setStatus(restored ? '已恢复此浏览器中的本地草稿。' : '');
        return restored > 0;
      } catch (error) {
        setStatus('本地草稿读取失败：' + error.message);
        return false;
      }
    };
    const setEditing = (enabled) => {
      editing = enabled;
      document.body.classList.toggle('editing', enabled);
      nodes.forEach((node) => node.setAttribute('contenteditable', enabled ? 'true' : 'false'));
      editButton.textContent = enabled ? '完成编辑' : '开始编辑';
      setStatus(enabled ? '编辑已开启 · 改动会自动保存。' : '编辑已关闭 · 点击「保存为 PDF」导出。');
    };

    editButton.addEventListener('click', () => setEditing(!editing));
    document.getElementById('tailor-print').addEventListener('click', () => {
      setEditing(false);
      setTimeout(() => window.print(), 60);
    });
    document.getElementById('tailor-reset').addEventListener('click', () => {
      if (!confirm('恢复到当前 HTML 文件中的文字？浏览器本地草稿会被删除。')) return;
      localStorage.removeItem(storageKey);
      nodes.forEach((node) => { node.innerHTML = originals[node.dataset.editKey] || ''; });
      setEditing(false);
      setStatus('已恢复文件版本。');
    });
    document.getElementById('tailor-save-html').addEventListener('click', async () => {
      setEditing(false);
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('[contenteditable]').forEach((node) => node.setAttribute('contenteditable', 'false'));
      clone.querySelector('body').classList.remove('editing');
      const content = '<!doctype html>\\n' + clone.outerHTML;
      const suggested = (document.title || 'resume').replace(/[\\\\/:*?"<>|]/g, '-') + '.html';
      try {
        if ('showSaveFilePicker' in window) {
          const handle = await showSaveFilePicker({ suggestedName: suggested, types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] });
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          setStatus('HTML 已保存。');
        } else {
          const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
          const link = Object.assign(document.createElement('a'), { href: url, download: suggested });
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setStatus('浏览器已开始下载编辑后的 HTML。');
        }
      } catch (error) {
        if (error && error.name !== 'AbortError') setStatus('保存失败：' + error.message);
      }
    });
    nodes.forEach((node) => node.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 250);
    }));

    // JD → Resume cross-highlight
    const cards = [...document.querySelectorAll('.jd-card, .jd-sidebar .keywords span')];
    const bullets = [...document.querySelectorAll('.bullets li[data-resume-id]')];
    const highlightMap = (mapId) => {
      if (!mapId) return;
      cards.forEach((other) => other.dataset.active = 'false');
      cards
        .filter((card) => card.dataset.mapId === mapId)
        .forEach((card) => card.dataset.active = 'true');
      bullets.forEach((bullet) => {
        const ids = bullet.dataset.mapIds || bullet.closest('.entry')?.dataset.mapIds || '';
        bullet.dataset.active = ids.split(/\\s+/).includes(mapId) ? 'true' : 'false';
      });
      setStatus(mapId + ' · 已高亮映射 bullet');
    };
    cards.forEach((card) => {
      const mapId = card.dataset.mapId;
      if (!mapId) return;
      card.addEventListener('click', () => highlightMap(mapId));
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'OFFERFLOW_HIGHLIGHT_MAP') highlightMap(String(event.data.mapId || ''));
    });

    restoreDraft();
    setEditing(false);
  })();`;
}
