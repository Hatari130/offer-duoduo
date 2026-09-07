import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyPersonalProfile,
  toCloudResumeProfile,
  toCloudResumeDocument,
  mergeCloudResumeProfile
} from "../../domain/src/index.ts";
import { sanitizeResumeTemplate, sanitizeTailorTaskRequest } from "../src/resumes.ts";

function localProfile() {
  return {
    ...createEmptyPersonalProfile(), fullName: "Visible name", phone: "13900000000",
    idNumber: "PRIVATE_ID", healthStatus: "PRIVATE_HEALTH", birthDate: "PRIVATE_BIRTH",
    address: "PRIVATE_ADDRESS", familyMembers: [{ name: "PRIVATE_FAMILY" }],
    emergencyContactPhone: "PRIVATE_CONTACT", extraFields: { surprise: "PRIVATE_EXTRA" },
    unexpected: "PRIVATE_UNKNOWN",
    education: [{ id: "edu", school: "School", major: "Major", degree: "Bachelor", startDate: "2020", endDate: "2024", gpa: "3.8", advisorName: "PRIVATE_ADVISOR", unexpected: "PRIVATE_NESTED" }],
    experiences: [{ id: "exp", organization: "Company", title: "Engineer", startDate: "2024", endDate: "", description: "Shipped a product", kind: "work", salary: "PRIVATE_SALARY", refereeContact: "PRIVATE_REFEREE", contentBlocks: [{ id: "block", kind: "bullet", text: "Shipped a product", evidence: [{ source: "pdf", sourceText: "PRIVATE_EVIDENCE" }], inline: [{ text: "Shipped a product", bold: true, href: "https://example.com", extra: "PRIVATE_RUN" }] }] }],
    qualifications: [{ id: "cert", name: "Public certificate", date: "2024", number: "PRIVATE_SERIAL", description: "Public description", hidden: "PRIVATE_CERT" }]
  };
}

test("cloud projection uses a recursive allowlist and leaves the source untouched", () => {
  const local = localProfile();
  const snapshot = structuredClone(local);
  const safe = toCloudResumeProfile(local);
  assert.equal(JSON.stringify(safe).includes("PRIVATE_"), false);
  assert.equal(safe.fullName, local.fullName);
  assert.equal(safe.phone, local.phone);
  assert.equal(safe.experiences[0].kind, "work");
  assert.deepEqual(safe.experiences[0].contentBlocks[0].inline, [{ text: "Shipped a product", bold: true, href: "https://example.com" }]);
  assert.deepEqual(local, snapshot);
  safe.experiences[0].title = "Changed remotely";
  assert.equal(local.experiences[0].title, "Engineer");
});

test("cloud merge preserves local-only top-level and nested application fields", () => {
  const local = localProfile();
  const remote = { ...localProfile(), fullName: "Remote edit", idNumber: "ATTACK", experiences: [{ ...local.experiences[0], title: "New title", salary: "ATTACK", refereeContact: "ATTACK" }] };
  const merged = mergeCloudResumeProfile(local, remote);
  assert.equal(merged.fullName, "Remote edit");
  assert.equal(merged.idNumber, "PRIVATE_ID");
  assert.equal(merged.address, "PRIVATE_ADDRESS");
  assert.equal(merged.birthDate, "PRIVATE_BIRTH");
  assert.deepEqual(merged.familyMembers, local.familyMembers);
  assert.deepEqual(merged.extraFields, local.extraFields);
  assert.equal(merged.experiences[0].title, "New title");
  assert.equal(merged.experiences[0].salary, "PRIVATE_SALARY");
  assert.equal(merged.experiences[0].refereeContact, "PRIVATE_REFEREE");
  assert.equal(merged.qualifications[0].number, "PRIVATE_SERIAL");
  const fresh = mergeCloudResumeProfile(undefined, remote);
  assert.equal(fresh.idNumber, undefined);
  assert.equal(fresh.experiences[0].salary, undefined);
});

test("document projection strips raw evidence, nested metadata and unsafe asset/link payloads", () => {
  const doc = toCloudResumeDocument({
    schemaVersion: 1, id: "doc", title: "Resume", profile: localProfile(),
    sourceEvidence: { fileName: "PRIVATE_FILE", rawText: "PRIVATE_RAW", unclassifiedText: "PRIVATE_UNCLASSIFIED" },
    sourcePdf: { base64: "PRIVATE_PDF" },
    template: { privateMetadata: "PRIVATE_TEMPLATE", templateId: "compact", accentColor: "#123456" },
    assets: [
      { id: "portrait", kind: "portrait", dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", width: 1, height: 1, source: "upload", extra: "PRIVATE_ASSET" },
      { id: "svg", kind: "image", dataUrl: "data:image/svg+xml;base64,AA==", mimeType: "image/svg+xml", width: 1, height: 1, source: "upload" }
    ],
    portraitAssetId: "portrait", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z"
  });
  assert.equal(JSON.stringify(doc).includes("PRIVATE_"), false);
  assert.equal(doc.sourceEvidence, undefined);
  assert.equal(doc.assets.length, 1);
  assert.equal(doc.portraitAssetId, "portrait");
  assert.equal(doc.template.templateId, "compact");
  assert.equal(doc.template.accentColor, "#123456");
  const malicious = localProfile();
  malicious.experiences[0].contentBlocks[0].inline[0].href = "javascript:alert(1)";
  assert.equal(toCloudResumeProfile(malicious).experiences[0].contentBlocks[0].inline[0].href, undefined);
});

test("old deleted templates are reduced to empty compatibility tombstones", () => {
  const tombstone = sanitizeResumeTemplate({ id: "deleted", name: "PRIVATE_NAME", sourceFileName: "PRIVATE_FILE", profile: localProfile(), document: { profile: localProfile() }, createdAt: "2026-01-01", updatedAt: "2026-01-02", deletedAt: "2026-01-02" });
  assert.equal(JSON.stringify(tombstone).includes("PRIVATE_"), false);
  assert.equal(tombstone.name, "");
  assert.equal(tombstone.document, undefined);
  assert.equal(tombstone.profile.fullName, "");
  assert.equal(tombstone.deletedAt, "2026-01-02");
});

test("tailor task projection rejects every raw source-text channel", () => {
  const safe = sanitizeTailorTaskRequest({ sourceResumeId: "resume", sourceResumeName: "Public resume", sourceProfile: localProfile(), sourceEvidence: { rawText: "PRIVATE_RAW" }, extra: "PRIVATE_ROOT", job: { company: "Company", position: "Role", sourceUrl: "", responsibilities: ["Public task"], requirements: [], rawExcerpt: "PRIVATE_EXCERPT", extra: "PRIVATE_JOB" } });
  assert.equal(JSON.stringify(safe).includes("PRIVATE_"), false);
  assert.equal(safe.sourceProfile.fullName, "Visible name");
  assert.deepEqual(safe.job.responsibilities, ["Public task"]);
});
