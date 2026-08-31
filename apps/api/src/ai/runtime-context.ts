const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function dateParts(date: Date): { date: string; time: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
    weekday: value("weekday")
  };
}

export function assistantRuntimeContext(now: Date = new Date()): string {
  const today = dateParts(now);
  const yesterday = dateParts(new Date(now.getTime() - 24 * 60 * 60 * 1_000));
  const recentWeekStart = dateParts(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1_000));

  return [
    "运行时日期事实（由 JobKoI 后端生成，不是模型记忆）：",
    `- 当前北京时间：${today.date} ${today.time}（${today.weekday}）`,
    `- 时区：${SHANGHAI_TIME_ZONE}（UTC+08:00）`,
    `- “今天”指 ${today.date}；“昨天”指 ${yesterday.date}；“最近一周”默认指 ${recentWeekStart.date} 至 ${today.date}（含首尾）。`,
    "- 回答今天、当前月份、距离某日期还有多久、秋招/春招规划等时间问题时，必须以上述日期为基准计算，不得依靠训练数据猜测当前时间。",
    "- 招聘批次、开放状态、截止日期和岗位更新时间属于外部事实；只有本轮资料或 JobKoI 后端结果明确提供时才能确认，否则要说明需要查询，不能根据当前月份自行编造。"
  ].join("\n");
}
