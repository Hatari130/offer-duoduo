import type {
  ApplicationStage,
  ExtractedJob,
  JobApplication
} from "@/shared/types";

export type View = "dashboard" | "calendar" | "capture" | "profile" | "settings";

export type CompactView = View | "jobs";

export type CalendarEvent = {
  id: string;
  date: string;
  type: "applied" | "deadline";
  title: string;
  subtitle: string;
  job: JobApplication;
};

export const LOCATION_COORDINATES: Record<string, { lng: number; lat: number }> = {
  北京: { lng: 116.41, lat: 39.9 }, 天津: { lng: 117.2, lat: 39.08 },
  上海: { lng: 121.47, lat: 31.23 }, 深圳: { lng: 114.06, lat: 22.54 },
  广州: { lng: 113.26, lat: 23.13 }, 杭州: { lng: 120.15, lat: 30.27 },
  南京: { lng: 118.8, lat: 32.06 }, 苏州: { lng: 120.58, lat: 31.3 },
  武汉: { lng: 114.31, lat: 30.59 }, 成都: { lng: 104.07, lat: 30.67 },
  重庆: { lng: 106.55, lat: 29.56 }, 西安: { lng: 108.94, lat: 34.34 },
  郑州: { lng: 113.63, lat: 34.75 }, 济南: { lng: 117.12, lat: 36.65 },
  青岛: { lng: 120.38, lat: 36.07 }, 长沙: { lng: 112.94, lat: 28.23 },
  厦门: { lng: 118.09, lat: 24.48 }, 福州: { lng: 119.3, lat: 26.08 },
  合肥: { lng: 117.23, lat: 31.82 }, 南昌: { lng: 115.86, lat: 28.68 },
  昆明: { lng: 102.83, lat: 24.88 }, 贵阳: { lng: 106.63, lat: 26.65 },
  南宁: { lng: 108.37, lat: 22.82 }, 海口: { lng: 110.2, lat: 20.04 },
  沈阳: { lng: 123.43, lat: 41.8 }, 大连: { lng: 121.62, lat: 38.91 },
  长春: { lng: 125.32, lat: 43.82 }, 哈尔滨: { lng: 126.53, lat: 45.8 },
  石家庄: { lng: 114.51, lat: 38.04 }, 太原: { lng: 112.55, lat: 37.87 },
  兰州: { lng: 103.83, lat: 36.06 }, 乌鲁木齐: { lng: 87.62, lat: 43.82 },
  香港: { lng: 114.17, lat: 22.32 }, 澳门: { lng: 113.54, lat: 22.2 }
};

export const LOCATION_ALIASES = Object.keys(LOCATION_COORDINATES).sort((a, b) => b.length - a.length);

export type MapPoint = [number, number];

export type ChinaMapFeature = {
  name: string;
  path: string;
  boundary: boolean;
};

export const CHINA_MAP_WIDTH = 500;

export const CHINA_MAP_HEIGHT = 430;

export const DEGREE = Math.PI / 180;

export const ALBERS_STANDARD_PARALLEL_1 = 25 * DEGREE;

export const ALBERS_STANDARD_PARALLEL_2 = 47 * DEGREE;

export const ALBERS_ORIGIN_LONGITUDE = 105 * DEGREE;

export const ALBERS_N =
  (Math.sin(ALBERS_STANDARD_PARALLEL_1) +
    Math.sin(ALBERS_STANDARD_PARALLEL_2)) /
  2;

export const ALBERS_C =
  Math.cos(ALBERS_STANDARD_PARALLEL_1) ** 2 +
  2 * ALBERS_N * Math.sin(ALBERS_STANDARD_PARALLEL_1);

export const ALBERS_RHO_ORIGIN = Math.sqrt(ALBERS_C) / ALBERS_N;

export const ALBERS_BOUNDS = {
  minX: -0.4111170389,
  maxX: 0.3454467148,
  minY: 0.057179601,
  maxY: 0.9320904841
};

