import { randomUUID } from "node:crypto";
import type {
  PersonalProfile,
  ResumeContentBlock,
  ResumeTailorChange,
  ResumeTailorProposal,
  ResumeSourceEvidence,
  TailorJobContext
} from "@offerflow/domain";
import {
  hydrateResumeProfileSemantics,
  parseResumeContentBlocks,
  serializeResumeContentBlocks
} from "@offerflow/domain";
import type { ApiConfig } from "../config.ts";

interface PatchValue {
  value?: string;
  reason?: string;
}

interface PatchEntry {
  id?: string;
  blocks?: Array<{ id?: string; text?: string; reason?: string }>;
  /** Accepted only for backwards compatibility with an older model response. */
  description?: string;
  reason?: string;
}

interface ResumePatch {
  summary?: PatchValue;
  strengths?: PatchValue;
  experiences?: PatchEntry[];
  projects?: PatchEntry[];
  campusExperiences?: PatchEntry[];
}

export interface ResumeTailorProvider {
  readonly configured: boolean;
  readonly name: string;
  generate(job: TailorJobContext, profile: PersonalProfile, sourceEvidence?: ResumeSourceEvidence): Promise<ResumeTailorProposal>;
}

function clean(value: unknown, maximum = 4000): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function parseJsonObject(content: string): ResumePatch {
  const unfenced = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(unfenced) as ResumePatch;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 没有返回可解析的修改建议");
    return JSON.parse(unfenced.slice(start, end + 1)) as ResumePatch;
  }
}

function addChange(
  changes: ResumeTailorChange[],
  field: string,
  label: string,
  before: string,
  after: string,
  reason?: string
): void {
  if (!after || before.trim() === after.trim()) return;
  changes.push({
    id: randomUUID(),
    field,
    label,
    before,
    after,
    reason: clean(reason, 300) || "使表达更贴合岗位要求"
  });
}

export function applyResumePatch(
  source: PersonalProfile,
  patch: ResumePatch,
  provider: string
): ResumeTailorProposal {
  const profile = hydrateResumeProfileSemantics(source);
  const changes: ResumeTailorChange[] = [];

  const summary = clean(patch.summary?.value, 1200);
  if (summary) {
    addChange(changes, "selfIntroduction", "个人总结", profile.selfIntroduction, summary, patch.summary?.reason);
    if (profile.selfIntroduction.trim() !== summary) profile.selfIntroduction = summary;
  }
  const strengths = clean(patch.strengths?.value, 800);
  if (strengths) {
    addChange(changes, "strengths", "技能特长", profile.strengths, strengths, patch.strengths?.reason);
    if (profile.strengths.trim() !== strengths) profile.strengths = strengths;
  }

  const visibleLength = (value: string) => value.replace(/\s/g, "").length;
  const withinDensityBudget = (before: string, after: string) => {
    const sourceLength = visibleLength(before);
    if (!sourceLength) return Boolean(visibleLength(after));
    const ratio = visibleLength(after) / sourceLength;
    return ratio >= 0.9 && ratio <= 1.1;
  };
  const findBlock = (blocks: ResumeContentBlock[], id: string): ResumeContentBlock | undefined => {
    for (const block of blocks) {
      if (block.id === id) return block;
      const nested = block.children ? findBlock(block.children, id) : undefined;
      if (nested) return nested;
    }
    return undefined;
  };

  const applyEntries = <T extends { id: string; description: string; contentBlocks?: ResumeContentBlock[] }>(
    key: "experiences" | "projects" | "campusExperiences",
    entries: T[],
    patches: PatchEntry[] | undefined,
    label: (entry: T) => string
  ) => {
    for (const proposed of patches || []) {
      const id = clean(proposed.id, 200);
      if (!id) continue;
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) continue;
      const beforeBlocks = structuredClone(entry.contentBlocks || parseResumeContentBlocks(entry.description, entry.id));
      const nextBlocks = structuredClone(beforeBlocks);
      const stagedChanges: Array<{ blockId: string; before: string; after: string; reason?: string }> = [];

      for (const proposedBlock of proposed.blocks || []) {
        const blockId = clean(proposedBlock.id, 240);
        const text = clean(proposedBlock.text, 1600);
        if (!blockId || !text) continue;
        const block = findBlock(nextBlocks, blockId);
        if (!block || block.kind === "project" || !block.text) continue;
        if (block.text.trim() === text) continue;
        stagedChanges.push({ blockId, before: block.text, after: text, reason: proposedBlock.reason });
        block.text = text;
      }

      const legacyDescription = clean(proposed.description);
      const candidateBlocks = stagedChanges.length
        ? nextBlocks
        : legacyDescription ? parseResumeContentBlocks(legacyDescription, entry.id) : beforeBlocks;
      const beforeDescription = serializeResumeContentBlocks(beforeBlocks);
      const afterDescription = serializeResumeContentBlocks(candidateBlocks);
      if (!stagedChanges.length && !legacyDescription) continue;
      if (!withinDensityBudget(beforeDescription, afterDescription)) continue;

      entry.contentBlocks = candidateBlocks;
      entry.description = afterDescription;
      if (stagedChanges.length) {
        stagedChanges.forEach((change) => addChange(
          changes,
          `${key}.${id}.contentBlocks.${change.blockId}`,
          label(entry),
          change.before,
          change.after,
          change.reason
        ));
      } else {
        addChange(changes, `${key}.${id}.description`, label(entry), beforeDescription, afterDescription, proposed.reason);
      }
    }
  };

  applyEntries("experiences", profile.experiences, patch.experiences, (entry) => `工作经历 · ${entry.organization}`);
  applyEntries("projects", profile.projects, patch.projects, (entry) => `项目经历 · ${entry.name}`);
  applyEntries("campusExperiences", profile.campusExperiences, patch.campusExperiences, (entry) => `在校经历 · ${entry.type}`);

  return { profile, changes, provider, generatedAt: new Date().toISOString() };
}

