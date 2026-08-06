// Tailored resume domain types.
// `ResumeData` is the flattened, JSON-safe document that flows between the
// background worker, the tailor review page and the printable HTML. Each
// `id` is stable across edits so the JD × Resume mapping contract (see the
// tailor-resume skill) can keep working when the candidate tweaks wording.

import type { PersonalProfile } from "@offerflow/domain";

export type ResumeSectionId =
  | "header"
  | "summary"
  | "education"
  | "experience"
  | "projects"
  | "campus"
  | "awards"
  | "skills"
  | "languages"
  | "publications"
  | "interests";

export interface ResumeHeader {
  name: string;
  headline: string;
  email: string;
  phone: string;
  city: string;
  links: { label: string; href: string }[];
}

export interface ResumeEducation {
  id: string;
  school: string;
  degree: string;
  major: string;
  start: string;
  end: string;
  gpa: string;
  rank: string;
  courses: string;
  highlights: string[];
}

export interface ResumeExperience {
  id: string;
  company: string;
  title: string;
  start: string;
  end: string;
  location: string;
  bullets: string[];
}

export interface ResumeProject {
  id: string;
  name: string;
  role: string;
  start: string;
  end: string;
  summary: string;
  bullets: string[];
  link: string;
}

export interface ResumeCampusExperience {
  id: string;
  type: string;
  role: string;
  start: string;
  end: string;
  description: string;
}

export interface ResumeAward {
  id: string;
  date: string;
  name: string;
  level: string;
}

export interface ResumeSkillGroup {
  id: string;
  label: string;
  items: string[];
}

export interface ResumeLanguage {
  id: string;
  name: string;
  level: string;
}

export interface ResumePublication {
  id: string;
  title: string;
  venue: string;
  date: string;
}

export interface ResumeData {
  targetRole: string;
  targetCompany: string;
  generatedAt: string;
  header: ResumeHeader;
  summary: string;
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  campus: ResumeCampusExperience[];
  awards: ResumeAward[];
  skills: ResumeSkillGroup[];
  languages: ResumeLanguage[];
  publications: ResumePublication[];
  interests: string[];
}

// JD × Resume mapping — each `map_id` is a stable handle so the review
// surface can highlight both directions when the candidate clicks a card.
export interface JdMapping {
  map_id: string;
  category:
    | "responsibility"
    | "requirement"
    | "differentiator"
    | "bonus"
    | "keyword";
  text: string;
  // Stable ids of resume blocks that satisfy this JD item.
  resume_ids: string[];
  // Original phrasing that came back from the LLM, kept for traceability.
  rationale?: string;
}

export interface JdAnalysis {
  source: "deepseek" | "fallback";
  responsibility: string[];
  must_haves: string[];
  differentiators: string[];
  bonus: string[];
  keywords: string[];
  mappings: JdMapping[];
}

export interface TailorContext {
  jobKey: string;
  company: string;
  position: string;
  city?: string;
  sourceUrl?: string;
  summary?: string;
  responsibilities: string[];
  requirements: string[];
  rawExcerpt?: string;
  deadline?: string;
  jobType?: string;
}

export interface TailoredResumeBundle {
  context: TailorContext;
  jd: JdAnalysis;
  resume: ResumeData;
  generatedAt: string;
  notes: string[];
  unsupportedClaims: string[];
}

export interface TailoredResumeEntry {
  jobKey: string;
  bundle: TailoredResumeBundle;
  savedAt: string;
  notes: string[];
}

export const EMPTY_RESUME: ResumeData = {
  targetRole: "",
  targetCompany: "",
  generatedAt: "",
  header: {
    name: "",
    headline: "",
    email: "",
    phone: "",
    city: "",
    links: []
  },
  summary: "",
  education: [],
  experience: [],
  projects: [],
  campus: [],
  awards: [],
  skills: [],
  languages: [],
  publications: [],
  interests: []
};

export function buildJobKey(context: Pick<TailorContext, "company" | "position" | "sourceUrl">) {
  const normalized = [
    context.company.trim().toLowerCase(),
    context.position.trim().toLowerCase(),
    (context.sourceUrl || "").trim()
  ].join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `tailor_${(hash >>> 0).toString(36)}`;
}

