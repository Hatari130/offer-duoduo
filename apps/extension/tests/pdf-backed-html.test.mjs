import assert from "node:assert/strict";
import test from "node:test";

import { buildPdfBackedResumeHtml } from "../src/features/tailor/buildPdfBackedResumeHtml.ts";

const textItem = (id, text, x, top) => ({
  id,
  text,
  x,
  top,
  width: Math.max(12, [...text].length * 8),
  height: 10,
  fontSize: 10,
  fontFamily: "OfferFlowPdf-g_test",
  fontId: "g_test",
  fallbackFontFamily: "Microsoft YaHei",
  fontWeight: 400,
  fontStyle: "normal",
  color: "#111111",
  rotation: 0,
  direction: "ltr"
});

const vectorShape = {
  d: "M0 0 L20 0 L20 20 Z",
  fill: "#64adbd",
  fillRule: "nonzero",
  fillOpacity: 1,
  stroke: "none",
  strokeOpacity: 1,
  strokeWidth: 0,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  dashArray: [],
  dashOffset: 0
};

const sourceProfile = {
  fullName: "",
  email: "",
  phone: "",
  currentCity: "",
  targetRole: "",
  education: [],
  experiences: [],
  projects: [],
  campusExperiences: [],
  awards: []
};

const resume = {
  targetCompany: "测试公司",
  targetRole: "产品经理",
  header: { name: "陈城", email: "", phone: "", city: "", headline: "产品经理" },
  education: [],
  experience: [],
  projects: [],
  campus: [],
  awards: []
};

test("every source PDF text item is emitted as editable HTML", () => {
  const items = [
    textItem("header", "陈城", 100, 20),
    textItem("experience", "负责企业级 AI Agent 产品规划与落地", 20, 120),
    textItem("project", "搭建内容生产平台并完成上线验证", 20, 150),
    textItem("skills", "技能特长：Agent、RAG、MCP", 20, 180),
    textItem("evidence", "通过用户调研、方案设计、上线验证与数据复盘持续优化产品体验", 20, 210)
  ];
  const characterCount = 600;
  const html = buildPdfBackedResumeHtml({
    layout: {
      characterCount,
      fonts: [{
        id: "g_test",
        family: "OfferFlowPdf-g_test",
        fallbackFamily: "Microsoft YaHei",
        dataBase64: "AA==",
        mimeType: "font/opentype",
        fontWeight: 400,
        fontStyle: "normal"
      }],
      pages: [{
        page: 1,
        widthPt: 595,
        heightPt: 842,
        imageDataUrl: "data:image/png;base64,AA==",
        backgroundImageDataUrl: "data:image/png;base64,BB==",
        vectorShapes: [vectorShape],
        items
      }]
    },
    resume,
    sourceProfile
  });

  items.forEach((item) => assert.match(html, new RegExp(item.text)));
  assert.equal((html.match(/class="source-overlay"/g) || []).length, items.length);
  assert.match(html, new RegExp(`name="source-character-count" content="${characterCount}"`));
  assert.match(html, /name="source-font-count" content="1"/);
  assert.match(html, /name="source-vector-shape-count" content="1"/);
  assert.match(html, /name="tailored-override-count" content="0"/);
  assert.match(html, /class="source-page-vectors"/);
  assert.match(html, /@font-face\{font-family:"OfferFlowPdf-g_test"/);
  assert.match(html, /\.source-overlay \{[^}]*color: transparent/);
  assert.match(html, /--patch-image:url\(data:image\/png;base64,BB==\)/);
});

test("a PDF with no extracted text still keeps the complete source page", () => {
  const html = buildPdfBackedResumeHtml({
    layout: {
      characterCount: 0,
      fonts: [],
      pages: [{
        page: 1,
        widthPt: 595,
        heightPt: 842,
        imageDataUrl: "data:image/png;base64,AA==",
        backgroundImageDataUrl: "data:image/png;base64,BB==",
        vectorShapes: [],
        items: []
      }]
    },
    resume,
    sourceProfile
  });

  assert.match(html, /name="source-character-count" content="0"/);
  assert.match(html, /class="source-page-image"/);
  assert.match(html, /当前未提取到可编辑文字，仍可预览与保存/);
  assert.equal((html.match(/class="source-overlay"/g) || []).length, 0);
});

test("does not replace a short PDF snippet with a complete rewritten paragraph", () => {
  const original = "负责产品需求调研、方案设计、上线验证和数据复盘，持续优化产品体验";
  const partialPdfText = "负责产品需求调研、方案设计";
  const tailored = "负责产品需求调研、方案设计与跨部门协作，建立完整的上线验证流程并持续跟踪核心指标";
  const html = buildPdfBackedResumeHtml({
    layout: {
      characterCount: partialPdfText.length,
      fonts: [],
      pages: [{
        page: 1,
        widthPt: 595,
        heightPt: 842,
        imageDataUrl: "data:image/png;base64,AA==",
        backgroundImageDataUrl: "data:image/png;base64,BB==",
        vectorShapes: [],
        items: [textItem("partial", partialPdfText, 20, 120)]
      }]
    },
    resume: {
      ...resume,
      experience: [{ id: "exp-1", company: "测试公司", title: "产品经理", start: "", end: "", location: "", bullets: [tailored] }]
    },
    sourceProfile: {
      ...sourceProfile,
      experiences: [{ organization: "测试公司", title: "产品经理", startDate: "", endDate: "", description: original, achievements: "" }]
    }
  });

  assert.match(html, /name="tailored-override-count" content="0"/);
  assert.doesNotMatch(html, new RegExp(tailored));
  assert.match(html, new RegExp(partialPdfText));
});
