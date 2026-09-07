import {
  createEmptyPersonalProfile,
  type PersonalProfile,
  type ProfileEducation,
  type ProfileExperience,
  type ProfileProject,
  type ProfileCampusExperience,
  type ProfileAward,
  type ResumeContentBlock
} from "./profile.ts";
import {
  DEFAULT_RESUME_TEMPLATE,
  RESUME_SECTIONS,
  RESUME_STUDIO_SECTIONS,
  type ResumeAsset,
  type ResumeDocument,
  type ResumeTemplateSettings
} from "./resumes.ts";

/** Explicit upload boundary. Adding a field to PersonalProfile must NOT add it
 * to cloud storage. Free text in these resume fields is user-authored content;
 * this is a schema boundary, not a claim to detect all PII in arbitrary prose. */
export const CLOUD_RESUME_TEXT_FIELDS = [
  "fullName", "phone", "email", "graduationDate", "currentCity", "targetRole",
  "targetCities", "portfolioUrl", "githubUrl", "selfIntroduction", "strengths"
] as const;

const EDUCATION_FIELDS = [
  "id", "school", "college", "major", "degree", "educationDegree", "courses",
  "researchDirection", "thesis", "rank", "minorMajor", "startDate", "endDate", "gpa"
] as const;
const EXPERIENCE_FIELDS = [
  "id", "organization", "title", "type", "department", "startDate", "endDate",
  "description", "achievements"
] as const;
const PROJECT_FIELDS = ["id", "name", "role", "startDate", "endDate", "description", "achievement", "link"] as const;
const CAMPUS_FIELDS = ["id", "type", "role", "startDate", "endDate", "description"] as const;
const AWARD_FIELDS = ["id", "date", "name", "level", "description"] as const;
const LANGUAGE_FIELDS = ["id", "name", "certificate", "englishLevel", "score", "proficiency", "listeningSpeaking", "readingWriting"] as const;
// Certificate serial numbers are application-only, unlike the certificate name.
const QUALIFICATION_FIELDS = ["id", "date", "name", "description"] as const;
const COMPUTER_FIELDS = ["id", "name", "level", "proficiency", "description"] as const;

export type CloudResumeProfile = Pick<PersonalProfile, typeof CLOUD_RESUME_TEXT_FIELDS[number]> & {
  education: Pick<ProfileEducation, typeof EDUCATION_FIELDS[number]>[];
  experiences: (Pick<ProfileExperience, typeof EXPERIENCE_FIELDS[number] | "kind" | "isCurrent"> & { contentBlocks?: ResumeContentBlock[] })[];
  projects: (Pick<ProfileProject, typeof PROJECT_FIELDS[number]> & { contentBlocks?: ResumeContentBlock[] })[];
  campusExperiences: (Pick<ProfileCampusExperience, typeof CAMPUS_FIELDS[number]> & { contentBlocks?: ResumeContentBlock[] })[];
  awards: ProfileAward[];
  languages?: Record<typeof LANGUAGE_FIELDS[number], string>[];
  qualifications?: Record<typeof QUALIFICATION_FIELDS[number], string>[];
  computerSkills?: Record<typeof COMPUTER_FIELDS[number], string>[];
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings<K extends string>(value: unknown, keys: readonly K[]): Record<K, string> {
  const input = record(value);
  return Object.fromEntries(keys.map(key => [key, text(input[key])])) as Record<K, string>;
}

function entries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, 200).map(record) : [];
}

function webUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? value : undefined;
  } catch { return undefined; }
}

/** Never copy sourceText/evidence or unknown properties from parsed blocks. */
export function toCloudResumeBlocks(value: unknown, depth = 0): ResumeContentBlock[] {
  if (depth >= 8) return [];
  return entries(value).flatMap(item => {
    if (!["paragraph", "bullet", "project"].includes(text(item.kind))) return [];
    const block: ResumeContentBlock = {
      id: text(item.id),
      kind: item.kind as ResumeContentBlock["kind"]
    };
    for (const key of ["text", "label", "title"] as const) {
      if (typeof item[key] === "string") block[key] = item[key];
    }
    if (Array.isArray(item.children)) block.children = toCloudResumeBlocks(item.children, depth + 1);
    if (Array.isArray(item.inline)) {
      block.inline = entries(item.inline).map(run => ({
        text: text(run.text),
        ...(run.bold === true ? { bold: true } : {}),
        ...(webUrl(run.href) ? { href: webUrl(run.href) } : {})
      }));
    }
    if (Number.isSafeInteger(item.listOrder) && Number(item.listOrder) > 0) block.listOrder = Number(item.listOrder);
    return [block];
  });
}

