import type { ResumePdfPageLayout, ResumePdfTextItem } from "@/features/profile/resumeParser";

export interface PdfEditableBlock {
  id: string;
  itemIds: string[];
  text: string;
  x: number;
  top: number;
  width: number;
  height: number;
  lineHeight: number;
  lastLineTop: number;
  lastLineWidth: number;
  textIndent: number;
  fontSize: number;
  fontFamily: string;
  fontId: string;
  fallbackFontFamily: string;
  fontWeight: 400 | 700;
  fontStyle: "normal" | "italic";
  color: string;
  rotation: number;
  direction: string;
}

export interface PdfEditableRegion {
  id: string;
  top: number;
  height: number;
  blocks: PdfEditableBlock[];
}

interface TextLine {
  items: ResumePdfTextItem[];
  top: number;
  height: number;
}

interface TextSegment {
  items: ResumePdfTextItem[];
  text: string;
  x: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontId: string;
  fallbackFontFamily: string;
  fontWeight: 400 | 700;
  fontStyle: "normal" | "italic";
  color: string;
  rotation: number;
  direction: string;
}

const median = (values: number[], fallback = 0) => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const right = (item: Pick<ResumePdfTextItem, "x" | "width">) => item.x + item.width;

function dominantItem(items: ResumePdfTextItem[]) {
  return [...items].sort((left, rightItem) => {
    const leftScore = [...left.text.trim()].length * Math.max(1, left.width);
    const rightScore = [...rightItem.text.trim()].length * Math.max(1, rightItem.width);
    return rightScore - leftScore;
  })[0] || items[0];
}

function groupLines(items: ResumePdfTextItem[]) {
  const lines: TextLine[] = [];
  [...items]
    .filter((item) => item.text.trim() && Math.abs(item.rotation || 0) < 2)
    .sort((left, rightItem) => left.top - rightItem.top || left.x - rightItem.x)
    .forEach((item) => {
      const itemCenter = item.top + item.height / 2;
      const line = [...lines].reverse().find((candidate) => {
        const lineCenter = candidate.top + candidate.height / 2;
        const tolerance = Math.max(1.25, Math.min(candidate.height, item.height) * 0.24);
        return Math.abs(lineCenter - itemCenter) <= tolerance;
      });
      if (line) {
        line.items.push(item);
        const bottom = Math.max(line.top + line.height, item.top + item.height);
        line.top = Math.min(line.top, item.top);
        line.height = bottom - line.top;
      } else {
        lines.push({ items: [item], top: item.top, height: item.height });
      }
    });
  return lines.sort((left, rightItem) => left.top - rightItem.top);
}

function gapText(previous: ResumePdfTextItem | undefined, current: ResumePdfTextItem) {
  if (!previous) return "";
  const gap = current.x - right(previous);
  const unit = Math.max(2.8, Math.min(previous.fontSize, current.fontSize) * 0.48);
  if (gap <= unit * 0.65) return "";
  return " ".repeat(Math.max(1, Math.min(8, Math.round(gap / unit))));
}

function toSegment(items: ResumePdfTextItem[]): TextSegment {
  const sorted = [...items].sort((left, rightItem) => left.x - rightItem.x);
  const dominant = dominantItem(sorted);
  let previous: ResumePdfTextItem | undefined;
  const text = sorted.map((item) => {
    const value = `${gapText(previous, item)}${item.text}`;
    previous = item;
    return value;
  }).join("");
  const x = Math.min(...sorted.map((item) => item.x));
  const top = Math.min(...sorted.map((item) => item.top));
  const segmentRight = Math.max(...sorted.map(right));
  const bottom = Math.max(...sorted.map((item) => item.top + item.height));
  return {
    items: sorted,
    text,
    x,
    top,
    width: segmentRight - x,
    height: bottom - top,
    fontSize: dominant.fontSize,
    fontFamily: dominant.fontFamily,
    fontId: dominant.fontId,
    fallbackFontFamily: dominant.fallbackFontFamily,
    fontWeight: dominant.fontWeight,
    fontStyle: dominant.fontStyle,
    color: dominant.color,
    rotation: dominant.rotation,
    direction: dominant.direction
  };
}

function splitLine(line: TextLine) {
  const items = [...line.items].sort((left, rightItem) => left.x - rightItem.x);
  const groups: ResumePdfTextItem[][] = [];
  items.forEach((item) => {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous) {
      groups.push([item]);
      return;
    }
    const gap = item.x - right(previous);
    const fontSize = Math.max(previous.fontSize, item.fontSize);
    const wideGap = gap > Math.max(18, fontSize * 1.65);
    const styleBreak = gap > fontSize * 0.72 && (
      Math.abs(previous.fontSize - item.fontSize) > 1.35
      || previous.fontWeight !== item.fontWeight
    );
    if (wideGap || styleBreak) groups.push([item]);
    else current.push(item);
  });
  return groups.map(toSegment);
}

function styleCompatible(block: PdfEditableBlock, segment: TextSegment) {
  return Math.abs(block.fontSize - segment.fontSize) <= 1.25
    && block.fontWeight === segment.fontWeight
    && block.fontStyle === segment.fontStyle
    && Math.abs(block.rotation - segment.rotation) < 1;
}

