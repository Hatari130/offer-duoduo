// Build a self-contained preview of the new TailorApp review-page design.
// Useful for visual QA without having to load the extension in Chrome.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildResumeHtml } from "../src/features/tailor/buildResumeHtml.ts";
import type { ResumeData, JdAnalysis } from "../src/features/tailor/types.ts";

const sampleResume: ResumeData = {
  targetRole: "AI 产品经理（增长策略 GTM）",
  targetCompany: "群核信息技术",
  generatedAt: new Date().toISOString(),
  header: {
    name: "示例候选人",
    headline: "AI 产品经理 · 增长策略 GTM",
    email: "demo.candidate@example.com",
    phone: "138-0000-0000",
    city: "杭州",
    links: [
      { label: "GitHub", href: "https://github.com/example" },
      { label: "作品集", href: "https://portfolio.example.com" }
    ]
  },
  summary:
    "面向 AI 产品经理（增长策略 GTM）岗位的候选人，主导过 0→1 的多模态产品落地经验，擅长把模型能力翻译成可衡量增长指标。",
  education: [
    {
      id: "edu-1",
      school: "浙江大学",
      degree: "硕士",
      major: "计算机科学与技术",
      start: "2023.09",
      end: "2026.06",
      gpa: "3.8/4.0",
      rank: "前 5%",
      courses: "机器学习、人机交互、产品管理与运营",
      highlights: [
        "研究方向：多模态大模型在 AIGC 工作流中的落地，发表一篇 CCF-B 论文",
        "作为 PM 主导 3 个校园 AI 产品的需求拆解与上线"
      ]
    }
  ],
  experience: [
    {
      id: "exp-1",
      company: "字节跳动",
      title: "AI 产品实习生",
      start: "2025.03",
      end: "2025.09",
      location: "杭州",
      bullets: [
        "负责豆包桌面端 AIGC 工作流从 0 到 1 的功能落地，对接算法团队完成 3 个核心能力上线",
        "重构用户引导漏斗，新用户次日留存从 31% 提升到 47%",
        "与增长团队共同设计 GTM 节奏，使核心场景 DAU 提升 18%"
      ]
    }
  ],
  projects: [
    {
      id: "project-1",
      name: "AIGC 设计师助手",
      role: "产品负责人 / 算法 PM",
      start: "2024.12",
      end: "2025.06",
      summary: "面向设计师的多模态生成助手，主导从用户研究到上线运营的端到端交付",
      bullets: [
        "梳理 12 个用户旅程，定义 4 项北极星指标",
        "推动视觉模型与排版模型双链路串联，使交付效率提升 38%",
        "管理 2 名算法与 1 名前端，建立双周迭代节奏"
      ],
      link: "https://example.com/case"
    }
  ],
  campus: [],
  awards: [],
  skills: [
    { id: "skills-product", label: "产品技能", items: ["产品规划", "增长策略", "GTM"] },
    { id: "skills-ai", label: "AI 经验", items: ["多模态大模型", "RAG", "提示词工程"] }
  ],
  languages: [],
  publications: [],
  interests: ["滑板", "电子音乐"]
};

const sampleJd: JdAnalysis = {
  source: "deepseek",
  responsibility: [
    "探索挖掘 AI 产品 PMF 高价值场景和理想人群画像（IDP），可自主进行产品工作的潜质搭建和测试",
    "通过黑客增长的手段和数据驱动工具，推动产品自助式使用量增长，撬动用户拉新、激活与留存 3 主等产品增长的实验验收设计，追踪并评估复盘等，并以天为周期迭代计划"
  ],
  must_haves: [
    "增长黑客精神：对用户增长全流程痴迷，思维活跃，善于在数据与创意之间寻找突破口",
    "低成本实验突破资源限制 2 动手能力强：擅长运用各类分析和 AI 工具，独立完成想法的验证，原型编程开发和实验测试等 3 AI 技术趋势洞察"
  ],
  differentiators: [
    "持续关注 AI 最新研究与进展（扩散模型/Agent/MCP 等），并能快速上手新工具，结合到增长工作中提升生产力 4 推广营销"
  ],
  bonus: [],
  keywords: ["AI", "增长", "GTM", "多模态", "RAG"],
  mappings: [
    {
      map_id: "JD-RESP-1",
      category: "responsibility",
      text: "探索挖掘 AI 产品 PMF 高价值场景和理想人群画像（IDP），可自主进行产品工作的潜质搭建和测试",
      resume_ids: ["exp-1.bullet-1", "project-1.bullet-1"],
      rationale: "字节实习 + AIGC 设计师助手都体现了端到端 PMF 探索能力"
    },
    {
      map_id: "JD-MUST-1",
      category: "requirement",
      text: "增长黑客精神：对用户增长全流程痴迷，思维活跃，善于在数据与创意之间寻找突破口",
      resume_ids: ["exp-1.bullet-2", "exp-1.bullet-3"],
      rationale: "字节期间重构引导漏斗并设计 GTM 节奏，新用户留存 +16pp"
    },
    {
      map_id: "JD-DIFF-1",
      category: "differentiator",
      text: "持续关注 AI 最新研究与进展（扩散模型/Agent/MCP 等），并能快速上手新工具",
      resume_ids: ["skills-ai"],
      rationale: "熟练使用 GPT-4o/Gemini/Qwen-VL，并在项目中实际落地"
    }
  ]
};

const resumeHtml = buildResumeHtml({ resume: sampleResume, jd: sampleJd });

