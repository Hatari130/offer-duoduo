import {
  RESUME_SECTIONS,
  RESUME_STUDIO_SECTIONS,
  type ProfileExperienceKind,
  type ResumeSectionKey,
  type ResumeStudioSectionKey,
  type ResumeTemplateSettings
} from "@offerflow/domain";

const experienceKinds = new Set<ResumeStudioSectionKey>(["internship", "work"]);

function expandLegacyOrder(order: readonly ResumeSectionKey[]): ResumeStudioSectionKey[] {
  return order.flatMap(section => section === "experience" ? ["internship", "work"] : [section]);
}

export function normalizeStudioSectionOrder(template: ResumeTemplateSettings): ResumeStudioSectionKey[] {
  const legacy = expandLegacyOrder(template.sectionOrder?.length ? template.sectionOrder : RESUME_SECTIONS);
  const requested = template.studioSectionOrder?.length ? template.studioSectionOrder : legacy;
  const allowed = new Set<ResumeStudioSectionKey>(RESUME_STUDIO_SECTIONS);
  return [...new Set([...requested.filter(section => allowed.has(section)), ...legacy, ...RESUME_STUDIO_SECTIONS])];
}

export function hiddenExperienceKinds(template: ResumeTemplateSettings): Set<ProfileExperienceKind> {
  return new Set(template.hiddenExperienceKinds ?? ["work"]);
}

export function isStudioSectionHidden(template: ResumeTemplateSettings, section: ResumeStudioSectionKey): boolean {
  if (experienceKinds.has(section)) {
    return template.hiddenSections?.includes("experience")
      || hiddenExperienceKinds(template).has(section as ProfileExperienceKind);
  }
  return template.hiddenSections?.includes(section as ResumeSectionKey) || false;
}

export function toggleStudioSectionHidden(
  template: ResumeTemplateSettings,
  section: ResumeStudioSectionKey
): Pick<ResumeTemplateSettings, "hiddenSections" | "hiddenExperienceKinds"> {
  const hiddenSections = new Set(template.hiddenSections || []);
  const hiddenKinds = hiddenExperienceKinds(template);
  if (experienceKinds.has(section)) {
    const kind = section as ProfileExperienceKind;
    if (isStudioSectionHidden(template, section)) {
      const legacyHidden = hiddenSections.delete("experience");
      hiddenKinds.delete(kind);
      if (legacyHidden) hiddenKinds.add(kind === "work" ? "internship" : "work");
    } else {
      hiddenKinds.add(kind);
    }
  } else {
    const legacySection = section as ResumeSectionKey;
    hiddenSections.has(legacySection) ? hiddenSections.delete(legacySection) : hiddenSections.add(legacySection);
  }
  return { hiddenSections: [...hiddenSections], hiddenExperienceKinds: [...hiddenKinds] };
}

export function moveStudioSection(
  template: ResumeTemplateSettings,
  section: ResumeStudioSectionKey,
  direction: -1 | 1
): ResumeStudioSectionKey[] {
  const order = normalizeStudioSectionOrder(template);
  const index = order.indexOf(section);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return order;
  [order[index], order[target]] = [order[target]!, order[index]!];
  return order;
}
