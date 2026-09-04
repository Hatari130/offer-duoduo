import type { ResumeTemplateRecord } from "@offerflow/contracts";
import type { StoredResume } from "../storage/storage.ts";

/** Merge the server's field-first resume library into extension storage.
 * Newer edits win, while server tombstones prevent a stale extension from
 * recreating a resume that the user deleted on the web. */
export function mergeRemoteResumeTemplates(
  library: StoredResume[],
  remoteTemplates: ResumeTemplateRecord[]
): StoredResume[] {
  const merged = new Map(library.map((resume) => [resume.id, resume]));

  for (const remote of remoteTemplates) {
    const current = merged.get(remote.id);
    if (remote.deletedAt) {
      if (!current || current.updatedAt.localeCompare(remote.updatedAt) <= 0) merged.delete(remote.id);
      continue;
    }
    if (current && current.updatedAt.localeCompare(remote.updatedAt) > 0) continue;
    const remoteDocument = remote.document;
    merged.set(remote.id, {
      ...current,
      id: remote.id,
      name: remote.name,
      kind: "base",
      versionNumber: current?.versionNumber || 1,
      lifecycleStatus: "active",
      sourceFileName: remote.sourceFileName || current?.sourceFileName,
      profile: remote.profile,
      assets: remoteDocument?.assets || current?.assets,
      portraitAssetId: remoteDocument?.portraitAssetId || current?.portraitAssetId,
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
      lastUsedAt: current?.lastUsedAt
    });
  }

  return [...merged.values()];
}