const __dirname = dirname(fileURLToPath(import.meta.url));
const stylesheetPath = resolve(__dirname, "../src/entries/tailor/styles.css");
const stylesheet = (await readFile(stylesheetPath, "utf8"))
  .replace(/`/g, "\\`")
  .replace(/<\/style>/g, "<\\/style>");

const renderJdCard = (label, index, text, mapping) => {
  const mapId = mapping?.map_id || `JD-${label.toUpperCase()}-${index + 1}`;
  const matched = Boolean(mapping);
  const evidence = mapping?.resume_ids?.length
    ? `<div class="evidence-row">${mapping.resume_ids.slice(0, 4).map((rid) => `<span class="evidence-chip">${escape(rid)}</span>`).join("")}${mapping.resume_ids.length > 4 ? `<span class="evidence-chip">+${mapping.resume_ids.length - 4}</span>` : ""}</div>`
    : "";
  const rationale = mapping?.rationale ? `<p class="review-note">${escape(mapping.rationale)}</p>` : "";
  return `<div class="jd-card" data-match="${matched ? "direct" : "pending"}">
    <div class="jd-card-top">
      <span class="jd-id">${escape(mapId)}</span>
      <span class="match-pill ${matched ? "match-direct" : "match-pending"}">${matched ? "已映射" : "待补证"}</span>
      <span class="importance-pill">${escape(label)}</span>
    </div>
    <p>${escape(text)}</p>
    ${evidence}${rationale}
  </div>`;
};

const escape = (value) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });

const responsibilityCards = sampleJd.responsibility.map((item, idx) =>
  renderJdCard("工作职责", idx, item, sampleJd.mappings.find((m) => m.text === item && m.category === "responsibility"))
).join("");
const requirementCards = sampleJd.must_haves.map((item, idx) =>
  renderJdCard("岗位要求", idx, item, sampleJd.mappings.find((m) => m.text === item && m.category === "requirement"))
).join("");
const differentiatorCards = sampleJd.differentiators.map((item, idx) =>
  renderJdCard("加分项", idx, item, sampleJd.mappings.find((m) => m.text === item && m.category === "differentiator"))
).join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>OfferFlow 定制简历 · 审阅界面预览</title>
  <style>${stylesheet}</style>
</head>
<body>
  <div class="review-shell">
    <header class="review-toolbar">
      <div class="toolbar-title">
        <strong>JD × 简历对照审阅</strong>
        <span>群核信息技术 · AI 产品经理（增长策略 GTM）</span>
      </div>
      <div class="toolbar-actions">
        <button class="primary">DeepSeek 改写</button>
        <button>本地兜底</button>
        <button>新标签打开</button>
        <button>保存 HTML</button>
        <button>关闭</button>
      </div>
      <div class="review-status">点击左侧 JD 要求 / 右侧标注，查看对应简历证据。打印前点「保存 HTML」。</div>
    </header>

    <div class="review-grid">
      <section class="panel jd-panel">
        <div class="panel-head">
          <strong>职位描述 / JD</strong>
          <small>recruit.58.com · 杭州</small>
        </div>
        <div class="jd-scroll">
          <div class="jd-summary">
            <h2>JD 摘要</h2>
            <p>面向 AIGC 工作流的 AI 产品负责人，主导 GTM 与增长黑客实验。</p>
            <div class="score-row">
              <span class="score-pill"><strong>${sampleJd.responsibility.length}</strong>&nbsp;条工作职责</span>
              <span class="score-pill"><strong>${sampleJd.must_haves.length}</strong>&nbsp;条岗位要求</span>
              <span class="score-pill"><strong>${sampleJd.mappings.length}</strong>&nbsp;条映射</span>
              <span class="score-pill">来源：recruit.58.com</span>
            </div>
          </div>

          <div class="jd-section-title">工作职责</div>
          ${responsibilityCards}

          <div class="jd-section-title">岗位要求</div>
          ${requirementCards}

          ${differentiatorCards ? `<div class="jd-section-title">加分项</div>${differentiatorCards}` : ""}

          <div class="jd-summary">
            <h2>改写要点</h2>
            <ul>
              <li>突出 JD 中"端到端 + 增长指标"的措辞</li>
              <li>把项目经历里的模型能力翻译为"自助化 GTM 实验"</li>
              <li>没有给候选人的事实增加任何奖项或数字</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="panel resume-panel">
        <div class="panel-head">
          <strong>简历 HTML / 可编辑版本</strong>
          <small>生成于 ${new Date().toLocaleString("zh-CN")}</small>
        </div>
        <div class="resume-scroll">
          <div class="resume-stage">
            <iframe class="resume-iframe" title="resume" srcdoc="${escape(resumeHtml)}" sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"></iframe>
          </div>
        </div>
        <div class="resume-foot">
          <div class="pdf-manager">
            <div class="pdf-manager-copy">
              <strong>我的 PDF 简历</strong>
              <small>已保存：示例-简历.pdf · 1.2 MB</small>
            </div>
            <div class="pdf-manager-actions">
              <label class="pdf-upload">替换 PDF</label>
              <button>下载已保存 PDF</button>
              <button class="pdf-remove">删除</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="review-archive">
      <header>
        <strong>历史定制</strong>
        <small>3 个版本 · 全部仅本机</small>
      </header>
      <ul>
        <li>
          <span>
            <strong>tailor_a3f9</strong>
            <small>保存于 2 小时前</small>
          </span>
          <span>
            <button>载入</button>
            <button>删除</button>
          </span>
        </li>
        <li>
          <span>
            <strong>tailor_b712</strong>
            <small>保存于 1 天前</small>
          </span>
          <span>
            <button>载入</button>
            <button>删除</button>
          </span>
        </li>
      </ul>
    </section>
  </div>
</body>
</html>`;

const outputDir = resolve(dirname(fileURLToPath(import.meta.url)), "../.workbuddy/memory");
await mkdir(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "tailor-review-preview.html");
await writeFile(outputPath, html, "utf8");
console.log(`Wrote ${html.length} chars to ${outputPath}`);