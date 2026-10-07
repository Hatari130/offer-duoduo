import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PersonalProfile, TailorJobContext } from "@offerflow/domain";
import { createEmptyPersonalProfile } from "@offerflow/domain";

export interface ResumeCase {
  id: string;
  archetype: string;
  job: TailorJobContext;
  keywords: string[];
  resume: Partial<PersonalProfile>;
}

const datasets = join(dirname(fileURLToPath(import.meta.url)), "datasets");

export function readDataset<T>(name: string): T {
  return JSON.parse(readFileSync(join(datasets, name), "utf8")) as T;
}

export function loadResumeCases(): ResumeCase[] {
  return readDataset<{ cases: ResumeCase[] }>("resume-tailor.json").cases;
}

/** Fill the fields a dataset case leaves out so it is a complete PersonalProfile. */
export function profileFor(resume: Partial<PersonalProfile>): PersonalProfile {
  return {
    ...createEmptyPersonalProfile(),
    ...resume,
    experiences: (resume.experiences || []).map((entry) => ({ kind: "internship", ...entry })),
    projects: resume.projects || [],
    campusExperiences: resume.campusExperiences || []
  } as PersonalProfile;
}

/** Whole-number match: "300" must not count inside "2300" or "3000". */
export function mentions(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = /^\d/.test(token) ? "(?<![\\d.])" : "";
  const after = /\d$/.test(token) ? "(?![\\d])" : "";
  return new RegExp(`${before}${escaped}${after}`).test(text);
}
