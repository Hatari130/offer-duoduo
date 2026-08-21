import type { ResumePdfLayout } from "@/features/profile/resumeParser";
import { buildPdfEditableRegions } from "./pdfEditableBlocks.ts";
import type { PdfTailoringPatch, PdfTailoringSourceBlock } from "./types";

const MIN_NARRATIVE_LENGTH = 24;
const MAX_SOURCE_BLOCKS = 16;

export function collectPdfTailoringSourceBlocks(layout?: ResumePdfLayout): PdfTailoringSourceBlock[] {
  if (!layout) return [];
  return layout.pages.flatMap((page) => buildPdfEditableRegions(page).flatMap((region) => region.blocks.map((block) => ({
    blockId: block.id,
    page: page.page,
    text: block.text.trim()
  }))))
    .filter((block) => [...normalize(block.text)].length >= MIN_NARRATIVE_LENGTH)
    .sort((left, right) => [...right.text].length - [...left.text].length)
    .slice(0, MAX_SOURCE_BLOCKS);
}

export function validatePdfTailoringPatches(
  input: unknown,
  sourceBlocks: PdfTailoringSourceBlock[]
): PdfTailoringPatch[] {
  if (!Array.isArray(input) || sourceBlocks.length === 0) return [];
  const sourceById = new Map(sourceBlocks.map((block) => [`${block.page}:${block.blockId}`, block]));
  const seen = new Set<string>();
  return input.flatMap((candidate): PdfTailoringPatch[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Record<string, unknown>;
    const blockId = String(raw.block_id || raw.blockId || "").trim();
    const page = Number(raw.page || 1);
    const sourceText = String(raw.source_text || raw.sourceText || "").trim();
    const tailoredText = String(raw.tailored_text || raw.tailoredText || "").trim();
    const sourceKey = `${page}:${blockId}`;
    const source = sourceById.get(sourceKey);
    if (!source || seen.has(sourceKey) || !sourceText || !tailoredText) return [];
    if (normalize(source.text) !== normalize(sourceText) || normalize(sourceText) === normalize(tailoredText)) return [];
    // Coordinate-backed PDF blocks have a fixed font and line width. A loose
    // character-only budget (previously 72%-128%) allowed English-heavy text
    // to add multiple rendered lines even when the model claimed it was
    // "roughly equal length". Keep both character and estimated visual width
    // within the frozen-layout budget.
    if (!fitsPdfTailoringBudget(sourceText, tailoredText)) return [];
    seen.add(sourceKey);
    const mapIds = Array.isArray(raw.map_ids) ? raw.map_ids.map(String).filter(Boolean) : [];
    return [{ blockId, page, sourceText: source.text, tailoredText, mapIds }];
  });
}

export function fitsPdfTailoringBudget(sourceText: string, tailoredText: string) {
  const sourceLength = [...normalize(sourceText)].length;
  const tailoredLength = [...normalize(tailoredText)].length;
  const sourceVisualLength = visualLength(sourceText);
  const tailoredVisualLength = visualLength(tailoredText);
  if (!sourceLength || !tailoredLength || !sourceVisualLength || !tailoredVisualLength) return false;
  return tailoredLength >= sourceLength * 0.9
    && tailoredLength <= sourceLength * 1.1
    && tailoredVisualLength >= sourceVisualLength * 0.88
    && tailoredVisualLength <= sourceVisualLength * 1.08;
}

function normalize(value: string) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function visualLength(value: string) {
  return [...String(value || "")].reduce((total, character) => {
    if (/\s/.test(character)) return total + 0.28;
    if (/[\u0000-\u00ff]/.test(character)) {
      if (/[A-Z0-9]/.test(character)) return total + 0.62;
      if (/[.,:;!?'"()\-_/\\]/.test(character)) return total + 0.36;
      return total + 0.54;
    }
    if (/[，。；：！？、（）《》【】“”‘’]/.test(character)) return total + 0.82;
    return total + 1;
  }, 0);
}
