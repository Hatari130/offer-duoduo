import { base64ToUint8Array } from "@/shared/binary";
import {
  updateResumeSourceAssets,
  type StoredResume
} from "@/infrastructure/storage/storage";
import {
  cloudErrorMessage,
  createCloudTailorTask,
  DEFAULT_CLOUD_WEB_URL,
  getCloudSyncOverview,
  loginAndSync
} from "@/infrastructure/sync/cloudSync";
import { cloudDataScope } from "@/infrastructure/sync/syncState";
import type { TailorContext } from "./types";

function webBaseUrlForApi(apiBaseUrl: string): string {
  const configured = import.meta.env.VITE_OFFERFLOW_WEB_URL?.trim();
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
  const overview = await getCloudSyncOverview();
  let connection = overview.connection;
  if (!connection || overview.requiresUploadConsent) {
    const connected = await loginAndSync();
    connection = connected.connection;
  }
  if (!connection) throw new Error("请先连接 JobKoI 官网账号后再定制简历");

  if (!window.confirm(`将“${sourceResume.name}”的简历字段和图片保存到 ${connection.user.email} 的网页定制工作台？\n\n网申专用字段、原文件及提取原文不会上传。进入网页后，点击 AI 定制才会将相关经历文本交给 AI 服务处理。`)) return;
  let created;
  try {
    created = await createCloudTailorTask(sourceResume.id, {
        company: context.company,
        position: context.position,
        city: context.city,
        sourceUrl: context.sourceUrl || "",
        summary: context.summary,
        responsibilities: context.responsibilities || [],
        requirements: context.requirements || []
      }, cloudDataScope({ userId: connection.user.id, apiBaseUrl: connection.apiBaseUrl })!, applicationId);
  } catch (error) {
    throw new Error(cloudErrorMessage(error, "创建简历定制任务失败，请重新登录后再试"));
  }
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