export function projectChinaPoint([lng, lat]: MapPoint): MapPoint {
  const latitude = lat * DEGREE;
  const theta = ALBERS_N * (lng * DEGREE - ALBERS_ORIGIN_LONGITUDE);
  const rho =
    Math.sqrt(ALBERS_C - 2 * ALBERS_N * Math.sin(latitude)) / ALBERS_N;
  const rawX = rho * Math.sin(theta);
  const rawY = ALBERS_RHO_ORIGIN - rho * Math.cos(theta);
  const centerX = (ALBERS_BOUNDS.minX + ALBERS_BOUNDS.maxX) / 2;
  const x = CHINA_MAP_WIDTH / 2 + (rawX - centerX) * 500;
  const y = 18 + (ALBERS_BOUNDS.maxY - rawY) * 450;
  return [x, y];
}

export function segmentDistanceSquared(point: MapPoint, start: MapPoint, end: MapPoint): number {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx || dy) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
    dx = point[0] - x;
    dy = point[1] - y;
  } else {
    dx = point[0] - x;
    dy = point[1] - y;
  }
  return dx * dx + dy * dy;
}

export function simplifyMapPoints(points: MapPoint[], tolerance = 0.32): MapPoint[] {
  if (points.length <= 2) return points;
  const toleranceSquared = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    let index = -1;
    let maxDistance = toleranceSquared;
    for (let current = first + 1; current < last; current += 1) {
      const distance = segmentDistanceSquared(points[current], points[first], points[last]);
      if (distance > maxDistance) {
        index = current;
        maxDistance = distance;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

export function coordinatesToPath(coordinates: unknown, close: boolean): string {
  if (!Array.isArray(coordinates) || !coordinates.length) return "";
  if (typeof coordinates[0]?.[0] === "number") {
    const points = simplifyMapPoints(
      (coordinates as MapPoint[]).map(projectChinaPoint)
    );
    if (!points.length) return "";
    const commands = points.map(
      ([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`
    );
    return `${commands.join(" ")}${close ? "Z" : ""}`;
  }
  return (coordinates as unknown[])
    .map((item) => coordinatesToPath(item, close))
    .filter(Boolean)
    .join(" ");
}

export function normalizeJobLocation(value?: string): string {
  const source = value?.trim();
  if (!source) return "未填写";
  return LOCATION_ALIASES.find((location) => source.includes(location)) ?? source.replace(/[省市]$/, "");
}

export function companyMark(company: string): string {
  const normalized = company.replace(/[（(].*?[）)]/g, "").trim();
  const latin = normalized.match(/[A-Za-z0-9]{2,}/)?.[0];
  if (latin) return latin.slice(0, 3).toUpperCase();
  return normalized.replace(/有限责任公司|有限公司|集团|科技|公司/g, "").slice(0, 2) || "OF";
}

export function sourceLabel(job: JobApplication): string {
  if (job.sourceHost) return job.sourceHost.replace(/^www\./, "");
  try {
    return new URL(job.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "招聘官网";
  }
}

export const compactStages: ApplicationStage[] = [
  "interested",
  "to_apply",
  "applied",
  "assessment",
  "interview",
  "offer"
];

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
}

export function applicationStageFromProgress(
  value?: string
): ApplicationStage | undefined {
  const progress = value?.trim().toLowerCase();
  if (!progress) return undefined;
  if (/终止|结束|拒绝|淘汰|不合适|不通过|未通过|未录用|已撤回/.test(progress)) {
    return "closed";
  }
  if (/offer|录用|待入职|已入职|入职|背调|背景调查|体检|薪酬|签约|审批|发放|意向书/.test(progress)) return "offer";
  if (/面试|一面|二面|三面|hr面|复试|群面|业务面|主管面|终面/.test(progress)) return "interview";
  if (/笔试|测评|在线测试/.test(progress)) return "assessment";
  if (/初筛|复筛|筛选|简历|资格审核|已投递|投递成功/.test(progress)) {
    return "applied";
  }
  if (/待投递|网申/.test(progress)) return "to_apply";
  if (/感兴趣|收藏/.test(progress)) return "interested";
  return undefined;
}

const CAPTURE_OCCUPATION_PATTERN = /产品经理|项目经理|工程师|设计师|架构师|分析师|研究员|科学家|算法|开发|测试|运营|销售|市场|顾问|管培生|实习生|专员|主管|总监|HRBP|财务|法务|审计|采购|供应链|商务|策划|编辑|翻译|教师|讲师|医生/i;
const CAPTURE_PROCESS_PATTERN = /^(?:(?:简历|网申|在线|AI|人才|资格|视频|业务|主管|薪酬|录用|Offer)?(?:投递|提交|筛选|初筛|复筛|评估|审核|测评|笔试|面试|一面|二面|三面|HR面|群面|终面|沟通|背调|背景调查|体检|签约|审批|发放|意向书|Offer评估|Offer|录用|入职)(?:简历|申请)?(?:中|完成|通过|不通过|结果|待定)?|等待.{0,10}(?:筛选|评估|审核|面试|笔试|测评|背调|体检|审批|结果)|待(?:筛选|评估|审核|面试|笔试|测评|背调|体检|签约|审批|入职)|未通过|不合适|淘汰|流程终止|已结束|拒绝|未录用|已撤回)$/i;
const CAPTURE_CAMPAIGN_PATTERN = /(?:校园招聘|社会招聘|招聘官网|招聘平台|职位列表|职位详情|申请记录|投递记录|我的申请|JD\s*YOUNG.*计划)$/i;

export function isCapturePositionRejected(value?: string): boolean {
  const position = value?.trim();
  if (!position) return true;
  const segments = position.split(/[｜|]/).map((segment) => segment.trim()).filter(Boolean);
  const candidate = segments.at(-1) || position;
  if (CAPTURE_OCCUPATION_PATTERN.test(candidate)) return false;
  return CAPTURE_PROCESS_PATTERN.test(candidate) || CAPTURE_CAMPAIGN_PATTERN.test(candidate);
}

function progressLabel(evidence: NonNullable<ExtractedJob["progressEvidence"]>[number]) {
  if (evidence.terminalStatus?.trim()) return evidence.terminalStatus.trim();
  if (evidence.currentStage?.trim()) return evidence.currentStage.trim();
  const reached = [...evidence.steps]
    .reverse()
    .find((step) => ["current", "completed", "failed"].includes(step.state));
  return reached?.label.trim();
}

function captureCompany(page: ExtractedJob): string {
  const knownHosts: Array<[RegExp, string]> = [
    [/(?:^|\.)baidu\.com$/i, "百度"],
    [/(?:^|\.)tencent\.com$/i, "腾讯"],
    [/(?:^|\.)alibaba\.com$/i, "阿里巴巴"],
    [/(?:^|\.)bytedance\.com$/i, "字节跳动"],
    [/(?:^|\.)meituan\.com$/i, "美团"],
    [/(?:^|\.)jd\.com$/i, "京东"],
    [/(?:^|\.)huawei\.com$/i, "华为"]
  ];
  const knownCompany = knownHosts.find(([pattern]) => pattern.test(page.sourceHost))?.[1];
  if (knownCompany) return knownCompany;

  const source = page.company.trim();
  const cleaned = source
    .replace(/[\s｜|·_-]*(?:官方)?(?:校园招聘|社会招聘|招聘官网|招聘平台|人才招聘|招聘)$/i, "")
    .trim();
  if (cleaned && cleaned.toLowerCase() !== page.sourceHost.trim().toLowerCase()) {
    return cleaned;
  }

  const titleCompany = page.position.match(
    /^(.{2,30}?)(?:官方)?(?:校园招聘|社会招聘|招聘官网|招聘平台|人才招聘)$/i
  )?.[1]?.trim();
  if (titleCompany) return titleCompany;

  return source;
}

function captureCity(position?: string, context?: string, fallback?: string): string | undefined {
  const source = `${position || ""} ${context || ""}`;
  const detected = LOCATION_ALIASES.find((location) =>
    new RegExp(`(?:^|[\\s，,;；｜|—-])${location}(?:市)?(?=$|[\\s，,;；｜|—-])`).test(source)
  );
  if (detected) return detected;
  const normalizedFallback = fallback ? normalizeJobLocation(fallback) : "";
  return normalizedFallback && normalizedFallback !== "未填写"
    ? normalizedFallback
    : undefined;
}

function captureAppliedAt(context?: string, fallback?: string): string | undefined {
  const matched = context?.match(
    /(?:投递时间|申请时间|提交时间)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)/i
  )?.[1];
  return (matched || fallback)
    ?.replace(/[年月./]/g, "-")
    .replace(/日(?=\s|$)/, "");
}

export function prepareCaptureForReview(page: ExtractedJob): ExtractedJob {
  const externalStage = page.externalStage?.trim() || undefined;
  const rejectedPosition = isCapturePositionRejected(page.position);
  return {
    ...page,
    position: rejectedPosition ? "" : page.position,
    deadline: undefined,
    nextAction: undefined,
    summary: undefined,
    externalStage,
    suggestedStage:
      page.suggestedStage || applicationStageFromProgress(externalStage),
    confidence: rejectedPosition ? Math.min(page.confidence, 0.49) : page.confidence
  };
}

export function captureCandidatesFromProgress(page: ExtractedJob): ExtractedJob[] {
  const pageCompany = captureCompany(page);
  const candidates = (page.progressEvidence || [])
    .filter(
      (evidence) =>
        evidence.confidence >= 0.75 &&
        evidence.position?.trim() &&
        !isCapturePositionRejected(evidence.position)
    )
    .map((evidence) => {
      const externalStage = progressLabel(evidence);
      return prepareCaptureForReview({
        ...page,
        company: evidence.company?.trim() || pageCompany,
        position: evidence.position!.trim(),
        jobId: evidence.jobId || page.jobId,
        city:
          evidence.city?.trim().replace(/[省市]$/, "") ||
          captureCity(evidence.position, evidence.context, page.city),
        appliedAt:
          evidence.appliedAt || captureAppliedAt(evidence.context, page.appliedAt),
        externalStage,
        suggestedStage: applicationStageFromProgress(externalStage),
        progressEvidence: [evidence],
        extractionSource: "rules",
        confidence: Math.max(page.confidence, evidence.confidence)
      });
    });

  return candidates.filter((candidate, index, items) => {
    const normalizedJobId = candidate.jobId?.trim().toLowerCase();
    const normalizedPosition = candidate.position
      .replace(/[（(]?\b[A-Z]\d{5,}\b[）)]?/gi, "")
      .replace(/[\s\-—_｜|（）()]/g, "")
      .toLowerCase();
    return items.findIndex((item) => {
      if (normalizedJobId && item.jobId?.trim().toLowerCase() === normalizedJobId) {
        return true;
      }
      if (normalizedJobId && item.jobId?.trim()) return false;
      return (
        item.position
          .replace(/[（(]?\b[A-Z]\d{5,}\b[）)]?/gi, "")
          .replace(/[\s\-—_｜|（）()]/g, "")
          .toLowerCase() === normalizedPosition
      );
    }) === index;
  });
}

export function shouldUseDeepSeekForCapture(page: ExtractedJob): boolean {
  if (page.progressEvidence?.length) return true;

  const genericPosition = /^(?:校园招聘|社会招聘|招聘官网|职位列表|职位详情|申请记录|投递记录|我的申请)$/i.test(
    page.position.trim()
  );
  const genericCompany =
    !page.company.trim() ||
    page.company.trim().toLowerCase() === page.sourceHost.trim().toLowerCase();

  return page.confidence < 0.8 || genericPosition || genericCompany;
}

export function dueState(deadline?: string): "late" | "soon" | "normal" | "none" {
  if (!deadline) return "none";
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return "none";
  const days = (due.getTime() - Date.now()) / 86400000;
  if (days < 0) return "late";
  if (days <= 3) return "soon";
  return "normal";
}

export function formatDeadline(deadline?: string): string {
  if (!deadline) return "未设置";
  const value = new Date(deadline);
  if (Number.isNaN(value.getTime())) return deadline;
  return value.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric"
  });
}

export function calendarDateKey(value?: string): string | undefined {
  if (!value) return undefined;
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return localDateKey(date);
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthLabel(date: Date): string {
  return `${date.getFullYear()}年 ${String(date.getMonth() + 1).padStart(2, "0")}月`;
}

export function inferAppliedAt(job: JobApplication): string | undefined {
  if (job.appliedAt || !job.rawExcerpt) return job.appliedAt;
  const text = job.rawExcerpt;
  const jobIndex = job.jobId ? text.toLowerCase().indexOf(job.jobId.toLowerCase()) : -1;
  const relevantText =
    jobIndex >= 0
      ? text.slice(Math.max(0, jobIndex - 120), Math.min(text.length, jobIndex + 700))
      : text;
  const match = relevantText.match(
    /(?:投递时间|申请时间|提交时间)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)/i
  );
  return match?.[1]
    ?.replace(/[年月./]/g, "-")
    .replace(/日(?=\s|$)/, "")
    .trim();
}
