import type { PersonalProfile, ResumeContentBlock } from "./profile.ts";

export const RESUME_SECTIONS = [
  "summary",
  "education",
  "experience",
  "projects",
  "campus",
  "awards",
  "skills"
] as const;

export type ResumeSectionKey = (typeof RESUME_SECTIONS)[number];

export interface ResumeTemplateSettings {
  templateId: ResumeTemplateId;
  accentColor: string;
  pageSize: "A4";
  pageLimit: 1 | 2;
  sectionOrder: ResumeSectionKey[];
  hiddenSections: ResumeSectionKey[];
}

export type ResumeTemplateId = "clarity" | "editorial" | "compact";

export interface ResumeTemplateDefinition {
  id: ResumeTemplateId;
  name: string;
  description: string;
  bestFor: string;
}

export const RESUME_TEMPLATES: readonly ResumeTemplateDefinition[] = [
  { id: "clarity", name: "清晰", description: "现代单栏，层级清楚", bestFor: "产品、技术、运营" },
  { id: "editorial", name: "编辑部", description: "克制衬线，强调经历叙事", bestFor: "研究、咨询、品牌" },
  { id: "compact", name: "紧凑", description: "高密度单栏，容量更高", bestFor: "经历丰富、两页简历" }
] as const;

export interface ResumeDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  profile: PersonalProfile;
  template: ResumeTemplateSettings;
  /** Binary visual assets are kept outside the semantic profile so AI can
   * never rewrite or discard them while tailoring copy. */
  assets?: ResumeAsset[];
  portraitAssetId?: string;
  sourceEvidence?: ResumeSourceEvidence;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeAsset {
  id: string;
  kind: "portrait" | "image";
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  source: "pdf" | "upload";
  sourcePage?: number;
  sourceBox?: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

export interface ResumeSourceEvidence {
  fileName: string;
  rawText?: string;
  unclassifiedText?: string;
  parseCoverage?: number;
  parserVersion?: string;
  warnings?: string[];
}

export type ResumeVersionStatus = "draft" | "reviewed" | "exported" | "applied" | "archived";

export interface ResumeVersion {
  id: string;
  tailorTaskId: string;
  sourceResumeId: string;
  sourceResumeName: string;
  applicationId?: string;
  company: string;
  position: string;
  document: ResumeDocument;
  status: ResumeVersionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TailorJobContext {
  company: string;
  position: string;
  city?: string;
  sourceUrl: string;
  summary?: string;
  responsibilities: string[];
  requirements: string[];
  rawExcerpt?: string;
}

export type TailorTaskStatus = "draft" | "generating" | "ready" | "failed";

export interface TailorTask {
  id: string;
  sourceResumeId: string;
  applicationId?: string;
  job: TailorJobContext;
  sourceEvidence?: ResumeSourceEvidence;
  versionId: string;
  status: TailorTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeTailorChange {
  id: string;
  field: string;
  label: string;
  before: string;
  after: string;
  reason: string;
}

export interface ResumeTailorProposal {
  profile: PersonalProfile;
  changes: ResumeTailorChange[];
  provider: string;
  generatedAt: string;
}

export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateSettings = {
  templateId: "clarity",
  accentColor: "#ad6042",
  pageSize: "A4",
  pageLimit: 1,
  sectionOrder: [...RESUME_SECTIONS],
  hiddenSections: []
};

const PROJECT_HEADING = /^项目(?:[一二三四五六七八九十]|\d+)[\s、.．:：-]*(.+)$/i;
const EXPLICIT_BULLET = /^[\s•·●○▪▫■□◆◇▶►➤➢✓✔☑☆★※→—–-]+/;
const LABELED_POINT = /^([^:：\n]{2,18})[:：]\s*(.+)$/;
const ACTION_START = /^(?:负责|主导|参与|协助|设计|搭建|构建|开发|实现|优化|推动|制定|建立|完成|落地|上线|运营|分析|调研|验证|迭代|规范|对接|管理|组织|策划|撰写|输出|支持|独立|基于|通过|围绕|针对|agent|skill|rag|llm)/i;
const TERMINAL_PUNCTUATION = /[。！？!?；;：:]$/;

function blockId(entryId: string, path: string): string {
  return `${entryId}:${path}`.replace(/[^\w\u3400-\u9fff:-]+/g, "-");
}

function cleanLine(value: string): { text: string; explicitBullet: boolean } {
  const trimmed = value.trim();
  const explicitBullet = EXPLICIT_BULLET.test(trimmed);
  return { text: trimmed.replace(EXPLICIT_BULLET, "").trim(), explicitBullet };
}

/** Convert legacy textarea content into semantic blocks without treating every
 * PDF visual line wrap (or semicolon) as a bullet. */
export function parseResumeContentBlocks(value: string, entryId = "entry"): ResumeContentBlock[] {
  const source = value.replace(/\r\n?/g, "\n").split("\n").map(cleanLine).filter((line) => line.text);
  const blocks: ResumeContentBlock[] = [];
  let activeProject: ResumeContentBlock | undefined;

  const target = () => activeProject?.children || blocks;
  const append = (block: ResumeContentBlock) => target().push(block);

  source.forEach((line, index) => {
    const project = line.text.match(PROJECT_HEADING);
    if (project) {
      activeProject = {
        id: blockId(entryId, `project-${blocks.length + 1}`),
        kind: "project",
        title: project[1]?.trim() || line.text,
        children: []
      };
      blocks.push(activeProject);
      return;
    }

    const label = line.text.match(LABELED_POINT);
    const current = target();
    const previous = current.at(-1);
    const shouldJoinWrappedLine = Boolean(
      previous?.kind !== "project" &&
      previous?.text &&
      !TERMINAL_PUNCTUATION.test(previous.text) &&
      !line.explicitBullet &&
      !label &&
      !ACTION_START.test(line.text)
    );
    if (shouldJoinWrappedLine && previous) {
      previous.text = `${previous.text}${/^[,，.。;；:：]/.test(line.text) ? "" : " "}${line.text}`;
      return;
    }

    const isProjectOverview = Boolean(activeProject && !current.length && !line.explicitBullet && !label);
    const kind: ResumeContentBlock["kind"] = isProjectOverview
      ? "paragraph"
      : line.explicitBullet || Boolean(label) || ACTION_START.test(line.text) ? "bullet" : "paragraph";
    append({
      id: blockId(entryId, `${activeProject ? `project-${blocks.length}` : "root"}-${index + 1}`),
      kind,
      label: label?.[1]?.trim(),
      text: label?.[2]?.trim() || line.text
    });
  });

  return blocks;
}

export function serializeResumeContentBlocks(blocks: ResumeContentBlock[]): string {
  const lines: string[] = [];
  const visit = (items: ResumeContentBlock[]) => {
    for (const block of items) {
      if (block.kind === "project") {
        if (block.title?.trim()) lines.push(block.title.trim());
        visit(block.children || []);
      } else if (block.text?.trim()) {
        lines.push(`${block.label?.trim() ? `${block.label.trim()}：` : ""}${block.text.trim()}`);
      }
    }
  };
  visit(blocks);
  return lines.join("\n");
}

function hydrateEntry<T extends { id: string; description: string; contentBlocks?: ResumeContentBlock[] }>(entry: T): T {
  return {
    ...entry,
    contentBlocks: entry.contentBlocks?.length
      ? structuredClone(entry.contentBlocks)
      : parseResumeContentBlocks(entry.description, entry.id)
  };
}

export function hydrateResumeProfileSemantics(profile: PersonalProfile): PersonalProfile {
  return {
    ...structuredClone(profile),
    experiences: profile.experiences.map(hydrateEntry),
    projects: profile.projects.map(hydrateEntry),
    campusExperiences: profile.campusExperiences.map(hydrateEntry)
  };
}

export function createResumeDocument(input: {
  id: string;
  title: string;
  profile: PersonalProfile;
  assets?: ResumeAsset[];
  portraitAssetId?: string;
  sourceEvidence?: ResumeSourceEvidence;
  now?: string;
}): ResumeDocument {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: 1,
    id: input.id,
    title: input.title,
    profile: hydrateResumeProfileSemantics(input.profile),
    template: structuredClone(DEFAULT_RESUME_TEMPLATE),
    assets: input.assets ? structuredClone(input.assets) : undefined,
    portraitAssetId: input.portraitAssetId
      || input.assets?.find((asset) => asset.kind === "portrait")?.id,
    sourceEvidence: input.sourceEvidence ? structuredClone(input.sourceEvidence) : undefined,
    createdAt: now,
    updatedAt: now
  };
}
