// Smoke test: build a representative ResumeData, run it through buildResumeHtml,
// and write the result to .workbuddy/memory/ for visual inspection.
import { writeFile, mkdir } from "node:fs/promises";
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
    },
    {
      id: "edu-2",
      school: "西安交通大学",
      degree: "学士",
      major: "软件工程",
      start: "2019.09",
      end: "2023.06",
      gpa: "3.7/4.0",
      rank: "前 10%",
      courses: "",
      highlights: ["校级优秀毕业生，连续两年获得国家奖学金"]
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
    },
    {
      id: "exp-2",
      company: "美团",
      title: "产品实习生",
      start: "2024.06",
      end: "2024.12",
      location: "北京",
      bullets: [
        "参与到店营销活动后台的策略配置改版，承接 BD 反馈并迭代 2 个核心规则引擎",
        "输出 4 份数据看板，使运营决策周期从 T+2 缩短到 T+0"
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
  campus: [
    {
      id: "campus-1",
      type: "学生科技协会",
      role: "会长",
      start: "2021.09",
      end: "2023.06",
      description: "统筹 5 个部门、80+ 同学，组织 3 场校级 AI Hackathon"
    }
  ],
  awards: [
    { id: "award-1", date: "2024.11", name: "中国机器人大赛一等奖", level: "国家级" },
    { id: "award-2", date: "2023.06", name: "浙江省优秀毕业生", level: "省级" }
  ],
  skills: [
    {
      id: "skills-computer",
      label: "产品技能",
      items: ["产品规划", "增长策略", "GTM", "数据看板（SQL/Tableau）", "用户研究"]
    },
    {
      id: "skills-ai",
      label: "AI 经验",
      items: ["多模态大模型（GPT-4o / Gemini / Qwen-VL）", "RAG", "提示词工程", "LoRA"]
    },
    {
      id: "skills-cert",
      label: "证书",
      items: ["PMP（备考）", "Google Data Analytics"]
    }
  ],
  languages: [
    { id: "language-1", name: "英语", level: "CET-6 580 / 雅思 7.0" },
    { id: "language-2", name: "日语", level: "N2" }
  ],
  publications: [
    { id: "publication-1", title: "Multi-modal Workflow for Design Co-creation", venue: "CHI Late-Breaking Work 2025", date: "2025.04" }
  ],
  interests: ["滑板", "电子音乐", "城市徒步"]
};

const sampleJd: JdAnalysis = {
  source: "deepseek",
  responsibility: [
    "负责 AI 产品从需求拆解到上线运营的端到端交付",
    "协同算法、设计、研发团队，把模型能力包装成可衡量的业务增长"
  ],
  must_haves: [
    "具备 1 年以上 AI 产品实习经验",
    "熟悉大模型能力边界，能独立完成 prompt 设计"
  ],
  differentiators: [
    "有 0→1 项目落地经验，主导过 GTM 节奏"
  ],
  bonus: [
    "在 ACM/CHIL 等会议发表过论文"
  ],
  keywords: ["AI", "增长", "GTM", "多模态", "RAG"],
  mappings: [
    {
      map_id: "JD-RESP-1",
      category: "responsibility",
      text: "负责 AI 产品从需求拆解到上线运营的端到端交付",
      resume_ids: ["exp-1.bullet-1", "project-1.bullet-1"],
      rationale: "字节实习 + AIGC 设计师助手都体现了端到端交付能力"
    },
    {
      map_id: "JD-MUST-1",
      category: "requirement",
      text: "具备 1 年以上 AI 产品实习经验",
      resume_ids: ["exp-1.bullet-1"],
      rationale: "字节 AI 实习 7 个月 + 多模态项目经验"
    },
    {
      map_id: "JD-MUST-2",
      category: "requirement",
      text: "熟悉大模型能力边界，能独立完成 prompt 设计",
      resume_ids: ["skills-ai", "project-1.bullet-2"],
      rationale: "熟练使用 GPT-4o/Gemini/Qwen-VL，并在项目中实际落地"
    },
    {
      map_id: "JD-DIFF-1",
      category: "differentiator",
      text: "有 0→1 项目落地经验，主导过 GTM 节奏",
      resume_ids: ["exp-1.bullet-3", "project-1"],
      rationale: "字节实习期间负责豆包新功能 GTM 节奏"
    },
    {
      map_id: "JD-BONUS-1",
      category: "bonus",
      text: "在 ACM/CHIL 等会议发表过论文",
      resume_ids: ["publication-1", "edu-1.highlight-1"],
      rationale: "CHI Late-Breaking Work + 浙大研究方向的 CCF-B 论文"
    }
  ]
};

const html = buildResumeHtml({
  resume: sampleResume,
  jd: sampleJd,
  accentColor: "#185fa5"
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, "../.workbuddy/memory");
await mkdir(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "tailor-resume-preview.html");
await writeFile(outputPath, html, "utf8");
console.log(`Wrote ${html.length} chars to ${outputPath}`);