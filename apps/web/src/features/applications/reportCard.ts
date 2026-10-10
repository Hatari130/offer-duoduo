import type { ApplicationReport, ReportStep } from "./applicationReport";

/** 3:4, the Xiaohongshu cover ratio. The preview shows this same canvas scaled down. */
export const REPORT_CARD_WIDTH = 1080;
export const REPORT_CARD_HEIGHT = 1440;

const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif';
const PAD = 80;
const INK = "#161922";
const MUTED = "#535b6d";
const SUBTLE = "#7a8296";

const STEP_LABELS: Record<ReportStep, string> = { applied: "投递", assessment: "测评", interview: "面试", offer: "Offer" };
const BAR_COLORS: Record<ReportStep, string> = { applied: "#3f56b8", assessment: "#556dcc", interview: "#7287db", offer: "#f27645" };
const CHIP_STYLES: Record<ReportStep, { fill: string; line: string; text: string }> = {
  offer: { fill: "#fff1ea", line: "#ffc6ab", text: "#b2451b" },
  interview: { fill: "#eef1ff", line: "#c9d2ff", text: "#34499f" },
  assessment: { fill: "#ffffff", line: "#e1e5ee", text: "#3a4152" },
  applied: { fill: "#ffffff", line: "#e1e5ee", text: "#3a4152" }
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function font(weight: number, size: number) {
  return `${weight} ${size}px ${FONT}`;
}

// Same geometry as components/Logo.tsx, drawn at 2x.
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(2, 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4.15;
  ctx.strokeStyle = "#86c8ff";
  ctx.stroke(new Path2D("M4.5 18.9c5.3 5.4 14.2 5.2 21.4-.45 2.4-1.9 4.2-4.2 5.35-6.55"));
  ctx.strokeStyle = "#4b83ed";
  ctx.stroke(new Path2D("M5.2 20.3c6.65 2.65 14.25.8 19.5-4.3 2.3-2.25 3.85-4.9 4.55-7.55"));
  ctx.lineWidth = 2.5;
  ctx.stroke(new Path2D("m25.8 8.65 4.05-.9-.35 4.15"));
  const dot = (cx: number, cy: number, r: number, color: string) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  dot(6.4, 11.35, 3.15, "#ff824f");
  dot(5.65, 10.55, 1.05, "#ffc083");
  dot(30.7, 21.2, 1.3, "#8a79f2");
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#f5f7fb";
  ctx.fillRect(0, 0, REPORT_CARD_WIDTH, REPORT_CARD_HEIGHT);
  const glow = (x: number, y: number, r: number, color: string) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgb(245 247 251 / 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, REPORT_CARD_WIDTH, REPORT_CARD_HEIGHT);
  };
  glow(980, 120, 620, "rgb(214 222 255 / 0.85)");
  glow(60, 1380, 560, "rgb(214 236 255 / 0.8)");
}

function drawHeader(ctx: CanvasRenderingContext2D, report: ApplicationReport) {
  drawLogo(ctx, PAD, 78);
  const word = ctx.createLinearGradient(PAD + 84, 0, PAD + 250, 0);
  word.addColorStop(0, "#367bd9");
  word.addColorStop(0.6, "#5d72e4");
  word.addColorStop(1, "#3f9dd8");
  ctx.fillStyle = word;
  ctx.font = font(700, 46);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText("JobKoI", PAD + 84, 128);

  ctx.fillStyle = SUBTLE;
  ctx.font = font(500, 30);
  ctx.textAlign = "right";
  ctx.fillText(report.dateLabel, REPORT_CARD_WIDTH - PAD, 124);

  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = font(800, 100);
  ctx.fillText(report.title, PAD, 296);
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 38);
  ctx.fillText(`${report.companies.length} 家公司 · ${report.counts.applied} 份投递`, PAD, 362);
}