function horizontalAffinity(block: PdfEditableBlock, segment: TextSegment) {
  const indentDistance = Math.abs(block.x - segment.x);
  return indentDistance <= Math.max(block.fontSize, segment.fontSize) * 2.8;
}

function segmentToBlock(segment: TextSegment, index: number): PdfEditableBlock {
  return {
    id: `pdf-block-${index}`,
    itemIds: segment.items.map((item) => item.id),
    text: segment.text,
    x: segment.x,
    top: segment.top,
    width: segment.width,
    height: segment.height,
    lineHeight: Math.max(segment.height, segment.fontSize * 1.16),
    lastLineTop: segment.top,
    lastLineWidth: segment.width,
    textIndent: 0,
    fontSize: segment.fontSize,
    fontFamily: segment.fontFamily,
    fontId: segment.fontId,
    fallbackFontFamily: segment.fallbackFontFamily,
    fontWeight: segment.fontWeight,
    fontStyle: segment.fontStyle,
    color: segment.color,
    rotation: segment.rotation,
    direction: segment.direction
  };
}

export function buildPdfEditableBlocks(page: ResumePdfPageLayout): PdfEditableBlock[] {
  const segments = groupLines(page.items).flatMap(splitLine).sort((left, rightItem) => left.top - rightItem.top || left.x - rightItem.x);
  const blocks: PdfEditableBlock[] = [];
  segments.forEach((segment, index) => {
    const candidate = [...blocks].reverse().find((block) => {
      const verticalGap = segment.top - (block.top + block.height);
      const longEnough = Math.max(block.width, segment.width) >= page.widthPt * 0.25;
      const startsNewParagraph = block.lastLineWidth < block.width * 0.45
        && segment.width > block.width * 0.55
        && Math.abs(block.x - segment.x) <= Math.max(block.fontSize, segment.fontSize);
      return verticalGap >= -1.5
        && verticalGap <= Math.max(block.fontSize, segment.fontSize) * 0.88
        && longEnough
        && !startsNewParagraph
        && styleCompatible(block, segment)
        && horizontalAffinity(block, segment);
    });
    if (!candidate) {
      blocks.push(segmentToBlock(segment, index));
      return;
    }
    const oldTop = candidate.top;
    const previousText = candidate.text;
    const previousRight = candidate.x + candidate.width;
    const nextRight = segment.x + segment.width;
    const lineStep = segment.top - candidate.lastLineTop;
    const firstLineX = candidate.x + candidate.textIndent;
    const newX = Math.min(candidate.x, segment.x);
    candidate.textIndent = firstLineX - newX;
    // Keep the source PDF's explicit line boundaries. The overlay is hidden
    // until a block is edited, but when it is repainted these newlines prevent
    // browser font metrics from rewrapping an otherwise unchanged paragraph.
    candidate.text = `${previousText}\n${segment.text}`;
    candidate.itemIds.push(...segment.items.map((item) => item.id));
    candidate.x = newX;
    candidate.width = Math.max(previousRight, nextRight) - newX;
    candidate.height = Math.max(candidate.height, segment.top + segment.height - oldTop);
    candidate.lineHeight = median([candidate.lineHeight, lineStep], candidate.lineHeight);
    candidate.lastLineTop = segment.top;
    candidate.lastLineWidth = segment.width;
  });
  return blocks;
}

function looksLikeHeading(block: PdfEditableBlock, bodyFontSize: number, pageWidth: number) {
  const length = [...block.text.replace(/\s+/g, "")].length;
  const prominent = block.fontSize >= bodyFontSize * 1.2;
  const shortBold = block.fontWeight === 700
    && block.fontSize >= bodyFontSize * 0.98
    && block.width < pageWidth * 0.42
    && length <= 16;
  return length > 0 && length <= 28 && (prominent || shortBold);
}

export function buildPdfEditableRegions(page: ResumePdfPageLayout): PdfEditableRegion[] {
  const blocks = buildPdfEditableBlocks(page);
  if (!blocks.length) return [];
  const bodyFontSize = median(blocks.flatMap((block) => Array(Math.max(1, [...block.text].length)).fill(block.fontSize)), 10);
  const starts = blocks
    .filter((block) => looksLikeHeading(block, bodyFontSize, page.widthPt))
    .map((block) => Math.max(0, block.top - Math.max(3, block.fontSize * 0.48)))
    .sort((left, rightItem) => left - rightItem)
    .filter((value, index, values) => index === 0 || value - values[index - 1] > bodyFontSize * 1.5);
  if (!starts.length || starts[0] > bodyFontSize) starts.unshift(0);
  const boundaries = [...starts, page.heightPt];
  return starts.map((top, index) => {
    const bottom = boundaries[index + 1];
    return {
      id: `pdf-region-${page.page}-${index}`,
      top,
      height: Math.max(1, bottom - top),
      blocks: blocks.filter((block) => block.top >= top && block.top < bottom)
    };
  }).filter((region) => region.blocks.length);
}
