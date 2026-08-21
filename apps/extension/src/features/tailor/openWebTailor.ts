import { createApiClient } from "@offerflow/api-client";
import { base64ToUint8Array } from "@/shared/binary";
import {
  updateResumeSourceAssets,
  type StoredResume
} from "@/infrastructure/storage/storage";
import {
  DEFAULT_CLOUD_WEB_URL,
  loginAndSync
} from "@/infrastructure/sync/cloudSync";
import { loadCloudConnection } from "@/infrastructure/sync/syncState";
import type { TailorContext } from "./types";

function webBaseUrlForApi(apiBaseUrl: string): string {
  const configured = import.meta.env.VITE_WEB_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const api = new URL(apiBaseUrl);
  if ((api.hostname === "127.0.0.1" || api.hostname === "localhost") && api.port === "8787") {
    return DEFAULT_CLOUD_WEB_URL;
  }
  return `${api.protocol}//${api.host}`;
}

export async function openWebTailorWorkspace(
  context: TailorContext,
  sourceResume: StoredResume,
  applicationId?: string
): Promise<void> {
  let sourceAssets = sourceResume.assets;
  let sourcePortraitAssetId = sourceResume.portraitAssetId;
  if (!sourceAssets?.length && sourceResume.sourcePdf?.base64) {
    try {
      const { extractResumePdfAssets } = await import("@/features/profile/resumeParser");
      const bytes = base64ToUint8Array(sourceResume.sourcePdf.base64);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const extracted = await extractResumePdfAssets(buffer);
      sourceAssets = extracted.assets;
      sourcePortraitAssetId = extracted.portraitAssetId;
      await updateResumeSourceAssets(sourceResume.id, sourceAssets, sourcePortraitAssetId);
    } catch {
      // The source PDF remains available; the website still offers manual photo upload.
    }
  }
  let connection = await loadCloudConnection();
  if (!connection) {
    const connected = await loginAndSync();
    connection = connected.connection;
  }
  if (!connection) throw new Error("请先连接 OfferFlow 官网账号后再定制简历");

  const client = createApiClient({
    baseUrl: connection.apiBaseUrl,
    getAccessToken: () => connection!.accessToken
  });
  const created = await client.resumes.createTailorTask({
    sourceResumeId: sourceResume.id,
    sourceResumeName: sourceResume.name,
    sourceProfile: sourceResume.profile,
    sourceAssets,
    sourcePortraitAssetId,
    sourceEvidence: {
      fileName: sourceResume.source?.fileName || sourceResume.sourceFileName || sourceResume.name,
      rawText: sourceResume.parse?.sourceText,
      unclassifiedText: sourceResume.parse?.unclassifiedText,
      parseCoverage: sourceResume.parse?.coverage,
      parserVersion: sourceResume.parse?.parserVersion,
      warnings: sourceResume.parse?.warnings
    },
    applicationId,
    job: {
      company: context.company,
      position: context.position,
      city: context.city,
      sourceUrl: context.sourceUrl || "",
      summary: context.summary,
      responsibilities: context.responsibilities || [],
      requirements: context.requirements || [],
      rawExcerpt: context.rawExcerpt
    }
  });
  const target = new URL(
    `/app/resumes/tailor/${encodeURIComponent(created.task.id)}`,
    webBaseUrlForApi(connection.apiBaseUrl)
  );
  target.searchParams.set("handoff", created.handoff.code);

  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    await chrome.tabs.create({ url: target.toString() });
    return;
  }
  window.open(target.toString(), "_blank", "noopener,noreferrer");
}