export function toCloudResumeProfile(value: unknown): CloudResumeProfile {
  const input = record(value);
  const blocks = (item: Record<string, unknown>) => Array.isArray(item.contentBlocks)
    ? { contentBlocks: toCloudResumeBlocks(item.contentBlocks) } : {};
  return {
    ...strings(input, CLOUD_RESUME_TEXT_FIELDS),
    education: entries(input.education).map(item => strings(item, EDUCATION_FIELDS)),
    experiences: entries(input.experiences).map(item => ({
      ...strings(item, EXPERIENCE_FIELDS),
      ...(item.kind === "work" || item.kind === "internship" ? { kind: item.kind } : {}),
      ...(typeof item.isCurrent === "boolean" ? { isCurrent: item.isCurrent } : {}),
      ...blocks(item)
    })),
    projects: entries(input.projects).map(item => ({ ...strings(item, PROJECT_FIELDS), ...blocks(item) })),
    campusExperiences: entries(input.campusExperiences).map(item => ({ ...strings(item, CAMPUS_FIELDS), ...blocks(item) })),
    awards: entries(input.awards).map(item => strings(item, AWARD_FIELDS)),
    ...(Array.isArray(input.languages) ? { languages: entries(input.languages).map(item => strings(item, LANGUAGE_FIELDS)) } : {}),
    ...(Array.isArray(input.qualifications) ? { qualifications: entries(input.qualifications).map(item => strings(item, QUALIFICATION_FIELDS)) } : {}),
    ...(Array.isArray(input.computerSkills) ? { computerSkills: entries(input.computerSkills).map(item => strings(item, COMPUTER_FIELDS)) } : {})
  };
}

/** Local/editor adapter. Excluded required fields are empty, never copied. */
export function cloudResumeToPersonalProfile(value: unknown): PersonalProfile {
  return { ...createEmptyPersonalProfile(), ...toCloudResumeProfile(value) };
}

/** A cloud edit may change resume content, but cannot clear or overwrite local
 * application-only fields (including nested salary/referee/certificate data). */
export function mergeCloudResumeProfile(local: PersonalProfile | undefined, remote: unknown): PersonalProfile {
  const safe = toCloudResumeProfile(remote);
  const result: PersonalProfile = { ...createEmptyPersonalProfile(), ...structuredClone(local || {}), ...safe };
  const mergeEntries = <T extends { id?: string }>(prior: T[] | undefined, next: T[]): T[] => {
    const byId = new Map((prior || []).filter(item => item.id).map(item => [item.id, item]));
    return next.map(item => ({ ...structuredClone(byId.get(item.id)), ...item }));
  };
  result.education = mergeEntries(local?.education, safe.education);
  result.experiences = mergeEntries(local?.experiences, safe.experiences);
  result.projects = mergeEntries(local?.projects, safe.projects);
  result.campusExperiences = mergeEntries(local?.campusExperiences, safe.campusExperiences);
  if (safe.qualifications) result.qualifications = mergeEntries(local?.qualifications, safe.qualifications);
  if (safe.languages) result.languages = mergeEntries(local?.languages, safe.languages);
  if (safe.computerSkills) result.computerSkills = mergeEntries(local?.computerSkills, safe.computerSkills);
  return result;
}

/** Only raster data URLs; do not accept remote URLs, SVG or extra metadata. */
export function toCloudResumeAssets(value: unknown): ResumeAsset[] {
  return entries(value).flatMap(item => {
    const mimeType = text(item.mimeType);
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType)
      || !text(item.dataUrl).startsWith(`data:${mimeType};base64,`)
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(text(item.dataUrl).split(",")[1] || "")
      || !Number.isFinite(item.width) || !Number.isFinite(item.height)
      || Number(item.width) <= 0 || Number(item.height) <= 0) return [];
    return [{
      id: text(item.id),
      kind: item.kind === "portrait" ? "portrait" : "image",
      dataUrl: text(item.dataUrl),
      mimeType,
      width: Number(item.width),
      height: Number(item.height),
      source: item.source === "pdf" ? "pdf" : "upload"
    }];
  });
}

function cloudTemplateSettings(value: unknown): ResumeTemplateSettings {
  const input = record(value);
  const allowed = <T extends string>(value: unknown, keys: readonly T[]): T[] =>
    Array.isArray(value) ? [...new Set(value.filter((key): key is T => keys.includes(key as T)))] : [];
  return {
    ...structuredClone(DEFAULT_RESUME_TEMPLATE),
    templateId: input.templateId === "editorial" || input.templateId === "compact" ? input.templateId : "clarity",
    accentColor: /^#[\da-f]{6}$/i.test(text(input.accentColor)) ? text(input.accentColor) : DEFAULT_RESUME_TEMPLATE.accentColor,
    pageLimit: input.pageLimit === 2 ? 2 : 1,
    sectionOrder: Array.isArray(input.sectionOrder) ? allowed(input.sectionOrder, RESUME_SECTIONS) : [...RESUME_SECTIONS],
    hiddenSections: allowed(input.hiddenSections, RESUME_SECTIONS),
    ...(Array.isArray(input.studioSectionOrder) ? { studioSectionOrder: allowed(input.studioSectionOrder, RESUME_STUDIO_SECTIONS) } : {}),
    ...(Array.isArray(input.hiddenExperienceKinds) ? { hiddenExperienceKinds: allowed(input.hiddenExperienceKinds, ["work", "internship"] as const) } : {})
  };
}

/** Rebuild rather than spread: old clients may submit raw sourceEvidence,
 * extra profile properties, or arbitrary document/template metadata. */
export function toCloudResumeDocument(value: unknown): ResumeDocument {
  const input = record(value);
  const assets = toCloudResumeAssets(input.assets);
  return {
    schemaVersion: 1,
    id: text(input.id),
    title: text(input.title),
    profile: cloudResumeToPersonalProfile(input.profile),
    template: cloudTemplateSettings(input.template),
    ...(assets.length ? { assets } : {}),
    ...(assets.some(asset => asset.id === input.portraitAssetId) ? { portraitAssetId: text(input.portraitAssetId) } : {}),
    createdAt: text(input.createdAt),
    updatedAt: text(input.updatedAt)
  };
}
