/**
 * Deterministic fabrication grader for resume rewrites.
 *
 * A claim in the rewritten text is "supported" only if it can be found in the
 * evidence (the source resume, and later the user's own answers). Only claims
 * that code can judge objectively are checked; everything else is left to the
 * LLM judge. Known blind spots: Chinese numerals (三个), unit swaps that keep
 * the number (30 人 → 30%), and Chinese company / project names.
 */

export type FabricationKind = "number" | "term" | "ownership" | "magnitude";

export interface FabricationFinding {
  kind: FabricationKind;
  value: string;
}

export interface FabricationOptions {
  /** Words that may appear without evidence, e.g. the target job title. */
  allow?: string[];
  /**
   * The original text of this one change. When given, an ownership claim is only
   * flagged if the original described a supporting role (参与/协助…), so plain verb
   * swaps such as 做 → 负责 are not reported.
   */
  before?: string;
}

// Words that claim the candidate led the work. "参与/协助" in the source must not become these.
const OWNERSHIP_WORDS = ["负责", "主导", "牵头", "带领", "主持", "独立完成", "独立负责", "从0到1", "从零到一"];
const SUPPORTING_WORDS = ["参与", "协助", "配合", "辅助", "帮忙", "帮助", "支持"];
// Words that claim how big the effect was. Without a number or the user's own words behind them they are exaggeration.
const MAGNITUDE_WORDS = ["显著", "大幅", "全量", "极大", "翻倍", "成倍", "数倍", "爆发式", "行业领先", "业内领先", "大规模"];

const NUMBER_PATTERN = /\d+(?:\.\d+)?/g;
// Latin-script tokens: tools, languages, frameworks, abbreviations (SQL, A/B, C++, Node.js).
const TERM_PATTERN = /[A-Za-z][A-Za-z0-9+#.]*(?:\/[A-Za-z0-9+#.]+)*/g;

function numbersIn(text: string): Set<string> {
  // "从0到1" is an ownership phrase (checked below), not a count of anything.
  const counted = text.replace(/从\s*0\s*到\s*1/g, "");
  return new Set((counted.match(NUMBER_PATTERN) || []).map((value) => String(Number(value))));
}

function termsIn(text: string): Set<string> {
  return new Set((text.match(TERM_PATTERN) || []).map((value) => value.replace(/\.+$/, "").toLowerCase()));
}

export function findUnsupportedClaims(
  rewritten: string,
  evidence: string[],
  options: FabricationOptions = {}
): FabricationFinding[] {
  const source = evidence.join("\n");
  const allowed = (options.allow || []).join("\n");
  const findings: FabricationFinding[] = [];

  const sourceNumbers = numbersIn(`${source}\n${allowed}`);
  for (const value of numbersIn(rewritten)) {
    if (!sourceNumbers.has(value)) findings.push({ kind: "number", value });
  }

  const sourceTerms = termsIn(`${source}\n${allowed}`);
  for (const value of termsIn(rewritten)) {
    // "A/B" is one term, but "SQL/Python" is a list: supported if every part is.
    const supported = sourceTerms.has(value) || (value.includes("/") && value.split("/").every((part) => sourceTerms.has(part)));
    if (!supported) findings.push({ kind: "term", value });
  }

  const wasSupportingRole = options.before === undefined
    || SUPPORTING_WORDS.some((word) => options.before!.includes(word));
  for (const word of OWNERSHIP_WORDS) {
    if (wasSupportingRole && rewritten.includes(word) && !source.includes(word)) {
      findings.push({ kind: "ownership", value: word });
    }
  }

  for (const word of MAGNITUDE_WORDS) {
    if (rewritten.includes(word) && !source.includes(word)) findings.push({ kind: "magnitude", value: word });
  }

  return findings;
}

export interface RewriteChange {
  before: string;
  after: string;
}

export interface FabricationReport {
  totalChanges: number;
  changesWithFindings: number;
  /** Share of changes that contain at least one unsupported claim. Target: 0. */
  fabricationRate: number;
  findings: Array<FabricationFinding & { change: number }>;
}

export function gradeRewrite(
  changes: RewriteChange[],
  evidence: string[],
  options: FabricationOptions = {}
): FabricationReport {
  const findings = changes.flatMap((change, index) =>
    findUnsupportedClaims(change.after, evidence, { ...options, before: change.before })
      .map((finding) => ({ ...finding, change: index })));
  const changesWithFindings = new Set(findings.map((finding) => finding.change)).size;
  return {
    totalChanges: changes.length,
    changesWithFindings,
    fabricationRate: changes.length ? changesWithFindings / changes.length : 0,
    findings
  };
}
