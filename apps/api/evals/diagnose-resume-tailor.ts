/**
 * Compares what the model proposed with what applyResumePatch accepted, to find
 * suggestions that were silently dropped (e.g. by the 90%–110% length budget).
 *
 *   node --env-file=.env --experimental-transform-types evals/diagnose-resume-tailor.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { createEmptyPersonalProfile } from "@offerflow/domain";
import { loadApiConfig } from "../src/config.ts";
import { createResumeTailorProvider } from "../src/ai/resume-tailor.ts";

interface ExamCase { id: string; job: TailorJobContext; resume: Partial<PersonalProfile> }
interface ProposedBlock { id?: string; text?: string }
interface RawPatch {
  summary?: { value?: string };
  strengths?: { value?: string };
  experiences?: Array<{ id?: string; blocks?: ProposedBlock[] }>;
  projects?: Array<{ id?: string; blocks?: ProposedBlock[] }>;
  campusExperiences?: Array<{ id?: string; blocks?: ProposedBlock[] }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const visible = (value = "") => value.replace(/\s/g, "").length;

// Record the raw model answer by wrapping fetch. Cases run one at a time, so the last capture belongs to the current case.
let lastRaw = "";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const response = await originalFetch(...args);
  const payload = await response.clone().json().catch(() => undefined) as { choices?: Array<{ message?: { content?: string } }> } | undefined;
  lastRaw = payload?.choices?.[0]?.message?.content || "";
  return response;
};

const config = loadApiConfig(process.env);
const provider = createResumeTailorProvider(config);
const exam = JSON.parse(readFileSync(join(here, "datasets/resume-tailor.json"), "utf8")) as { cases: ExamCase[] };

const totals = { returned: 0, echoed: 0, dropped: 0 };

for (const item of exam.cases) {
  const profile = {
    ...createEmptyPersonalProfile(),
    ...item.resume,
    experiences: (item.resume.experiences || []).map((entry) => ({ kind: "internship", ...entry })),
    projects: item.resume.projects || [],
    campusExperiences: item.resume.campusExperiences || []
  } as PersonalProfile;
  const proposal = await provider.generate(item.job, structuredClone(profile));
  const raw = JSON.parse(lastRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as RawPatch;

  const proposed: string[] = [];
  if (raw.summary?.value) proposed.push("个人总结");
  if (raw.strengths?.value) proposed.push("技能特长");
  const entries = [
    ...profile.experiences.map((entry) => ({ key: "experiences" as const, entry })),
    ...profile.projects.map((entry) => ({ key: "projects" as const, entry })),
    ...profile.campusExperiences.map((entry) => ({ key: "campusExperiences" as const, entry }))
  ];
  const droppedForLength: string[] = [];
  const echoedEntries: string[] = [];
  for (const field of ["summary", "strengths"] as const) {
    const before = field === "summary" ? profile.selfIntroduction : profile.strengths;
    if (raw[field]?.value?.trim() === before.trim()) echoedEntries.push(field);
  }
  for (const { key, entry } of entries) {
    const patch = (raw[key] || []).find((candidate) => candidate.id === entry.id);
    if (!patch?.blocks?.length) continue;
    proposed.push(`${key}:${entry.id}`);
    if (proposal.changes.some((change) => change.field.startsWith(`${key}.${entry.id}`))) continue;
    const originalLines = entry.description.split("\n").map((line) => line.replace(/^[•\-\s]+/, "").trim());
    const echoed = patch.blocks.every((block) => originalLines.includes((block.text || "").trim()));
    if (echoed) {
      echoedEntries.push(`${key}:${entry.id}`);
      continue;
    }
    // applyResumePatch rejects an entry whose total length leaves 90%–110% of the original.
    const proposedLength = visible(patch.blocks.map((block) => block.text).join(""));
    const ratio = proposedLength / visible(originalLines.join(""));
    droppedForLength.push(`${key}:${entry.id}（字数约为原文的 ${(ratio * 100).toFixed(0)}%）`);
  }
  console.log(`\n## ${item.id}`);
  console.log(`模型返回 ${proposed.length} 处，原样返回 ${echoedEntries.length} 处，超字数被丢弃 ${droppedForLength.length} 处，最终采纳 ${proposal.changes.length} 条改动`);
  for (const line of droppedForLength) console.log(`  超字数被丢弃：${line}`);
  totals.returned += proposed.length;
  totals.echoed += echoedEntries.length;
  totals.dropped += droppedForLength.length;
}

console.log(`\n合计：模型返回 ${totals.returned} 处，其中原样返回 ${totals.echoed} 处（${(totals.echoed / totals.returned * 100).toFixed(0)}%），超字数被丢弃 ${totals.dropped} 处（${(totals.dropped / totals.returned * 100).toFixed(0)}%）`);
