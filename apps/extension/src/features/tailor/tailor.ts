// JD-driven resume tailoring via DeepSeek.
//
// The function:
//   1. Prompts DeepSeek to rewrite each verified bullet / experience while
//      keeping dates, metrics, employers, projects and titles frozen.
//   2. Returns a `ResumeData` document and a `JdAnalysis` with stable
//      mapping ids so the review surface can cross-highlight.
//   3. Refuses to invent named models, industries, customers, patents,
//      awards, revenue, team size, or metrics. Anything missing is returned
//      in `unsupportedClaims` so the UI can show it as a soft warning.

import type { OfferFlowSettings, PersonalProfile } from "@/shared/types";
import {
  buildJobKey,
  profileToResume,
  type JdAnalysis,
  type JdMapping,
  type ResumeData,
  type PdfTailoringSourceBlock,
  type TailorContext,
  type TailoredResumeBundle
} from "./types";
import { parseDeepSeekJson } from "./deepseekJson";
import { collectResumeTextChanges } from "./tailoringDiff";
import { validatePdfTailoringPatches } from "./pdfTailoringPatches";

const API_URL = "https://api.deepseek.com/chat/completions";
const MAX_OUTPUT_TOKENS = 8192;

const SYSTEM_PROMPT = `你是 JobKoI 的简历定制助手。基于候选人已上传的真实资料 + 招聘JD的事实陈述，输出一份针对该JD量身定制的中文简历结构化 JSON。
严格要求：
1. 不得编造公司、奖项、数字、客户、模型、专利、行业、团队规模等任何事实。
2. 不得删除既有内容来"凑"JD 关键词；只能改写措辞、调整顺序。
3. 教育/工作/项目的雇主、岗位名、起止时间、学位、专业名称保持原样。
4. 每条 bullet 必须能映射到一条招聘JD里的描述，否则标 unsupported 并不要写入 resume。
5. 必须在每条 bullet 前面放一个或多个 resume_ids 与之绑定的 JD map_id，体现简历如何回应 JD。
6. 至少改写 3 条与 JD 最相关的现有 bullet：保持事实、数字和长度基本不变，但把 JD 相关能力前置；不得仅原样复制候选人简历。`;

interface TailorModelResponse {
  jd?: {
    responsibility?: string[];
    must_haves?: string[];
    differentiators?: string[];
    bonus?: string[];
    keywords?: string[];
  };
  resume?: Partial<ResumeData> & {
    unsupported_claims?: string[];
    notes?: string[];
    mapping?: Array<{
      map_id: string;
      category: JdMapping["category"];
      text: string;
      resume_ids: string[];
      rationale?: string;
    }>;
    pdf_patches?: Array<{
      block_id: string;
      page: number;
      source_text: string;
      tailored_text: string;
      map_ids?: string[];
    }>;
  };
}

export async function tailorResumeWithDeepSeek(
  profile: PersonalProfile,
  context: TailorContext,
  settings: OfferFlowSettings,
  sourceBlocks: PdfTailoringSourceBlock[] = []
): Promise<TailoredResumeBundle> {
  const apiKey = settings.deepseekApiKey?.trim();
  if (!apiKey) throw new Error("请先在设置中填写 DeepSeek API Key 后再生成定制简历");

  const baseline = profileToResume(profile);
  const prompt = buildPrompt(profile, context, baseline, sourceBlocks);
  let parsed = await requestTailoredJson(apiKey, settings, prompt);
  let resume = mergeResume(baseline, parsed.resume || {});
  let changes = collectResumeTextChanges(baseline, resume);
  let pdfPatches = validatePdfTailoringPatches(parsed.resume?.pdf_patches, sourceBlocks);
  if (sourceBlocks.length > 0 && pdfPatches.length === 0) {
    parsed = await requestTailoredJson(
      apiKey,
      settings,
      `${prompt}\n\n关键纠错：上一次没有生成可验证的 PDF 补丁。本次必须逐字复制原 PDF 文本块的 page、block_id、source_text，并为至少 ${Math.min(3, sourceBlocks.length)} 个文本块提供等长改写。`
    );
    resume = mergeResume(baseline, parsed.resume || {});
    changes = collectResumeTextChanges(baseline, resume);
    pdfPatches = validatePdfTailoringPatches(parsed.resume?.pdf_patches, sourceBlocks);
  }
  if (sourceBlocks.length > 0 && pdfPatches.length === 0) {
    throw new Error("DeepSeek 改写了结构化简历，但没有返回能与原 PDF 文本块校验一致的补丁，已停止生成，避免再次出现‘改写有内容、落版为 0’。请重试一次。");
  }
  if (changes.length === 0 && pdfPatches.length === 0) {
    throw new Error("DeepSeek 已返回结果，但没有实际改写任何简历内容。请重新生成；系统不会再把原文复制版标记为定制成功。");
  }
  const jd = buildJdAnalysis(parsed.jd || {}, parsed.resume?.mapping || []);
  return {
    context,
    jd,
    resume,
    generatedAt: new Date().toISOString(),
    notes: [`已改写 ${changes.length} 处结构化内容，并生成 ${pdfPatches.length} 个原 PDF 定位补丁。`, ...(parsed.resume?.notes || [])],
    unsupportedClaims: parsed.resume?.unsupported_claims || [],
    changeSummary: { modelChanges: changes.length },
    pdfPatches
  };
}

