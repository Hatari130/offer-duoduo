import type {
  ApplicationStage,
  ExtractedJob,
  JobApplication
} from "@/shared/types";

export type View = "dashboard" | "calendar" | "capture" | "settings";

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