function promptFor(job: TailorJobContext, profile: PersonalProfile, sourceEvidence?: ResumeSourceEvidence): string {
  const semanticProfile = hydrateResumeProfileSemantics(profile);
  const blocksForModel = (blocks: ResumeContentBlock[] = []): unknown[] => blocks.map((block) => block.kind === "project"
    ? { id: block.id, kind: block.kind, title: block.title, children: blocksForModel(block.children) }
    : { id: block.id, kind: block.kind, label: block.label, text: block.text });
  const evidence = {
    summary: semanticProfile.selfIntroduction,
    strengths: semanticProfile.strengths,
    experiences: semanticProfile.experiences.map(({ id, organization, title, contentBlocks }) => ({ id, organization, title, blocks: blocksForModel(contentBlocks) })),
    projects: semanticProfile.projects.map(({ id, name, role, contentBlocks }) => ({ id, name, role, blocks: blocksForModel(contentBlocks) })),
    campusExperiences: semanticProfile.campusExperiences.map(({ id, type, role, contentBlocks }) => ({ id, type, role, blocks: blocksForModel(contentBlocks) }))
  };
  return `你是严谨的中文简历编辑。根据岗位 JD 改写候选人的已有表达，但绝对不能新增候选人未提供的公司、项目、技术、数字、结果或职责。

规则：
1. 只调整措辞、排序和强调重点，保留所有事实。
2. 只改 paragraph 或 bullet 的 text；项目标题、层级、块数量、块 id 不得改变。
3. 每个经历改写后的可见字数必须保持在原文的 90%-110%，不要删除整段经历。
4. 只输出一个 JSON 对象，不要代码围栏或解释。
5. 未修改的字段不要返回；经历和内容块必须使用输入里的原 id。
6. 数字、公司、学校、项目、日期、技术名和所有权强度均是锁定事实，不得新增或篡改。

输出结构：
{"summary":{"value":"...","reason":"..."},"strengths":{"value":"...","reason":"..."},"experiences":[{"id":"...","blocks":[{"id":"原块id","text":"改写后文本","reason":"对应的JD能力"}]}],"projects":[],"campusExperiences":[]}

岗位：${JSON.stringify(job)}
候选人结构化证据：${JSON.stringify(evidence)}
原文件证据（仅用于核对，不得据此改变已锁定层级）：${JSON.stringify(sourceEvidence || {})}`;
}

export function createResumeTailorProvider(config: ApiConfig): ResumeTailorProvider {
  return {
    configured: Boolean(config.aiApiKey),
    name: config.aiModel,
    async generate(job, profile, sourceEvidence) {
      if (!config.aiApiKey) throw new Error("AI 服务尚未配置");
      const response = await fetch(`${config.aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.aiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.aiModel,
          temperature: 0.2,
          max_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "你只返回符合要求的 JSON。禁止虚构简历事实。" },
            { role: "user", content: promptFor(job, profile, sourceEvidence) }
          ]
        })
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`AI 服务请求失败（${response.status}）：${message.slice(0, 240)}`);
      }
      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("AI 没有返回修改建议");
      return applyResumePatch(profile, parseJsonObject(content), config.aiModel);
    }
  };
}
