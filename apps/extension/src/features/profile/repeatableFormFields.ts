import type { FormFieldMatch, ProfileFieldKey } from "@/shared/types";

type RepeatGroup = NonNullable<FormFieldMatch["repeatGroup"]>;

const repeatableKeys: Record<RepeatGroup, ReadonlySet<ProfileFieldKey>> = {
  education: new Set<ProfileFieldKey>([
    "school", "major", "degree", "gpa", "educationStartDate", "educationEndDate",
    "educationCollege", "educationDegree", "educationForm", "educationCourses",
    "educationResearchDirection", "educationThesis", "educationRank", "overseasEducation",
    "minorMajor", "advisorName"
  ]),
  experience: new Set<ProfileFieldKey>([
    "experienceOrganization", "experienceTitle", "experienceStartDate", "experienceEndDate",
    "experienceDescription", "experienceType", "experienceDepartment", "experienceSalary",
    "experienceAchievements", "refereeName", "refereeTitle", "refereeContact", "leavingReason",
    "subordinateCount", "experienceCurrent"
  ]),
  project: new Set<ProfileFieldKey>([
    "projectName", "projectRole", "projectStartDate", "projectEndDate", "projectDescription",
    "projectAchievement", "projectLink"
  ]),
  campus: new Set<ProfileFieldKey>([
    "campusExperienceType", "campusExperienceRole", "campusExperienceStartDate",
    "campusExperienceEndDate", "campusExperienceDescription"
  ]),
  award: new Set<ProfileFieldKey>([
    "awardDate", "awardName", "awardLevel", "awardDescription"
  ])
};

export const repeatGroupForKey = (key?: ProfileFieldKey): RepeatGroup | undefined => {
  if (!key) return undefined;
  return (Object.keys(repeatableKeys) as RepeatGroup[]).find((group) => repeatableKeys[group].has(key));
};

const repeatGroupForField = (field: FormFieldMatch): RepeatGroup | undefined => {
  const semanticGroup = repeatGroupForKey(field.key);
  const section = field.section || "";
  const contextualGroup: RepeatGroup | undefined = /教育|学历|学业|education|academic/i.test(section)
    ? "education"
    : /工作|实习|任职|employment|work/i.test(section)
      ? "experience"
      : /项目|project/i.test(section)
        ? "project"
        : /在校|校园|campus/i.test(section)
          ? "campus"
          : /获奖|奖项|奖励|award/i.test(section)
            ? "award"
            : undefined;
  if (contextualGroup) return semanticGroup === contextualGroup ? semanticGroup : undefined;
  return field.repeatGroup || semanticGroup;
};

/**
 * Rebuild repeat indexes after rule/AI matching has finished.
 *
 * Some ATS pages expose one structural index for date controls and another for
 * text controls. AI-matched fields can also acquire a key after the content
 * script has already assigned indexes. The nth occurrence of the same semantic
 * field is the stable final authority: first company -> record 0, second company
 * -> record 1, and the same applies independently to title/date/description.
 */
export function normalizeRepeatableFormFields(fields: FormFieldMatch[]): FormFieldMatch[] {
  const entryCandidates = new Map<RepeatGroup, Map<string, { firstOrder: number; preferredIndex?: number }>>();
  fields.forEach((field, order) => {
    const group = repeatGroupForField(field);
    const fingerprint = field.repeatEntryFingerprint;
    if (!group || !fingerprint) return;
    const groupEntries = entryCandidates.get(group) || new Map<string, { firstOrder: number; preferredIndex?: number }>();
    const existing = groupEntries.get(fingerprint);
    const structuralIndex = field.repeatIndexSource !== "occurrence" && Number.isInteger(field.repeatIndex)
      ? field.repeatIndex
      : undefined;
    groupEntries.set(fingerprint, {
      firstOrder: Math.min(existing?.firstOrder ?? order, field.domOrder ?? order),
      preferredIndex: existing?.preferredIndex ?? structuralIndex
    });
    entryCandidates.set(group, groupEntries);
  });
  const entryIndexes = new Map<RepeatGroup, Map<string, number>>();
  for (const [group, candidates] of entryCandidates) {
    const sorted = Array.from(candidates.entries()).sort(([, left], [, right]) => {
      if (left.preferredIndex !== undefined && right.preferredIndex !== undefined) {
        return left.preferredIndex - right.preferredIndex || left.firstOrder - right.firstOrder;
      }
      if (left.preferredIndex !== undefined) return -1;
      if (right.preferredIndex !== undefined) return 1;
      return left.firstOrder - right.firstOrder;
    });
    entryIndexes.set(group, new Map(sorted.map(([fingerprint], index) => [fingerprint, index])));
  }

  const occurrences = new Map<string, number>();

  return fields.map((field) => {
    const group = repeatGroupForField(field);
    if (!group || !field.key) return field;
    const entryIndex = field.repeatEntryFingerprint
      ? entryIndexes.get(group)?.get(field.repeatEntryFingerprint)
      : undefined;
    if (entryIndex !== undefined) {
      return { ...field, repeatGroup: group, repeatIndex: entryIndex };
    }
    const counterKey = `${group}:${field.key}`;
    const repeatIndex = occurrences.get(counterKey) || 0;
    occurrences.set(counterKey, repeatIndex + 1);
    return { ...field, repeatGroup: group, repeatIndex };
  });
}