async function requestTailoredJson(
  apiKey: string,
  settings: OfferFlowSettings,
  prompt: string
): Promise<TailorModelResponse> {
  const model = settings.deepseekModel === "deepseek-v4-flash"
    ? "deepseek-chat"
    : settings.deepseekModel || "deepseek-chat";
  let lastFailure = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryInstruction = attempt === 0
      ? ""
      : "\n\n上一次输出未形成完整 JSON。请压缩 notes、rationale 和措辞，但必须返回语法完整的单个 JSON 对象，不要使用 Markdown。";
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${prompt}${retryInstruction}` }
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: false
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`DeepSeek 定制请求失败（${response.status}）：${detail.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string };
      }>;
    };
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (!content) throw new Error("DeepSeek 没有返回定制结果");

    const result = parseDeepSeekJson<TailorModelResponse>(content);
    const hitOutputLimit = choice?.finish_reason === "length";
    if (result.value && !hitOutputLimit) return result.value;

    const reason = hitOutputLimit || result.likelyTruncated
      ? "输出达到长度上限并被截断"
      : "返回内容不是合法 JSON";
    lastFailure = `${reason}（${result.normalized.length} 字符；${result.error?.message || `finish_reason=${choice?.finish_reason || "unknown"}`}）`;
  }

  throw new Error(`DeepSeek 定制结果无法解析：${lastFailure}。已自动重试，请缩短简历内容或稍后再试。`);
}

function buildPrompt(
  profile: PersonalProfile,
  context: TailorContext,
  baseline: ResumeData,
  sourceBlocks: PdfTailoringSourceBlock[]
): string {
  const candidate = redactForLLM(profile, baseline);
  return `## 招聘JD（请基于此定制）
公司：${context.company}
岗位：${context.position}
${context.city ? `城市：${context.city}\n` : ""}${context.jobType ? `类型：${context.jobType}\n` : ""}
${context.deadline ? `截止：${context.deadline}\n` : ""}
${context.summary ? `岗位摘要：${context.summary}\n` : ""}
JD 职责：
${(context.responsibilities || []).map((item) => `- ${item}`).join("\n") || "- 暂无"}
JD 要求：
${(context.requirements || []).map((item) => `- ${item}`).join("\n") || "- 暂无"}
${context.rawExcerpt ? `\nJD 原始文本（仅供参考，避免幻觉）：\n${context.rawExcerpt.slice(0, 1200)}` : ""}

## 候选人原始资料
\`\`\`json
${JSON.stringify(candidate, null, 2)}
\`\`\`

## 原 PDF 可改写文本块
下面文本直接来自 PDF 坐标层。只改写其中与 JD 最相关的叙述块；必须原样复用 block_id 和 source_text。不要改教育、日期、公司、岗位、数字或专有名词。tailored_text 的字符数必须为 source_text 的 90%-110%，视觉宽度不得增加超过 8%；优先做关键词前置和同义替换，不要新增句子、bullet 或换行。
\`\`\`json
${JSON.stringify(sourceBlocks, null, 2)}
\`\`\`

## 输出结构
\`\`\`json
{
  "jd": {
    "responsibility": ["..."],
    "must_haves": ["..."],
    "differentiators": ["..."],
    "bonus": ["..."],
    "keywords": ["..."]
  },
  "resume": {
    "targetRole": "${escapeString(context.position)}",
    "targetCompany": "${escapeString(context.company)}",
    "header": {"name":"...","headline":"...","email":"...","phone":"...","city":"...","links":[{"label":"...","href":"..."}]},
    "summary": "...",
    "education": [
      {"id":"edu-1","school":"...","degree":"...","major":"...","start":"...","end":"...","gpa":"...","rank":"...","courses":"...","highlights":["..."]}
    ],
    "experience": [
      {"id":"exp-1","company":"...","title":"...","start":"...","end":"...","location":"...","bullets":["..."]}
    ],
    "projects": [...],
    "campus": [...],
    "awards": [...],
    "skills": [{"id":"...","label":"...","items":["..."]}],
    "languages": [...],
    "publications": [...],
    "interests": ["..."],
    "notes": ["针对这次JD改写了哪些点"],
    "unsupported_claims": ["被砍掉的虚假事实"],
    "mapping": [
      {"map_id":"JD-AGENT","category":"responsibility","text":"...","resume_ids":["exp-1.bullet-1"],"rationale":"..."}
    ],
    "pdf_patches": [
      {"page":1,"block_id":"pdf-block-15","source_text":"必须逐字复制上方对应文本块","tailored_text":"长度保持在原文 90%-110% 的改写文本","map_ids":["JD-AGENT"]}
    ]
  }
}
\`\`\`

请只返回上述 JSON，所有 id 字段必须复用候选人资料中已有的 id；如要新增 bullet，请使用 \`<exp-id>.bullet-<index>\` 命名。${sourceBlocks.length ? `pdf_patches 必须从上方文本块中选择至少 ${Math.min(3, sourceBlocks.length)} 个，并逐字复制 page、block_id、source_text。` : "pdf_patches 返回空数组。"}`;
}

