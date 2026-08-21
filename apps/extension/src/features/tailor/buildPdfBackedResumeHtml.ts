import type { PersonalProfile } from "@offerflow/domain";
import type {
  ResumePdfFont,
  ResumePdfLayout,
  ResumePdfPageLayout,
  ResumePdfTextItem,
  ResumePdfVectorShape
} from "@/features/profile/resumeParser";
import type { JdAnalysis, PdfTailoringPatch, ResumeData } from "./types";
import { buildPdfEditableRegions, type PdfEditableBlock, type PdfEditableRegion } from "./pdfEditableBlocks.ts";
import { fitsPdfTailoringBudget } from "./pdfTailoringPatches.ts";

const PX_PER_PT = 96 / 72;

export interface PdfBackedResumeOptions {
  layout: ResumePdfLayout;
  resume: ResumeData;
  sourceProfile: PersonalProfile;
  jd?: JdAnalysis;
  pdfPatches?: PdfTailoringPatch[];
}

interface Override {
  item: ResumePdfTextItem;
  text: string;
  key: string;
  mapIds: string;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char] || char);

export function buildPdfBackedResumeHtml({ layout, resume, sourceProfile, jd, pdfPatches = [] }: PdfBackedResumeOptions): string {
  if (!layout.pages.length) {
    throw new Error("原 PDF 没有可用页面，请重新导入正确的 PDF 母版");
  }
  const sourceCharacterCount = layout.characterCount ?? layout.pages.reduce(
    (total, page) => total + page.items.reduce((pageTotal, item) => pageTotal + [...item.text.trim()].length, 0),
    0
  );
  const sourceFingerprint = layoutFingerprint(layout);
  const idMap = buildIdMap(resume, jd);
  const overrides = buildOverrides(layout, resume, sourceProfile, idMap, pdfPatches);
  const overrideMap = new Map(overrides.map((entry) => [entry.item.id, entry]));
  const fontMap = new Map(layout.fonts.map((font) => [font.id, font]));
  const fontCoverage = new Map<string, Set<string>>();
  layout.pages.forEach((page) => page.items.forEach((item) => {
    const coverage = fontCoverage.get(item.fontId) || new Set<string>();
    [...item.text].forEach((character) => coverage.add(character));
    fontCoverage.set(item.fontId, coverage);
  }));
  let editableBlockCount = 0;
  let editableRegionCount = 0;
  const pages = layout.pages.map((page) => {
    const regions = buildPdfEditableRegions(page);
    editableRegionCount += regions.length;
    editableBlockCount += regions.reduce((total, region) => total + region.blocks.length, 0);
    return `<section class="source-page" data-page="${page.page}" style="width:${px(page.widthPt)}px;height:${px(page.heightPt)}px">
      ${renderVectorLayer(page)}
      <img src="${escape(page.imageDataUrl)}" alt="原 PDF 第 ${page.page} 页的文字与图片" class="source-page-image">
      ${regions.map((region) => renderEditableRegion(region, page, overrideMap, fontMap, fontCoverage)).join("")}
    </section>`;
  }).join("");
  const firstPage = layout.pages[0];
  const widthPt = firstPage?.widthPt || 595;
  const heightPt = firstPage?.heightPt || 842;
  const mapNotice = sourceCharacterCount === 0
    ? "原 PDF 页面已完整保留；当前未提取到可编辑文字，仍可预览与保存。"
    : overrides.length
    ? `已从原 PDF 恢复 ${sourceCharacterCount} 个可编辑字符，并定制替换 ${overrides.length} 处内容。`
    : `已从原 PDF 恢复 ${sourceCharacterCount} 个可编辑字符；版式与图像按原坐标保留。`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="generator" content="offerflow-pdf-backed-tailor">
  <meta name="source-layout" content="pdf">
  <meta name="source-fingerprint" content="${sourceFingerprint}">
  <meta name="source-character-count" content="${sourceCharacterCount}">
  <meta name="source-text-item-count" content="${layout.pages.reduce((total, page) => total + page.items.length, 0)}">
  <meta name="source-font-count" content="${layout.fonts?.length || 0}">
  <meta name="source-vector-shape-count" content="${layout.pages.reduce((total, page) => total + (page.vectorShapes?.length || 0), 0)}">
  <meta name="tailored-override-count" content="${overrides.length}">
  <meta name="editable-block-count" content="${editableBlockCount}">
  <meta name="editable-region-count" content="${editableRegionCount}">
  <title>${escape(resume.targetCompany || "")}-${escape(resume.header.name || "定制简历")}</title>
  <style>${renderFontFaces(layout.fonts || [])}${renderCss(widthPt, heightPt)}</style>
</head>
<body>
  <header class="toolbar">
    <strong>原 PDF 转 HTML</strong>
    <span id="editor-status">${escape(mapNotice)}</span>
    <div class="toolbar-actions">
      <button id="tailor-edit-toggle" type="button" disabled>开始编辑</button>
      <button id="tailor-reset" type="button">恢复原版</button>
      <button id="tailor-save-html" type="button">保存 HTML</button>
      <button id="tailor-print" type="button">保存为 PDF</button>
    </div>
  </header>
  <main class="document">${pages}</main>
  <script>${editorScript()}</script>
</body>
</html>`;
}

function renderFontFaces(fonts: ResumePdfFont[]) {
  return fonts.map((font) => {
    const format = font.mimeType.includes("woff2")
      ? "woff2"
      : font.mimeType.includes("woff")
        ? "woff"
        : "opentype";
    return `@font-face{font-family:${JSON.stringify(font.family)};src:url(data:${font.mimeType};base64,${font.dataBase64}) format("${format}");font-weight:${font.fontWeight};font-style:${font.fontStyle};font-display:block;}`;
  }).join("");
}

function vectorNumber(value: number) {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0";
}

function layoutFingerprint(layout: ResumePdfLayout) {
  const source = layout.pages.map((page) => [
    page.page,
    page.widthPt,
    page.heightPt,
    page.imageDataUrl.length,
    page.imageDataUrl.slice(-96),
    page.items.map((item) => `${item.id}:${item.text}:${item.x.toFixed(2)}:${item.top.toFixed(2)}`).join("|")
  ].join("~")).join("||");
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function renderVectorShape(shape: ResumePdfVectorShape) {
  const dash = shape.dashArray.length
    ? ` stroke-dasharray="${shape.dashArray.map(vectorNumber).join(" ")}" stroke-dashoffset="${vectorNumber(shape.dashOffset)}"`
    : "";
  return `<path d="${escape(shape.d)}" fill="${escape(shape.fill)}" fill-rule="${shape.fillRule}" fill-opacity="${vectorNumber(shape.fillOpacity)}" stroke="${escape(shape.stroke)}" stroke-opacity="${vectorNumber(shape.strokeOpacity)}" stroke-width="${vectorNumber(shape.strokeWidth)}" stroke-linecap="${shape.lineCap}" stroke-linejoin="${shape.lineJoin}" stroke-miterlimit="${vectorNumber(shape.miterLimit)}"${dash}/>`;
}

function renderVectorLayer(page: ResumePdfPageLayout) {
  const shapes = page.vectorShapes || [];
  if (!shapes.length) return "";
  return `<svg class="source-page-vectors" viewBox="0 0 ${vectorNumber(page.widthPt)} ${vectorNumber(page.heightPt)}" preserveAspectRatio="none" aria-hidden="true">${shapes.map(renderVectorShape).join("")}</svg>`;
}

function renderCss(widthPt: number, heightPt: number) {
  return `
    @page { size: ${widthPt}pt ${heightPt}pt; margin: 0; }
    :root { --sheet-width: ${px(widthPt)}px; --sheet-height: ${px(heightPt)}px; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body { background: #edf0f2; color: #172019; font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 14px; min-height: 58px; padding: 10px 18px; background: #fff; border-bottom: 1px solid #dfe5e1; box-shadow: 0 2px 10px rgba(24, 38, 29, .06); }
    .toolbar strong { white-space: nowrap; font-size: 15px; }
    #editor-status { flex: 1; min-width: 0; color: #657168; font-size: 12px; }
    .toolbar-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
    .toolbar button { border: 1px solid #d2dbd5; border-radius: 8px; padding: 7px 10px; background: #fff; color: #24312a; cursor: pointer; font-size: 12px; }
    .toolbar button:hover { border-color: #748b7b; background: #f3f7f4; }
    .toolbar button:disabled { cursor: wait; opacity: .55; }
    .document { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px; }
    .source-page { position: relative; flex: none; overflow: hidden; background: #fff; box-shadow: 0 12px 34px rgba(25, 35, 29, .12); page-break-after: always; }
    .source-page-vectors { position: absolute; inset: 0; display: block; width: 100%; height: 100%; z-index: 1; overflow: visible; pointer-events: none; }
    .source-page-image { position: absolute; inset: 0; display: block; width: 100%; height: 100%; z-index: 2; user-select: none; pointer-events: none; }
    .edit-region { position: absolute; left: 0; z-index: 3; width: 100%; overflow: visible; pointer-events: none; }
    .source-eraser { position: absolute; z-index: 1; display: none; pointer-events: none; transform: rotate(var(--text-rotation, 0deg)); transform-origin: 0 0; }
    .source-overlay { position: absolute; z-index: 2; display: block; min-width: 1px; padding: 0; border: 0; margin: 0; overflow: visible; white-space: pre-wrap; overflow-wrap: anywhere; color: transparent; letter-spacing: 0; outline: none; transform: translateY(var(--flow-shift, 0px)) rotate(var(--text-rotation, 0deg)); transform-origin: 0 0; }
    .source-overlay > * { font: inherit; color: inherit; letter-spacing: inherit; }
    .source-eraser[data-repainted="true"] { display: block; }
    .source-overlay[data-repainted="true"] { color: var(--text-color, #111); }
    body.editing .edit-region { pointer-events: auto; }
    body.editing .source-overlay { pointer-events: auto; cursor: text; }
    body.editing .source-overlay:hover { box-shadow: 0 0 0 1px rgba(194, 150, 0, .46); }
    body.editing .source-overlay:focus { box-shadow: 0 0 0 2px rgba(196, 147, 0, .72); background: rgba(255, 249, 224, .16); }
    .source-overlay[data-active="true"] { box-shadow: 0 0 0 2px rgba(196, 147, 0, .62); }
    .source-overlay.uses-fallback-font { font-family: var(--fallback-font), sans-serif !important; }
    body.editing .edit-region[data-overflow="true"], .edit-region.is-modified[data-overflow="true"] { box-shadow: inset 0 -3px 0 #d14b3f; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .document { padding: 0; gap: 0; }
      .source-page { box-shadow: none; }
    }
    @media (max-width: 760px) {
      .toolbar { align-items: flex-start; flex-wrap: wrap; }
      #editor-status { flex-basis: 100%; order: 3; }
      .document { align-items: flex-start; overflow-x: auto; padding: 12px; }
    }
  `;
}

function cssFontStack(fontFamily: string, fallbackFontFamily: string) {
  return [fontFamily, fallbackFontFamily]
    .filter(Boolean)
    .map((family) => `'${String(family).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`)
    .concat("sans-serif")
    .join(",");
}

function applyBlockOverrides(
  block: PdfEditableBlock,
  page: ResumePdfPageLayout,
  overrideMap: Map<string, Override>
) {
  let text = block.text;
  const overrides = block.itemIds.map((id) => overrideMap.get(id)).filter((entry): entry is Override => Boolean(entry));
  overrides.forEach((override) => {
    text = override.text;
  });
  return {
    text,
    key: overrides[0]?.key || `source.${page.page}.${block.id}`,
    mapIds: [...new Set(overrides.flatMap((override) => override.mapIds.split(/\s+/)).filter(Boolean))].join(" "),
    initialOverride: overrides.length > 0
  };
}

function renderEditableBlock(
  block: PdfEditableBlock,
  region: PdfEditableRegion,
  page: ResumePdfPageLayout,
  overrideMap: Map<string, Override>,
  fontMap: Map<string, ResumePdfFont>,
  fontCoverage: Map<string, Set<string>>
) {
  const content = applyBlockOverrides(block, page, overrideMap);
  const direction = block.direction === "rtl" ? "rtl" : "ltr";
  const font = fontMap.get(block.fontId);
  const glyphs = [...(fontCoverage.get(block.fontId) || [])].join("");
  const fallbackFamily = block.fallbackFontFamily || font?.fallbackFamily || "sans-serif";
  const repaint = content.initialOverride ? "true" : "false";
  const itemMap = new Map(page.items.map((item) => [item.id, item]));
  const erasers = block.itemIds.map((itemId) => itemMap.get(itemId)).filter((item): item is ResumePdfTextItem => Boolean(item)).map((item) => {
    const xPadding = Math.min(.6, Math.max(.18, item.fontSize * .035));
    const yPadding = Math.min(.45, Math.max(.12, item.fontSize * .025));
    return `<i class="source-eraser" aria-hidden="true" data-eraser-for="${escape(block.id)}" data-repainted="${repaint}" style="left:${px(Math.max(0, item.x - xPadding))}px;top:${px(Math.max(0, item.top - region.top - yPadding))}px;width:${px(item.width + xPadding * 2)}px;height:${px(item.height + yPadding * 2)}px;background:${escape(item.backgroundColor || "#ffffff")};--text-rotation:${vectorNumber(item.rotation || 0)}deg"></i>`;
  }).join("");
  return `${erasers}<div class="source-overlay source-text" data-block-id="${escape(block.id)}" data-edit-key="${escape(content.key)}" data-map-ids="${escape(content.mapIds)}" data-initial-override="${content.initialOverride ? "true" : "false"}" data-repainted="${repaint}" data-font-subset="${font?.isSubset ? "true" : "false"}" data-source-glyphs="${escape(glyphs)}" data-base-top="${px(block.top - region.top)}" data-base-height="${px(block.height)}" data-base-x="${px(block.x)}" data-base-width="${px(block.width)}" dir="${direction}" style="left:${px(block.x)}px;top:${px(block.top - region.top)}px;width:${px(Math.max(block.width, block.fontSize * 1.5))}px;min-height:${px(Math.max(block.height, block.lineHeight))}px;font-family:${cssFontStack(block.fontFamily, fallbackFamily)};font-size:${px(block.fontSize)}px;font-weight:${block.fontWeight};font-style:${block.fontStyle};line-height:${px(block.lineHeight)}px;text-indent:${px(Math.max(0, block.textIndent))}px;--fallback-font:${cssFontStack(fallbackFamily, "")};--text-color:${escape(block.color || "#111111")};--text-rotation:${vectorNumber(block.rotation || 0)}deg">${escape(content.text)}</div>`;
}

function renderEditableRegion(
  region: PdfEditableRegion,
  page: ResumePdfPageLayout,
  overrideMap: Map<string, Override>,
  fontMap: Map<string, ResumePdfFont>,
  fontCoverage: Map<string, Set<string>>
) {
  const initialOverride = region.blocks.some((block) => block.itemIds.some((id) => overrideMap.has(id)));
  return `<section class="edit-region${initialOverride ? " is-modified" : ""}" data-region-id="${escape(region.id)}" data-initial-override="${initialOverride ? "true" : "false"}" style="top:${px(region.top)}px;height:${px(region.height)}px">${region.blocks.map((block) => renderEditableBlock(block, region, page, overrideMap, fontMap, fontCoverage)).join("")}</section>`;
}

function buildOverrides(
  layout: ResumePdfLayout,
  resume: ResumeData,
  source: PersonalProfile,
  idMap: Map<string, string>,
  pdfPatches: PdfTailoringPatch[]
): Override[] {
  const itemMap = new Map(layout.pages.flatMap((page) => page.items).map((item) => [item.id, item]));
  const blocks = layout.pages.flatMap((page) => buildPdfEditableRegions(page).flatMap((region) => region.blocks.map((block) => ({ page: page.page, block }))));
  const overrides = new Map<string, Override>();
  let sequence = 0;

  const replaceValue = (oldValue: string | undefined, newValue: string | undefined, key: string, mapIds = "") => {
    const oldText = String(oldValue || "").trim();
    const newText = String(newValue || "").trim();
    if (!oldText || !newText || oldText === newText) return;
    const oldLength = [...oldText].length;
    const newLength = [...newText].length;
    if (newLength < oldLength * 0.65 || newLength > oldLength * 1.35) return;
    const normalizedOld = normalizeMatchText(oldText);
    const target = blocks
      .filter((candidate) => normalizeMatchText(candidate.block.text).includes(normalizedOld))
      .sort((left, right) => normalizeMatchText(left.block.text).length - normalizeMatchText(right.block.text).length)[0];
    if (!target) return;
    const block = target.block;
    const item = itemMap.get(block.itemIds[0]);
    if (!item) return;
    const current = overrides.get(item.id) || { item, text: block.text, key: `${key}.${sequence++}`, mapIds };
    const replaced = replaceIgnoringWhitespace(current.text, oldText, newText);
    if (replaced === current.text) return;
    current.text = replaced;
    current.mapIds = [current.mapIds, mapIds].filter(Boolean).join(" ");
    overrides.set(item.id, current);
  };

  pdfPatches.forEach((patch, index) => {
    const target = blocks.find((candidate) => candidate.page === patch.page && candidate.block.id === patch.blockId);
    if (!target || normalizeMatchText(target.block.text) !== normalizeMatchText(patch.sourceText)) return;
    const item = itemMap.get(target.block.itemIds[0]);
    if (!item
      || normalizeMatchText(patch.tailoredText) === normalizeMatchText(target.block.text)
      || !fitsPdfTailoringBudget(target.block.text, patch.tailoredText)) return;
    overrides.set(item.id, {
      item,
      text: patch.tailoredText,
      key: `pdfPatch.${patch.page}.${patch.blockId}.${index}`,
      mapIds: patch.mapIds.join(" ")
    });
  });

  replaceValue(source.fullName, resume.header.name, "header.name");
  replaceValue(source.email, resume.header.email, "header.email");
  replaceValue(source.phone, resume.header.phone, "header.phone");
  replaceValue(source.currentCity, resume.header.city, "header.city");
  replaceValue(source.targetRole, resume.targetRole || resume.header.headline, "header.headline");

  source.education.forEach((oldItem, index) => {
    const next = resume.education[index];
    if (!next) return;
    replaceValue(oldItem.school, next.school, `education.${index}.school`);
    replaceValue(oldItem.major, next.major, `education.${index}.major`);
    replaceValue(oldItem.degree, next.degree, `education.${index}.degree`);
    replaceValue(oldItem.startDate, next.start, `education.${index}.start`);
    replaceValue(oldItem.endDate, next.end, `education.${index}.end`);
  });

  source.experiences.forEach((oldItem, index) => {
    const next = resume.experience[index];
    if (!next) return;
    const mapIds = idMap.get(next.id) || "";
    replaceValue(oldItem.organization, next.company, `experience.${index}.company`, mapIds);
    replaceValue(oldItem.title, next.title, `experience.${index}.title`, mapIds);
    replaceDescription(oldItem.description, next.bullets, `experience.${index}.description`, mapIds, replaceValue);
    replaceDescription(oldItem.achievements, next.bullets, `experience.${index}.achievements`, mapIds, replaceValue);
  });

  source.projects.forEach((oldItem, index) => {
    const next = resume.projects[index];
    if (!next) return;
    const mapIds = idMap.get(next.id) || "";
    replaceValue(oldItem.name, next.name, `project.${index}.name`, mapIds);
    replaceValue(oldItem.role, next.role, `project.${index}.role`, mapIds);
    replaceDescription(oldItem.description, [next.summary, ...next.bullets], `project.${index}.description`, mapIds, replaceValue);
    replaceDescription(oldItem.achievement, next.bullets, `project.${index}.achievement`, mapIds, replaceValue);
  });

  source.campusExperiences.forEach((oldItem, index) => {
    const next = resume.campus[index];
    if (!next) return;
    replaceValue(oldItem.type, next.type, `campus.${index}.type`);
    replaceValue(oldItem.role, next.role, `campus.${index}.role`);
    replaceValue(oldItem.description, next.description, `campus.${index}.description`);
  });

  source.awards.forEach((oldItem, index) => {
    const next = resume.awards[index];
    if (!next) return;
    replaceValue(oldItem.name, next.name, `award.${index}.name`);
    replaceValue(oldItem.level, next.level, `award.${index}.level`);
  });

  return [...overrides.values()];
}

function normalizeMatchText(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function replaceIgnoringWhitespace(source: string, search: string, replacement: string) {
  if (source.includes(search)) return source.replace(search, replacement);
  const normalizedSearch = normalizeMatchText(search);
  if (!normalizedSearch) return source;
  const normalizedCharacters: string[] = [];
  const sourceIndexes: number[] = [];
  Array.from(source).forEach((character, index) => {
    if (/\s/.test(character)) return;
    normalizedCharacters.push(character);
    sourceIndexes.push(index);
  });
  const matchIndex = normalizedCharacters.join("").indexOf(normalizedSearch);
  if (matchIndex < 0) return source;
  const start = sourceIndexes[matchIndex];
  const endIndex = sourceIndexes[matchIndex + [...normalizedSearch].length - 1];
  if (start === undefined || endIndex === undefined) return source;
  return `${source.slice(0, start)}${replacement}${source.slice(endIndex + 1)}`;
}

function replaceDescription(
  oldValue: string | undefined,
  newValues: string[],
  key: string,
  mapIds: string,
  replaceValue: (oldValue: string | undefined, newValue: string | undefined, key: string, mapIds?: string) => void
) {
  const oldLines = String(oldValue || "").split(/\r?\n|[；;]|(?<=[。.!！?？])\s+/).map((line) => line.trim()).filter(Boolean);
  oldLines.forEach((line, index) => replaceValue(line, newValues[index], `${key}.${index}`, mapIds));
}

function buildIdMap(resume: ResumeData, jd?: JdAnalysis) {
  const map = new Map<string, string>();
  if (!jd) return map;
  const ids = new Set([
    ...resume.education.map((item) => item.id),
    ...resume.experience.map((item) => item.id),
    ...resume.projects.map((item) => item.id),
    ...resume.campus.map((item) => item.id),
    ...resume.awards.map((item) => item.id)
  ]);
  jd.mappings.forEach((mapping) => mapping.resume_ids.forEach((id) => {
    const base = id.split(".")[0];
    if (!ids.has(base)) return;
    map.set(base, `${map.get(base) || ""} ${mapping.map_id}`.trim());
  }));
  return map;
}

function px(value: number) {
  return Math.max(0, value * PX_PER_PT).toFixed(2);
}

function editorScript() {
  return `(() => {
    const nodes = [...document.querySelectorAll('[data-edit-key]')];
    const regions = [...document.querySelectorAll('.edit-region')];
    const erasers = [...document.querySelectorAll('[data-eraser-for]')];
    const erasersByBlock = new Map();
    erasers.forEach((eraser) => {
      const blockId = eraser.dataset.eraserFor || '';
      const values = erasersByBlock.get(blockId) || [];
      values.push(eraser);
      erasersByBlock.set(blockId, values);
    });
    const signature = document.querySelector('meta[name="source-fingerprint"]')?.content || 'unknown';
    const key = 'offerflow-pdf-backed:v3:' + signature;
    const originals = Object.fromEntries(nodes.map((node) => [node.dataset.editKey, node.textContent || '']));
    const initialOverrides = Object.fromEntries(nodes.map((node) => [node.dataset.editKey, node.dataset.initialOverride === 'true']));
    const status = document.getElementById('editor-status');
    const button = document.getElementById('tailor-edit-toggle');
    let editing = false;
    let timer = 0;
    const setStatus = (value) => { if (status) status.textContent = value; };
    const number = (value) => Number(value || 0);
    const overlaps = (left, right) => {
      const leftStart = number(left.dataset.baseX);
      const rightStart = number(right.dataset.baseX);
      const leftWidth = number(left.dataset.baseWidth);
      const rightWidth = number(right.dataset.baseWidth);
      const overlap = Math.max(0, Math.min(leftStart + leftWidth, rightStart + rightWidth) - Math.max(leftStart, rightStart));
      return overlap / Math.max(1, Math.min(leftWidth, rightWidth)) >= .2;
    };
    const setRepainted = (node, value) => {
      const flag = value ? 'true' : 'false';
      node.dataset.repainted = flag;
      (erasersByBlock.get(node.dataset.blockId || '') || []).forEach((eraser) => { eraser.dataset.repainted = flag; });
    };
    const hasTextChange = (node) => initialOverrides[node.dataset.editKey]
      || (node.textContent || '') !== (originals[node.dataset.editKey] || '');
    const refreshRegion = (region, activeNode = null) => {
      const regionNodes = [...region.querySelectorAll('[data-edit-key]')];
      regionNodes.forEach((node) => {
        const shifted = Math.abs(Number.parseFloat(node.style.getPropertyValue('--flow-shift')) || 0) > .25;
        setRepainted(node, hasTextChange(node) || shifted || (editing && node === activeNode));
      });
      region.classList.toggle('is-modified', regionNodes.some(hasTextChange));
    };
    const refreshFont = (node) => {
      const sourceGlyphs = new Set([...(node.dataset.sourceGlyphs || '')]);
      const needsFallback = node.dataset.fontSubset === 'true' && [...(node.textContent || '')]
        .some((character) => !/[\s\u200b-\u200d\ufeff]/.test(character) && !sourceGlyphs.has(character));
      node.classList.toggle('uses-fallback-font', needsFallback);
      return needsFallback;
    };
    const fallbackCount = () => nodes.reduce((count, node) => count + (refreshFont(node) ? 1 : 0), 0);
    const reflowRegion = (region, activeNode = document.activeElement?.closest?.('[data-edit-key]') || null) => {
      const regionNodes = [...region.querySelectorAll('[data-edit-key]')].sort((left, right) => number(left.dataset.baseTop) - number(right.dataset.baseTop) || number(left.dataset.baseX) - number(right.dataset.baseX));
      const states = [];
      let overflow = false;
      const contentLimit = Math.max(region.clientHeight, number(region.dataset.baseContentBottom));
      regionNodes.forEach((node) => {
        const top = number(node.dataset.baseTop);
        const predecessor = [...states]
          .filter((state) => state.top < top - .5 && overlaps(state.node, node))
          .sort((left, right) => right.bottom - left.bottom)[0];
        const shift = predecessor ? predecessor.shift + predecessor.delta : 0;
        node.style.setProperty('--flow-shift', shift.toFixed(2) + 'px');
        const baseline = number(node.dataset.renderedBaseHeight) || Math.max(number(node.dataset.baseHeight), node.scrollHeight);
        const actual = Math.max(Number.parseFloat(getComputedStyle(node).lineHeight) || 1, node.scrollHeight);
        const delta = actual - baseline;
        const bottom = top + shift + actual;
        states.push({ node, top, bottom, shift, delta });
        if (bottom > contentLimit + 1) overflow = true;
      });
      region.dataset.overflow = overflow ? 'true' : 'false';
      refreshRegion(region, activeNode);
      return overflow;
    };
    const reflowAll = () => {
      let overflow = false;
      regions.forEach((region) => { overflow = reflowRegion(region) || overflow; });
      return overflow;
    };
    const activateNode = (node) => {
      const region = node?.closest?.('.edit-region');
      if (!region) return;
      regions.forEach((candidate) => {
        candidate.classList.toggle('is-active', candidate === region);
        refreshRegion(candidate, candidate === region ? node : null);
      });
      requestAnimationFrame(() => reflowRegion(region, node));
    };
    const save = () => {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(nodes.map((node) => [node.dataset.editKey, node.textContent || '']))));
      const count = fallbackCount();
      setStatus(count
        ? count + ' 个段落含原 PDF 子集字体没有的新字符，已整段切换为最接近的完整字体。'
        : '改动已自动保存到此浏览器。');
    };
    const setEditing = (value) => {
      editing = value;
      document.body.classList.toggle('editing', value);
      nodes.forEach((node) => node.setAttribute('contenteditable', value ? 'plaintext-only' : 'false'));
      if (!value) {
        document.activeElement?.blur?.();
        regions.forEach((region) => region.classList.remove('is-active'));
      }
      if (button) button.textContent = value ? '完成编辑' : '开始编辑';
      setStatus(value ? '编辑已开启；点击一个段落后直接修改，未改区域保持原 PDF。' : '编辑已关闭。');
      requestAnimationFrame(() => regions.forEach((region) => refreshRegion(region)));
    };
    button?.addEventListener('click', () => setEditing(!editing));
    document.getElementById('tailor-print')?.addEventListener('click', () => {
      setEditing(false);
      if (reflowAll()) { setStatus('有文字超出原版区域，请删减内容后再保存 PDF。'); return; }
      setTimeout(() => window.print(), 60);
    });
    document.getElementById('tailor-reset')?.addEventListener('click', () => {
      if (!confirm('恢复到当前 HTML 中的定制文字？')) return;
      localStorage.removeItem(key);
      nodes.forEach((node) => {
        node.textContent = originals[node.dataset.editKey] || '';
        node.style.minHeight = '';
        refreshFont(node);
      });
      nodes.forEach((node) => setRepainted(node, initialOverrides[node.dataset.editKey]));
      regions.forEach((region) => region.classList.toggle('is-modified', region.dataset.initialOverride === 'true'));
      reflowAll();
      setEditing(false);
      setStatus('已恢复当前 HTML 版本。');
    });
    document.getElementById('tailor-save-html')?.addEventListener('click', async () => {
      setEditing(false);
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('[contenteditable]').forEach((node) => node.setAttribute('contenteditable', 'false'));
      clone.querySelector('body')?.classList.remove('editing');
      const content = '<!doctype html>\\n' + clone.outerHTML;
      const name = (document.title || 'resume').replace(/[\\\\/:*?"<>|]/g, '-') + '.html';
      if ('showSaveFilePicker' in window) {
        const handle = await showSaveFilePicker({ suggestedName: name, types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] });
        const writable = await handle.createWritable(); await writable.write(content); await writable.close(); setStatus('HTML 已保存。');
      } else {
        const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: name }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('已开始下载编辑后的 HTML。');
      }
    });
    nodes.forEach((node) => {
      node.addEventListener('pointerdown', () => editing && activateNode(node));
      node.addEventListener('focus', () => editing && activateNode(node));
      node.addEventListener('paste', (event) => {
        if (!editing) return;
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || '');
      });
      node.addEventListener('input', () => {
        node.style.minHeight = getComputedStyle(node).lineHeight;
        refreshFont(node);
        reflowRegion(node.closest('.edit-region'));
        clearTimeout(timer);
        timer = setTimeout(save, 250);
      });
    });
    window.addEventListener('message', (event) => {
      const mapId = String(event.data?.mapId || '');
      if (event.data?.type !== 'OFFERFLOW_HIGHLIGHT_MAP' || !mapId) return;
      nodes.forEach((node) => {
        const active = (node.dataset.mapIds || '').split(/\\s+/).includes(mapId);
        node.dataset.active = active ? 'true' : 'false';
        if (active) activateNode(node);
      });
      setStatus(mapId + ' · 已高亮原 PDF 中的对应内容');
    });
    const initialize = async () => {
      try { await document.fonts?.ready; } catch {}
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // Measure reflow against the source PDF geometry, never against the
      // already-tailored DOM. Initial PDF patches are present before this
      // script starts; using scrollHeight here made their added height look
      // like the baseline, so following blocks stayed at their old positions
      // and the two paragraphs were painted on top of each other.
      nodes.forEach((node) => {
        const sourceHeight = Math.max(
          number(node.dataset.baseHeight),
          Number.parseFloat(getComputedStyle(node).lineHeight) || 1
        );
        node.dataset.renderedBaseHeight = String(sourceHeight);
      });
      regions.forEach((region) => {
        const bottom = Math.max(0, ...[...region.querySelectorAll('[data-edit-key]')].map((node) => number(node.dataset.baseTop) + number(node.dataset.renderedBaseHeight)));
        region.dataset.baseContentBottom = String(bottom);
      });
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        nodes.forEach((node) => {
          if (saved?.[node.dataset.editKey] !== undefined) node.textContent = String(saved[node.dataset.editKey]);
          refreshFont(node);
        });
      } catch {}
      regions.forEach(refreshRegion);
      if (nodes.some(hasTextChange)) reflowAll();
      setEditing(false);
      if (button) {
        button.disabled = nodes.length === 0;
        if (!nodes.length) button.title = '当前 PDF 未提取到可编辑文字';
      }
    };
    initialize();
  })();`;
}