export function profileToResume(profile: PersonalProfile): ResumeData {
  const firstEducation = profile.education?.[0];
  const experiences = (profile.experiences || []).slice(0, 4);
  const projects = (profile.projects || []).slice(0, 4);
  return {
    targetRole: profile.targetRole || "",
    targetCompany: "",
    generatedAt: new Date().toISOString(),
    header: {
      name: profile.fullName || "",
      headline: profile.targetRole || "",
      email: profile.email || "",
      phone: profile.phone || "",
      city: profile.currentCity || profile.nativePlace || "",
      links: [
        profile.githubUrl ? { label: "GitHub", href: profile.githubUrl } : null,
        profile.portfolioUrl ? { label: "作品集", href: profile.portfolioUrl } : null,
        profile.specialty ? { label: profile.specialty, href: "" } : null
      ].filter(Boolean) as ResumeHeader["links"]
    },
    summary: profile.selfIntroduction || profile.strengths || "",
    education: firstEducation
      ? [
          {
            id: firstEducation.id || "edu-1",
            school: firstEducation.school || "",
            degree: firstEducation.educationDegree || firstEducation.degree || "",
            major: firstEducation.major || "",
            start: firstEducation.startDate || "",
            end: firstEducation.endDate || "",
            gpa: firstEducation.gpa || "",
            rank: firstEducation.rank || "",
            courses: firstEducation.courses || "",
            highlights: []
          }
        ]
      : [],
    experience: experiences.map((item) => ({
      id: item.id,
      company: item.organization || "",
      title: item.title || "",
      start: item.startDate || "",
      end: item.isCurrent ? "至今" : item.endDate || "",
      location: "",
      bullets: splitBullets(item.achievements || item.description || "")
    })),
    projects: projects.map((item) => ({
      id: item.id,
      name: item.name || "",
      role: item.role || "",
      start: item.startDate || "",
      end: item.endDate || "",
      summary: item.description || "",
      bullets: splitBullets(item.achievement || ""),
      link: item.link || ""
    })),
    campus: (profile.campusExperiences || []).slice(0, 3).map((item) => ({
      id: item.id,
      type: item.type || "",
      role: item.role || "",
      start: item.startDate || "",
      end: item.endDate || "",
      description: item.description || ""
    })),
    awards: (profile.awards || []).slice(0, 4).map((item) => ({
      id: item.id,
      date: item.date || "",
      name: item.name || "",
      level: item.level || ""
    })),
    skills: buildSkillGroups(profile),
    languages: (profile.languages || []).slice(0, 4).map((item) => ({
      id: item.id,
      name: item.name || "",
      level: item.score || item.englishLevel || item.proficiency || ""
    })),
    publications: (profile.publications || []).slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title || "",
      venue: item.journal || "",
      date: item.date || ""
    })),
    interests: splitBullets(profile.hobbies || "")
  };
}

function splitBullets(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[。；;\n]+/)
    .map((line) => line.replace(/^[\s\-•·●]+/, "").trim())
    .filter(Boolean);
}

function buildSkillGroups(profile: PersonalProfile): ResumeSkillGroup[] {
  const groups: ResumeSkillGroup[] = [];
  if (profile.computerSkills?.length) {
    groups.push({
      id: "skills-computer",
      label: "技术技能",
      items: profile.computerSkills.map((item) =>
        item.proficiency ? `${item.type}（${item.proficiency}）` : item.type
      )
    });
  }
  if (profile.languages?.length) {
    groups.push({
      id: "skills-language",
      label: "语言能力",
      items: profile.languages.map(
        (item) => item.name + (item.score ? ` · ${item.score}` : "")
      )
    });
  }
  if (profile.qualifications?.length) {
    groups.push({
      id: "skills-cert",
      label: "资格证书",
      items: profile.qualifications.map((item) => item.name)
    });
  }
  if (groups.length === 0) return groups;
  if (profile.specialty) {
    groups.push({
      id: "skills-other",
      label: "其他",
      items: [profile.specialty]
    });
  }
  return groups;
}