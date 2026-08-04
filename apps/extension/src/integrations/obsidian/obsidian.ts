import type { JobApplication } from "@/shared/types";
import { STAGE_LABELS } from "@/shared/types";

const DB_NAME = "offerflow-handles";
const STORE_NAME = "directory-handles";
const HANDLE_KEY = "obsidian-directory";

type DirectoryPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  };

type PermissionedDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function getStoredDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDb();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

export async function chooseObsidianDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = window as DirectoryPickerWindow;
  if (!picker.showDirectoryPicker) {
    throw new Error("当前浏览器不支持直接选择本地目录");
  }
  const handle = await picker.showDirectoryPicker({
    id: "offerflow-obsidian",
    mode: "readwrite"
  });
  await storeHandle(handle);
  return handle;
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permissionedHandle = handle as PermissionedDirectoryHandle;
  const permission = await permissionedHandle.queryPermission({ mode: "readwrite" });
  if (permission === "granted") return true;
  return (await permissionedHandle.requestPermission({ mode: "readwrite" })) === "granted";
}

function safeFilePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

function yamlValue(value?: string): string {
  if (!value) return '""';
  return JSON.stringify(value);
}

function managedMarkdown(job: JobApplication): string {
  const events = [...job.events]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map(
      (event) =>
        `- ${new Date(event.occurredAt).toLocaleString("zh-CN", {
          hour12: false
        })}：${event.title}`
    )
    .join("\n");

  const responsibilities =
    job.responsibilities.length > 0
      ? job.responsibilities.map((item) => `- ${item}`).join("\n")
      : "- 暂未提取";
  const requirements =
    job.requirements.length > 0
      ? job.requirements.map((item) => `- ${item}`).join("\n")
      : "- 暂未提取";

  return `---
offerflow_id: ${yamlValue(job.id)}
type: job-application
company: ${yamlValue(job.company)}
position: ${yamlValue(job.position)}
job_id: ${yamlValue(job.jobId)}
city: ${yamlValue(job.city)}
stage: ${yamlValue(job.stage)}
stage_label: ${yamlValue(STAGE_LABELS[job.stage])}
external_stage: ${yamlValue(job.externalStage)}
applied_at: ${yamlValue(job.appliedAt)}
deadline: ${yamlValue(job.deadline)}
next_action: ${yamlValue(job.nextAction)}
source_url: ${yamlValue(job.sourceUrl)}
created_at: ${yamlValue(job.createdAt)}
updated_at: ${yamlValue(job.updatedAt)}
---

# ${job.company}｜${job.position}

<!-- offerflow:start -->

## 当前进度

- 阶段：${STAGE_LABELS[job.stage]}
- 网站进度：${job.externalStage || "未提供"}
- 投递时间：${job.appliedAt || "未提供"}
- 下一步：${job.nextAction || "待确定"}
- 截止时间：${job.deadline || "未提供"}

## 岗位摘要

${job.summary || "暂未提取"}

## 岗位职责

${responsibilities}

## 任职要求

${requirements}

## 投递时间线

${events || "- 暂无事件"}

## 来源

- [原始岗位页面](${job.sourceUrl})

<!-- offerflow:end -->

## 我的准备笔记

在这里补充公司研究、面试准备和个人复盘。此区域不会被 OfferFlow 覆盖。
`;
}

async function readFile(fileHandle: FileSystemFileHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return file.text();
}

function mergeUserContent(existing: string, generated: string): string {
  const userHeading = "## 我的准备笔记";
  const existingIndex = existing.indexOf(userHeading);
  const generatedIndex = generated.indexOf(userHeading);
  if (existingIndex === -1 || generatedIndex === -1) return generated;
  return generated.slice(0, generatedIndex) + existing.slice(existingIndex);
}

export async function syncJobToObsidian(
  job: JobApplication,
  directory?: FileSystemDirectoryHandle | null
): Promise<string> {
  const handle = directory ?? (await getStoredDirectory());
  if (!handle) throw new Error("请先选择 Obsidian 中的岗位目录");
  if (!(await ensurePermission(handle))) throw new Error("没有目录写入权限");

  const filename =
    job.obsidianPath ||
    `${safeFilePart(job.company)}-${safeFilePart(job.position)}-${safeFilePart(
      job.jobId || job.id.slice(-6)
    )}.md`;
  const fileHandle = await handle.getFileHandle(filename, { create: true });

  let output = managedMarkdown(job);
  try {
    const existing = await readFile(fileHandle);
    if (existing.trim()) output = mergeUserContent(existing, output);
  } catch {
    // A newly created file has no user content to preserve.
  }

  const writable = await fileHandle.createWritable();
  await writable.write(output);
  await writable.close();
  return filename;
}

export function downloadBackup(jobs: JobApplication[], format: "json" | "csv"): void {
  let content: string;
  let mime: string;

  if (format === "json") {
    content = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), jobs }, null, 2);
    mime = "application/json";
  } else {
    const headers = [
      "id",
      "company",
      "position",
      "jobId",
      "city",
      "stage",
      "deadline",
      "nextAction",
      "sourceUrl",
      "updatedAt"
    ];
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    content = [
      headers.join(","),
      ...jobs.map((job) =>
        headers.map((key) => escape(job[key as keyof JobApplication])).join(",")
      )
    ].join("\n");
    mime = "text/csv;charset=utf-8";
  }

  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `offerflow-backup-${new Date().toISOString().slice(0, 10)}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