/** Centred bars that narrow with each step, each carrying its own label and count. */
function drawFunnel(ctx: CanvasRenderingContext2D, report: ApplicationReport, top: number): number {
  const panelX = PAD;
  const panelW = REPORT_CARD_WIDTH - PAD * 2;
  const inset = 44;
  const barH = 84;
  const gap = 14;
  const steps: ReportStep[] = ["applied", "assessment", "interview", "offer"];
  const panelH = inset * 2 + steps.length * barH + (steps.length - 1) * gap;

  ctx.save();
  ctx.shadowColor = "rgb(37 47 80 / 0.12)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, panelX, top, panelW, panelH, 44);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  const maxW = panelW - inset * 2;
  const minW = 320;
  const base = Math.max(report.counts.applied, 1);
  steps.forEach((step, index) => {
    const count = report.counts[step];
    const width = minW + (maxW - minW) * (count / base);
    const x = REPORT_CARD_WIDTH / 2 - width / 2;
    const y = top + inset + index * (barH + gap);
    const empty = count === 0;
    roundRect(ctx, x, y, width, barH, 26);
    ctx.fillStyle = empty ? "#eef0f5" : BAR_COLORS[step];
    ctx.fill();

    const text = empty ? "#8a93a6" : "#ffffff";
    ctx.fillStyle = text;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = font(600, 34);
    ctx.fillText(STEP_LABELS[step], x + 36, y + barH / 2 + 1);
    ctx.textAlign = "right";
    ctx.font = font(800, 52);
    ctx.fillText(String(count), x + width - 36, y + barH / 2 + 2);
  });
  ctx.textBaseline = "alphabetic";
  return top + panelH;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

/** Wraps company chips into at most `maxRows` rows, ending with "+N" when some do not fit. */
function drawCompanies(ctx: CanvasRenderingContext2D, report: ApplicationReport, top: number, maxRows: number) {
  ctx.fillStyle = SUBTLE;
  ctx.font = font(600, 30);
  ctx.textAlign = "left";
  ctx.fillText("投过的公司", PAD, top + 30);

  const legend = (["offer", "interview"] as const).filter((step) => report.counts[step] > 0);
  let legendX = REPORT_CARD_WIDTH - PAD;
  ctx.font = font(500, 26);
  ctx.textAlign = "right";
  for (const step of [...legend].reverse()) {
    const label = step === "offer" ? "拿到 Offer" : "进入面试";
    ctx.fillStyle = SUBTLE;
    ctx.fillText(label, legendX, top + 28);
    legendX -= ctx.measureText(label).width + 14;
    ctx.beginPath();
    ctx.arc(legendX, top + 19, 9, 0, Math.PI * 2);
    ctx.fillStyle = CHIP_STYLES[step].line;
    ctx.fill();
    legendX -= 36;
  }

  const chipH = 64;
  const gap = 14;
  const padX = 26;
  const left = PAD;
  const right = REPORT_CARD_WIDTH - PAD;
  ctx.font = font(600, 32);
  const chips = report.companies.map((company) => {
    const label = truncate(ctx, company.name, 360);
    return { ...company, label, width: ctx.measureText(label).width + padX * 2 };
  });

  const place = (count: number, extra?: number) => {
    const placed: Array<{ x: number; row: number }> = [];
    let x = left;
    let row = 0;
    const widths = chips.slice(0, count).map((chip) => chip.width);
    if (extra !== undefined) widths.push(extra);
    for (const width of widths) {
      if (x + width > right) {
        row += 1;
        x = left;
      }
      if (row >= maxRows) return undefined;
      placed.push({ x, row });
      x += width + gap;
    }
    return placed;
  };

  let shown = chips.length;
  let layout = place(shown);
  let moreLabel = "";
  if (!layout) {
    // Drop chips from the end until a "+N" chip fits on the last row.
    while (shown > 0) {
      shown -= 1;
      moreLabel = `+${chips.length - shown}`;
      layout = place(shown, ctx.measureText(moreLabel).width + padX * 2);
      if (layout) break;
    }
  }
  if (!layout) return;

  const chipTop = top + 56;
  layout.forEach((slot, index) => {
    const y = chipTop + slot.row * (chipH + gap);
    const isMore = index >= shown;
    const chip = chips[index];
    const style = isMore ? { fill: "#e9edf6", line: "#e9edf6", text: MUTED } : CHIP_STYLES[chip.furthest];
    const width = isMore ? ctx.measureText(moreLabel).width + padX * 2 : chip.width;
    roundRect(ctx, slot.x, y, width, chipH, chipH / 2);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = style.line;
    ctx.stroke();
    ctx.fillStyle = style.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(isMore ? moreLabel : chip.label, slot.x + padX, y + chipH / 2 + 1);
  });
  ctx.textBaseline = "alphabetic";
}

function drawComment(ctx: CanvasRenderingContext2D, report: ApplicationReport, top: number) {
  const height = 96;
  roundRect(ctx, PAD, top, REPORT_CARD_WIDTH - PAD * 2, height, 30);
  ctx.fillStyle = "rgb(63 86 184 / 0.07)";
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#3f56b8";
  ctx.font = font(700, 32);
  const prefix = "小鲤：";
  ctx.fillText(prefix, PAD + 36, top + height / 2 + 1);
  const offset = ctx.measureText(prefix).width;
  ctx.fillStyle = INK;
  ctx.font = font(500, 32);
  ctx.fillText(truncate(ctx, report.comment, REPORT_CARD_WIDTH - PAD * 2 - 72 - offset), PAD + 36 + offset, top + height / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  const y = REPORT_CARD_HEIGHT - 52;
  ctx.font = font(500, 26);
  ctx.fillStyle = SUBTLE;
  ctx.textAlign = "left";
  ctx.fillText("用 JobKoI 记录每一份投递", PAD, y);
  ctx.textAlign = "right";
  ctx.fillText("jobkoi.cn", REPORT_CARD_WIDTH - PAD, y);
}

export async function drawReportCard(canvas: HTMLCanvasElement, report: ApplicationReport): Promise<void> {
  // Canvas text silently falls back to a default face if the web font has not finished loading.
  await document.fonts?.ready;
  canvas.width = REPORT_CARD_WIDTH;
  canvas.height = REPORT_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawBackground(ctx);
  drawHeader(ctx, report);
  const funnelBottom = drawFunnel(ctx, report, 410);
  drawCompanies(ctx, report, funnelBottom + 48, 3);
  drawComment(ctx, report, REPORT_CARD_HEIGHT - 200);
  drawFooter(ctx);
}

export function reportCardBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("图片生成失败"))), "image/png");
  });
}
