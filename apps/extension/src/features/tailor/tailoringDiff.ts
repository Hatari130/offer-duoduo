import type { ResumeData } from "./types";

export interface ResumeTextChange {
  key: string;
  before: string;
  after: string;
}

export function collectResumeTextChanges(before: ResumeData, after: ResumeData): ResumeTextChange[] {
  const left = collectTailorableText(before);
  const right = collectTailorableText(after);
  const changes: ResumeTextChange[] = [];
  right.forEach((value, key) => {
    const previous = left.get(key);
    if (previous !== undefined && normalize(previous) !== normalize(value)) {
      changes.push({ key, before: previous, after: value });
    }
  });
  return changes;
}

function collectTailorableText(resume: ResumeData) {
  const values = new Map<string, string>();
  values.set("summary", resume.summary || "");
  resume.experience.forEach((entry) => entry.bullets.forEach((bullet, index) => {
    values.set(`experience.${entry.id}.bullet.${index}`, bullet);
  }));
  resume.projects.forEach((entry) => {
    values.set(`project.${entry.id}.summary`, entry.summary || "");
    entry.bullets.forEach((bullet, index) => values.set(`project.${entry.id}.bullet.${index}`, bullet));
  });
  resume.campus.forEach((entry) => values.set(`campus.${entry.id}.description`, entry.description || ""));
  resume.skills.forEach((entry) => entry.items.forEach((item, index) => {
    values.set(`skills.${entry.id}.${index}`, item);
  }));
  return values;
}

function normalize(value: string) {
  return String(value || "").replace(/\s+/g, "").trim();
}