function escapeString(value: string): string {
  return value.replace(/"/g, '\\"');
}

function redactForLLM(profile: PersonalProfile, baseline: ResumeData) {
  return {
    basics: {
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      city: profile.currentCity,
      targetRole: profile.targetRole,
      headline: profile.selfIntroduction,
      summary: profile.strengths,
      careerPlan: profile.careerPlan,
      interests: profile.hobbies
    },
    education: baseline.education,
    experience: baseline.experience,
    projects: baseline.projects,
    campus: baseline.campus,
    awards: baseline.awards,
    skills: baseline.skills,
    languages: baseline.languages,
    publications: baseline.publications,
    // Sensitive identifiers are redacted — the LLM doesn't need them to
    // rewrite bullet wording and we keep PII surface small.
    redacted: ["idNumber", "idType", "wechat", "qq", "address", "emergencyContactPhone"]
  };
}

function buildJdAnalysis(
  jd: NonNullable<TailorModelResponse["jd"]>,
  mappings: TailorModelResponse extends { resume?: infer R }
    ? R extends { mapping?: infer M }
      ? M extends Array<infer Item>
        ? Item[]
        : never
      : never
    : never
): JdAnalysis {
  const safeMappings: JdMapping[] = (Array.isArray(mappings) ? mappings : [])
    .map((item) => ({
      map_id: String(item.map_id || ""),
      category: (item.category as JdMapping["category"]) || "keyword",
      text: String(item.text || ""),
      resume_ids: Array.isArray(item.resume_ids) ? item.resume_ids.map(String) : [],
      rationale: item.rationale ? String(item.rationale) : undefined
    }))
    .filter((item) => item.map_id && item.text);
  const mappedTexts = (category: JdMapping["category"]) =>
    safeMappings.filter((item) => item.category === category).map((item) => item.text);
  const responsibility = Array.isArray(jd.responsibility) && jd.responsibility.length
    ? jd.responsibility.map(String)
    : mappedTexts("responsibility");
  const mustHaves = Array.isArray(jd.must_haves) && jd.must_haves.length
    ? jd.must_haves.map(String)
    : mappedTexts("requirement");
  return {
    source: "deepseek",
    responsibility,
    must_haves: mustHaves,
    differentiators: Array.isArray(jd.differentiators) ? jd.differentiators.map(String) : [],
    bonus: Array.isArray(jd.bonus) ? jd.bonus.map(String) : [],
    keywords: Array.isArray(jd.keywords) ? jd.keywords.map(String) : [],
    mappings: safeMappings
  };
}

function mergeResume(baseline: ResumeData, override: Partial<ResumeData> & { unsupported_claims?: string[] }): ResumeData {
  const header = { ...baseline.header, ...(override.header || {}) };
  const education = mergeStableSection(baseline.education, override.education, (item) => ({
    ...item,
    highlights: Array.isArray(item.highlights) ? item.highlights : []
  }));
  const experience = mergeStableSection(baseline.experience, override.experience, (item) => ({
    ...item,
    bullets: Array.isArray(item.bullets) ? item.bullets.filter(Boolean) : []
  }));
  const projects = mergeStableSection(baseline.projects, override.projects, (item) => ({
    ...item,
    bullets: Array.isArray(item.bullets) ? item.bullets.filter(Boolean) : []
  }));
  return {
    ...baseline,
    targetRole: override.targetRole || baseline.targetRole,
    targetCompany: override.targetCompany || baseline.targetCompany,
    header,
    summary: override.summary || baseline.summary,
    education,
    experience,
    projects,
    campus: mergeStableSection(baseline.campus, override.campus, (item) => ({ ...item })),
    awards: mergeStableSection(baseline.awards, override.awards, (item) => ({ ...item })),
    skills: mergeStableSection(baseline.skills, override.skills, (item) => ({
      ...item,
      items: Array.isArray(item.items) ? item.items : []
    })),
    languages: mergeStableSection(baseline.languages, override.languages, (item) => ({ ...item })),
    publications: mergeStableSection(baseline.publications, override.publications, (item) => ({ ...item })),
    interests: Array.isArray(override.interests) ? override.interests : baseline.interests
  };
}

function mergeStableSection<T extends { id: string }>(
  baseline: T[],
  override: T[] | undefined,
  normalize: (item: T) => T
) {
  if (!Array.isArray(override) || override.length === 0) return baseline.map(normalize);
  const overrideById = new Map(override.filter((item) => item?.id).map((item) => [item.id, item]));
  const merged = baseline.map((item) => normalize({ ...item, ...(overrideById.get(item.id) || {}) }));
  const baselineIds = new Set(baseline.map((item) => item.id));
  override
    .filter((item) => item?.id && !baselineIds.has(item.id))
    .forEach((item) => merged.push(normalize(item)));
  return merged;
}

// Local fallback used when the user has no DeepSeek key. We still build a
// usable resume structure from the profile; the JD mappings are filled by
// keyword overlap on the JD requirements / responsibilities so the review
// page can highlight how each bullet ties back to the JD.
export function buildLocalFallback(
  profile: PersonalProfile,
  context: TailorContext
): TailoredResumeBundle {
  const baseline = profileToResume(profile);
  const resume: ResumeData = {
    ...baseline,
    targetRole: context.position,
    targetCompany: context.company,
    summary: reorderSummaryForJd(baseline.summary, context)
  };
  const jd: JdAnalysis = {
    source: "fallback",
    responsibility: context.responsibilities,
    must_haves: context.requirements,
    differentiators: [],
    bonus: [],
    keywords: extractKeywords(context),
    mappings: buildKeywordMappings(resume, context)
  };
  return {
    context,
    jd,
    resume,
    generatedAt: new Date().toISOString(),
    notes: ["未启用 DeepSeek：当前是按本地规则生成的关键词匹配版。配置 API Key 后会获得更好的定制效果。"],
    unsupportedClaims: []
  };
}

function reorderSummaryForJd(summary: string, context: TailorContext): string {
  const keywords = extractKeywords(context).slice(0, 3);
  if (!summary) {
    return keywords.length
      ? `面向 ${context.position} 的候选人，期待加入 ${context.company || "贵公司"}。`
      : `面向 ${context.position} 的候选人，期待加入 ${context.company || "贵公司"}。`;
  }
  if (!keywords.length) return summary;
  return `${summary.replace(/[。\.]\s*$/, "")}。曾多次涉及${keywords.join("、")}相关工作。`;
}

function extractKeywords(context: TailorContext): string[] {
  const stopwords = new Set([
    "的",
    "和",
    "与",
    "及",
    "等",
    "在",
    "为",
    "或",
    "是",
    "有",
    "并",
    "以",
    "可",
    "能",
    "会",
    "其他",
    "相关",
    "工作",
    "岗位",
    "职位",
    "负责",
    "具备",
    "熟悉",
    "良好",
    "优先",
    "以上"
  ]);
  const source = [
    context.position,
    context.summary || "",
    ...(context.responsibilities || []),
    ...(context.requirements || [])
  ].join("\n");
  const candidates: Record<string, number> = {};
  source
    .replace(/[，。；：、（）()【】《》!??"",.]/g, " ")
    .split(/\s+/)
    .forEach((token) => {
      const clean = token.trim();
      if (!clean || clean.length < 2 || clean.length > 18) return;
      if (stopwords.has(clean)) return;
      candidates[clean] = (candidates[clean] || 0) + 1;
    });
  return Object.entries(candidates)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function buildKeywordMappings(resume: ResumeData, context: TailorContext): JdMapping[] {
  const mappings: JdMapping[] = [];
  const keywords = extractKeywords(context);
  keywords.forEach((keyword, index) => {
    const matched: string[] = [];
    resume.experience.forEach((exp) => {
      exp.bullets.forEach((bullet, bulletIndex) => {
        if (bullet.includes(keyword)) matched.push(`${exp.id}.bullet-${bulletIndex}`);
      });
    });
    resume.projects.forEach((project) => {
      project.bullets.forEach((bullet, bulletIndex) => {
        if (bullet.includes(keyword)) matched.push(`${project.id}.bullet-${bulletIndex}`);
      });
    });
    if (matched.length === 0) return;
    mappings.push({
      map_id: `JD-LOCAL-${index + 1}`,
      category: "keyword",
      text: keyword,
      resume_ids: Array.from(new Set(matched)),
      rationale: "按关键词本地匹配"
    });
  });
  return mappings;
}

export function ensureJobKey(context: Pick<TailorContext, "company" | "position" | "sourceUrl">) {
  return context.company || context.position ? buildJobKey(context) : buildJobKey({ ...context, sourceUrl: context.sourceUrl || location?.href || "" });
}
