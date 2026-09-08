export interface DeadlineStatus {
  isUrgent: boolean; // within 3 days or expired
  isExpired: boolean; // past deadline
  remainingText: string; // e.g. "剩 2 天", "剩 12 小时", "已截止"
  formattedDate: string; // e.g. "09/10 18:00"
}

/**
 * Evaluates whether an application deadline requires urgent warning (within 3 days or past).
 */
export function computeDeadlineStatus(
  deadlineStr?: string,
  now: Date = new Date()
): DeadlineStatus | undefined {
  if (!deadlineStr || !deadlineStr.trim()) return undefined;

  // Supports "2026-09-10 18:00" or ISO format
  const normalizedStr = deadlineStr.includes("T")
    ? deadlineStr
    : deadlineStr.replace(" ", "T");
  const parsed = Date.parse(normalizedStr);
  if (Number.isNaN(parsed)) return undefined;

  const target = new Date(parsed);
  const diffMs = target.getTime() - now.getTime();

  const formattedDate = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(target);

  if (diffMs < 0) {
    return {
      isUrgent: true,
      isExpired: true,
      remainingText: "已截止",
      formattedDate
    };
  }

  // 3 days in ms
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const isUrgent = diffMs <= THREE_DAYS_MS;

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let remainingText = "";
  if (diffHours < 24) {
    remainingText = `剩 ${Math.max(1, diffHours)} 小时`;
  } else {
    remainingText = `剩 ${diffDays} 天`;
  }

  return {
    isUrgent,
    isExpired: false,
    remainingText,
    formattedDate
  };
}
