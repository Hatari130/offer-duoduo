import type { ResumePdfLayout } from "@/features/profile/resumeParser";

const PX_PER_PT = 96 / 72;
const px = (value: number) => `${Math.max(0, value * PX_PER_PT).toFixed(2)}px`;
const escape = (value: string) => value.replace(/[&<>"]/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
})[char] || char);

export function buildSourcePdfReferenceHtml(layout: ResumePdfLayout): string {
  const pages = layout.pages.map((page) => `
    <section class="source-page" style="width:${px(page.widthPt)};height:${px(page.heightPt)}">
      <img src="${escape(page.imageDataUrl)}" alt="原 PDF 第 ${page.page} 页">
    </section>`).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>原 PDF 对照</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body { background: #edf0f2; color: #26332b; font-family: Arial, "Microsoft YaHei", sans-serif; }
    .reference-note { position: sticky; top: 0; z-index: 2; padding: 12px 18px; border-bottom: 1px solid #dfe5e1; background: rgba(255,255,255,.96); color: #657168; font-size: 12px; }
    .reference-note strong { margin-inline-end: 8px; color: #26332b; font-size: 14px; }
    main { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px; }
    .source-page { flex: none; background: #fff; box-shadow: 0 12px 34px rgba(25,35,29,.12); }
    .source-page img { display: block; width: 100%; height: 100%; }
    @media print { .reference-note { display: none; } main { padding: 0; gap: 0; } .source-page { box-shadow: none; page-break-after: always; } }
  </style>
</head>
<body>
  <div class="reference-note"><strong>原 PDF 对照</strong>这里只用于核对版式与原始内容，不在此页面编辑。</div>
  <main>${pages}</main>
</body>
</html>`;
}
