/** Only storage-capacity errors allow autofill to proceed with the in-memory draft. */
export function profileStorageWarning(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message
    : typeof error === "string" ? error
    : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (/FILE_ERROR_NO_SPACE|\bENOSPC\b|no space left on device|disk (?:is )?full/i.test(message)) {
    return "浏览器存储空间不足，资料未完整保存。请释放浏览器数据所在磁盘的空间，重启浏览器后点击“保存个人资料”。";
  }
  if (/QuotaExceededError|QUOTA_BYTES|quota.*exceed|exceed.*quota/i.test(message)
    || (error instanceof Error && error.name === "QuotaExceededError")) {
    return "插件存储额度不足，资料未完整保存。请先备份资料，再整理不再使用的简历并重新保存。";
  }
  return undefined;
}

export async function prepareAutofillPersistence(
  needsSave: boolean,
  persist: () => Promise<unknown>
): Promise<string | undefined> {
  if (!needsSave) return undefined;
  try {
    await persist();
    return undefined;
  } catch (error) {
    const warning = profileStorageWarning(error);
    if (!warning) throw error;
    return warning;
  }
}
