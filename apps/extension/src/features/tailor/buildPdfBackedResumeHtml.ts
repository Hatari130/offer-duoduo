import type { PersonalProfile } from "@offerflow/domain";
import type {
  ResumePdfFont,
  ResumePdfLayout,
  ResumePdfPageLayout,
  ResumePdfTextItem,
  ResumePdfVectorShape
} from "@/features/profile/resumeParser";
import type { JdAnalysis, ResumeData } from "./types";

const PX_PER_PT = 96 / 72;

export interface PdfBackedResumeOptions {
  layout: ResumePdfLayout;
  resume: ResumeData;
  sourceProfile: PersonalProfile;
  jd?: JdAnalysis;
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

export function buildPdfBackedResumeHtml({ layout, resume, sourceProfile, jd }: PdfBackedResumeOptions): string {
  if (!layout.pages.length) {
    throw new Error("原 PDF 没有可用页面，请重新导入正确的 PDF 母版");
  }
  const sourceCharacterCount = layout.characterCount ?? layout.pages.reduce(
    (total, page) => total + page.items.reduce((pageTotal, item) => pageTotal + [...item.text.trim()].length, 0),
    0
  );
  const idMap = buildIdMap(resume, jd);
  const overrides = buildOverrides(layout, resume, sourceProfile, idMap);
  const overrideMap = new Map(overrides.map((entry) => [entry.item.id, entry]));
  const pages = layout.pages.map((page) => {
    const patchImage = page.backgroundImageDataUrl || page.imageDataUrl;
    return `<section class="source-page" data-page="${page.page}" style="width:${px(page.widthPt)}px;height:${px(page.heightPt)}px;--patch-image:url(${escape(patchImage)});--patch-width:${px(page.widthPt)}px;--patch-height:${px(page.heightPt)}px">
      ${renderVectorLayer(page)}
      <img src="${escape(page.imageDataUrl)}" alt="原 PDF 第 ${page.page} 页的文字与图片" class="source-page-image">
      ${page.items.map((item) => renderTextItem(item, overrideMap.get(item.id), page)).join("")}
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
  <meta name="source-character-count" content="${sourceCharacterCount}">
  <meta name="source-font-count" content="${layout.fonts?.length || 0}">
  <meta name="source-vector-shape-count" content="${layout.pages.reduce((total, page) => total + (page.vectorShapes?.length || 0), 0)}">
  <meta name="tailored-override-count" content="${overrides.length}">
  <title>${escape(resume.targetCompany || "")}-${escape(resume.header.name || "定制简历")}</title>
  <style>${renderFontFaces(layout.fonts || [])}${renderCss(widthPt, heightPt)}</style>
</head>
<body>
  <header class="toolbar">
    <strong>原 PDF 转 HTML</strong>
    <span id="editor-status">${escape(mapNotice)}</span>
    <div class="toolbar-actions">
      <button id="tailor-edit-toggle" type="button">开始编辑</button>
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
    .document { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px; }
    .source-page { position: relative; flex: none; overflow: hidden; background: #fff; box-shadow: 0 12px 34px rgba(25, 35, 29, .12); page-break-after: always; }
    .source-page-vectors { position: absolute; inset: 0; display: block; width: 100%; height: 100%; z-index: 1; overflow: visible; pointer-events: none; }
    .source-page-image { position: absolute; inset: 0; display: block; width: 100%; height: 100%; z-index: 2; user-select: none; pointer-events: none; }
    .source-overlay { position: absolute; z-index: 3; display: block; overflow: visible; white-space: pre; color: transparent; line-height: 1; letter-spacing: 0; outline: none; transform: rotate(var(--text-rotation, 0deg)); transform-origin: 0 0; }
    .source-text { display: inline-block; transform: scaleX(var(--text-scale-x, 1)); transform-origin: 0 0; }
    .source-overlay.source-override, body.editing .source-overlay { color: var(--text-color, #111); background-image: var(--patch-image); background-size: var(--patch-width) var(--patch-height); background-position: var(--patch-x) var(--patch-y); background-repeat: no-repeat; }
    body:not(.editing) .source-overlay:not(.source-override) { pointer-events: none; }
    .source-overlay[data-active="true"] { box-shadow: 0 0 0 2px rgba(196, 147, 0, .5); }
    body.editing .source-overlay { cursor: text; outline: 1px dashed rgba(194, 150, 0, .72); }
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

function renderTextItem(item: ResumePdfTextItem, override: Override | undefined, page: ResumePdfPageLayout) {
  const text = override?.text ?? item.text;
  const width = px(item.width);
  const height = px(Math.max(item.height, item.fontSize + 2));
  const key = override?.key || `source.${item.id}`;
  const mapIds = override?.mapIds || "";
  const direction = item.direction === "rtl" ? "rtl" : "ltr";
  const weight = item.fontWeight === 700 ? 700 : 400;
  const fontStyle = item.fontStyle === "italic" ? "italic" : "normal";
  const fontStack = [item.fontFamily, item.fallbackFontFamily, "sans-serif"]
    .filter(Boolean)
    .map((family) => JSON.stringify(family))
    .join(",");
  const className = override ? "source-overlay source-override" : "source-overlay";
  return `<span class="${className}" data-edit-key="${escape(key)}" data-map-ids="${escape(mapIds)}" data-initial-override="${override ? "true" : "false"}" data-target-width="${width}" dir="${direction}" style="left:${px(item.x)}px;top:${px(item.top)}px;width:${width}px;min-height:${height}px;font-family:${fontStack};font-size:${px(item.fontSize)}px;font-weight:${weight};font-style:${fontStyle};--text-color:${escape(item.color || "#111111")};--text-rotation:${vectorNumber(item.rotation || 0)}deg;--patch-x:${signedPx(-item.x)}px;--patch-y:${signedPx(-item.top)}px"><span class="source-text">${escape(text)}</span></span>`;
}

function buildOverrides(
  layout: ResumePdfLayout,
  resume: ResumeData,
  source: PersonalProfile,
  idMap: Map<string, string>
): Override[] {
  const entries = layout.pages.flatMap((page) => page.items);
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
    const item = entries.find((candidate) => {
      if (candidate.text.includes(oldText)) return true;
      return normalizeMatchText(candidate.text) === normalizedOld;
    });
    if (!item) return;
    const current = overrides.get(item.id) || { item, text: item.text, key: `${key}.${sequence++}`, mapIds };
    current.text = current.text.includes(oldText)
      ? current.text.replace(oldText, newText)
      : newText;
    current.mapIds = [current.mapIds, mapIds].filter(Boolean).join(" ");
    overrides.set(item.id, current);
  };

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

function replaceDescription(
  oldValue: string | undefined,
  newValues: string[],
  key: string,
  mapIds: string,
  replaceValue: (oldValue: string | undefined, newValue: string | undefined, key: string, mapIds?: string) => void
) {
  const oldLines = String(oldValue || "").split(/\r?\n|[；;]|(?<=[。.!！?？])\s+/).map((line) => line.trim()).filter(Boolean);
  oldLines.forEach((line, index) => replaceValue(line, newValues[index] || newValues[0], `${key}.${index}`, mapIds));
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

function signedPx(value: number) {
  return (value * PX_PER_PT).toFixed(2);
}

function editorScript() {
  return `(() => {
    const nodes = [...document.querySelectorAll('[data-edit-key]')];
    const key = 'offerflow-pdf-backed:' + location.pathname;
    const originals = Object.fromEntries(nodes.map((node) => [node.dataset.editKey, node.innerHTML]));
    const initialOverrides = Object.fromEntries(nodes.map((node) => [node.dataset.editKey, node.dataset.initialOverride === 'true']));
    const status = document.getElementById('editor-status');
    const button = document.getElementById('tailor-edit-toggle');
    const measureCanvas = document.createElement('canvas');
    const measureContext = measureCanvas.getContext('2d');
    let editing = false;
    let timer = 0;
    const setStatus = (value) => { if (status) status.textContent = value; };
    const fitNode = (node) => {
      if (!measureContext) return;
      const targetWidth = Number(node.dataset.targetWidth || 0);
      if (!(targetWidth > 0)) return;
      const style = getComputedStyle(node);
      measureContext.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
      const measuredWidth = measureContext.measureText(node.textContent || '').width;
      const scale = measuredWidth > targetWidth && measuredWidth > 0 ? targetWidth / measuredWidth : 1;
      node.style.setProperty('--text-scale-x', String(Math.max(0.5, Math.min(1, scale))));
      node.dataset.overflow = measuredWidth * Math.max(0.5, scale) > targetWidth + 0.5 ? 'true' : 'false';
    };
    const refreshNode = (node) => {
      const nodeKey = node.dataset.editKey;
      const changed = node.innerHTML !== (originals[nodeKey] || '');
      node.classList.toggle('source-override', Boolean(initialOverrides[nodeKey] || changed));
      fitNode(node);
    };
    const fitAll = () => nodes.forEach(refreshNode);
    const save = () => {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(nodes.map((node) => [node.dataset.editKey, node.innerHTML]))));
      setStatus('改动已自动保存到此浏览器。');
    };
    const setEditing = (value) => {
      editing = value;
      document.body.classList.toggle('editing', value);
      nodes.forEach((node) => node.setAttribute('contenteditable', value ? 'true' : 'false'));
      if (button) button.textContent = value ? '完成编辑' : '开始编辑';
      setStatus(value ? '编辑已开启；改动会自动保存。' : '编辑已关闭。');
      requestAnimationFrame(fitAll);
    };
    button?.addEventListener('click', () => setEditing(!editing));
    document.getElementById('tailor-print')?.addEventListener('click', () => { setEditing(false); setTimeout(() => window.print(), 60); });
    document.getElementById('tailor-reset')?.addEventListener('click', () => {
      if (!confirm('恢复到当前 HTML 中的定制文字？')) return;
      localStorage.removeItem(key);
      nodes.forEach((node) => {
        node.innerHTML = originals[node.dataset.editKey] || '';
        refreshNode(node);
      });
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
    nodes.forEach((node) => node.addEventListener('input', () => {
      refreshNode(node);
      clearTimeout(timer);
      timer = setTimeout(save, 250);
    }));
    window.addEventListener('message', (event) => {
      const mapId = String(event.data?.mapId || '');
      if (event.data?.type !== 'OFFERFLOW_HIGHLIGHT_MAP' || !mapId) return;
      nodes.forEach((node) => { node.dataset.active = (node.dataset.mapIds || '').split(/\\s+/).includes(mapId) ? 'true' : 'false'; });
      setStatus(mapId + ' · 已高亮原 PDF 中的对应内容');
    });
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      nodes.forEach((node) => {
        if (saved?.[node.dataset.editKey] !== undefined) node.innerHTML = saved[node.dataset.editKey];
        refreshNode(node);
      });
    } catch {}
    document.fonts?.ready.then(fitAll).catch(() => fitAll());
    setEditing(false);
  })();`;
}
