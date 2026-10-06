/**
 * Runs the resume-tailor exam against the configured model and grades it.
 *
 *   cd apps/api
 *   node --env-file=.env --experimental-transform-types evals/run-resume-tailor.ts [--runs 3]
 *
 * Writes a JSON report to evals/results/ so later versions can be compared.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PersonalProfile, ResumeTailorChange } from "@offerflow/domain";
import { loadApiConfig } from "../src/config.ts";
import { createResumeTailorProvider } from "../src/ai/resume-tailor.ts";
import { gradeRewrite, type FabricationFinding } from "../src/agent/fabrication.ts";
import { loadResumeCases, profileFor, type ResumeCase as ExamCase } from "./fixtures.ts";

interface RunResult {
  caseId: string;
  run: number;
  ok: boolean;
  error?: string;
  latencyMs: number;
  changes: number;
  fabricationRate: number;
  findings: Array<FabricationFinding & { change: number }>;
  keywordCoverageBefore: number;
  keywordCoverageAfter: number;
  rewrites: Array<{ label: string; before: string; after: string }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const runsArg = process.argv.indexOf("--runs");
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 3;
const CONCURRENCY = 4;

/** Every piece of text the candidate supplied; the only legal source of facts. */
function evidenceOf(profile: PersonalProfile): string[] {
  return [
    profile.selfIntroduction,
    profile.strengths,
    ...profile.experiences.flatMap((entry) => [entry.organization, entry.title, entry.description]),
    ...profile.projects.flatMap((entry) => [entry.name, entry.role, entry.description]),
    ...profile.campusExperiences.flatMap((entry) => [entry.type, entry.role, entry.description])
  ].filter(Boolean);
}

function resumeText(profile: PersonalProfile): string {
  return evidenceOf(profile).join("\n");
}

function coverage(text: string, keywords: string[]): number {
  if (!keywords.length) return 0;
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword.toLowerCase())).length / keywords.length;
}

async function runOne(
  provider: ReturnType<typeof createResumeTailorProvider>,
  exam: ExamCase,
  run: number
): Promise<RunResult> {
  const profile = profileFor(exam.resume);
  const started = Date.now();
  const empty = {
    caseId: exam.id, run, changes: 0, fabricationRate: 0, findings: [], rewrites: [],
    keywordCoverageBefore: coverage(resumeText(profile), exam.keywords), keywordCoverageAfter: 0
  };
  try {
    const proposal = await provider.generate(exam.job, structuredClone(profile));
    const changes: ResumeTailorChange[] = proposal.changes;
    const report = gradeRewrite(changes, evidenceOf(profile), { allow: [exam.job.position, exam.job.company] });
    return {
      ...empty,
      ok: true,
      latencyMs: Date.now() - started,
      changes: changes.length,
      fabricationRate: report.fabricationRate,
      findings: report.findings,
      keywordCoverageAfter: coverage(resumeText(proposal.profile), exam.keywords),
      rewrites: changes.map(({ label, before, after }) => ({ label, before, after }))
    };
  } catch (error) {
    return { ...empty, ok: false, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
  }
}

async function main() {
  const config = loadApiConfig(process.env);
  const provider = createResumeTailorProvider(config);
  if (!provider.configured) throw new Error("没有配置 AI 密钥：请在 apps/api/.env 里设置 DEEPSEEK_API_KEY");

  const exam = { cases: loadResumeCases() };
  const jobs = exam.cases.flatMap((item) => Array.from({ length: RUNS }, (_, run) => ({ item, run })));
  const results: RunResult[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const { item, run } = jobs[next++];
      const result = await runOne(provider, item, run);
      results.push(result);
      console.log(`${result.ok ? "✓" : "✗"} ${item.id} #${run + 1}  ${result.latencyMs}ms  changes=${result.changes}  fabricated=${result.findings.length}`);
    }
  }));

  const ok = results.filter((result) => result.ok);
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const summary = {
    model: provider.name,
    runsPerCase: RUNS,
    cases: exam.cases.length,
    attempts: results.length,
    errorRate: 1 - ok.length / results.length,
    runsWithAnyFabrication: ok.filter((result) => result.findings.length > 0).length / (ok.length || 1),
    meanFabricationRate: mean(ok.map((result) => result.fabricationRate)),
    meanChanges: mean(ok.map((result) => result.changes)),
    noChangeRate: ok.filter((result) => result.changes === 0).length / (ok.length || 1),
    keywordCoverageBefore: mean(ok.map((result) => result.keywordCoverageBefore)),
    keywordCoverageAfter: mean(ok.map((result) => result.keywordCoverageAfter)),
    meanLatencyMs: Math.round(mean(ok.map((result) => result.latencyMs))),
    findingsByKind: ok.flatMap((result) => result.findings).reduce<Record<string, number>>((counts, finding) => {
      counts[finding.kind] = (counts[finding.kind] || 0) + 1;
      return counts;
    }, {})
  };

  console.log("\n=== 基线结果 ===");
  console.table(summary);
  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `resume-tailor-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ summary, results: results.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.run - b.run) }, null, 2));
  console.log(`报告已写入 ${file}`);
}

await main();
