import type { ApplicationSyncItem } from "@offerflow/contracts";
import {
  inferRecruitmentType,
  normalizeApplicationCity,
  normalizeApplicationCompany,
  normalizeApplicationPosition,
  type ApplicationStage,
  type ClosedStageReason,
  type InterviewRound,
  type JobApplication,
  type RecruitmentType
} from "@offerflow/domain";
import { createUuid } from "../../app/id.ts";
import { companyDirectory } from "../opportunities/companyDirectory.ts";

export type ImportTargetField =
  | "company"
  | "position"
  | "stage"
  | "appliedAt"
  | "city"
  | "department"
  | "recruitmentType"
  | "rawExcerpt"
  | "sourceUrl"
  | "ignore";

export const IMPORT_FIELD_LABELS: Record<ImportTargetField, string> = {
  company: "公司名称 *",
  position: "岗位名称 *",
  stage: "当前阶段",
  appliedAt: "投递时间",
  city: "城市/地点",
  department: "部门/业务线",
  recruitmentType: "岗位类型",
  rawExcerpt: "岗位 JD / 备注",
  sourceUrl: "来源/官网链接",
  ignore: "忽略此列"
};

export interface ColumnMappingItem {
  colIndex: number;
  headerName: string;
  targetField: ImportTargetField;
}

export type ConflictStrategy = "update_existing" | "skip_existing" | "create_all";

export interface NormalizedImportApplication {
  id: string;
  rawRowIndex: number;
  company: string;
  matchedDirectoryCompany?: string;
  officialCareerUrl?: string;
  position: string;
  department?: string;
  city?: string;
  recruitmentType?: RecruitmentType;
  stage: ApplicationStage;
  closedReason?: ClosedStageReason;
  interviewRound?: InterviewRound;
  appliedAt?: string;
  rawExcerpt?: string;
  sourceUrl: string;
  action: "create" | "update" | "skip";
  matchedExistingItem?: ApplicationSyncItem;
  errors: string[];
  selected: boolean;
}

export interface ParseResult {
  headers: string[];
  rows: string[][];
  hasHeaderRow: boolean;
}

/**
 * Parses TSV or CSV text (supports Feishu multitable copy, Excel copy, or CSV export).
 * Handles multiline quoted strings and escapes.
 */
export function parseDelimitedText(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];

  // Determine likely delimiter by counting occurrences outside quotes in first few lines
  const firstChunk = clean.slice(0, 3000);
  const tabCount = (firstChunk.match(/\t/g) || []).length;
  const commaCount = (firstChunk.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? "\t" : ",";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

const HEADER_KEYWORDS = [
  "公司", "企业", "单位", "岗位", "职位", "阶段", "状态", "进度", "时间",
  "日期", "城市", "地点", "base", "部门", "类型", "批次", "链接", "jd", "备注"
];

function isLikelyHeaderRow(row: string[]): boolean {
  const matched = row.filter((cell) => {
    const lower = cell.toLowerCase().trim();
    return HEADER_KEYWORDS.some((kw) => lower.includes(kw));
  });
  return matched.length >= Math.min(2, row.length);
}

export function parseClipboardOrCsv(text: string): ParseResult {
  const allRows = parseDelimitedText(text);
  if (allRows.length === 0) {
    return { headers: [], rows: [], hasHeaderRow: false };
  }

  const firstRow = allRows[0];
  const hasHeader = isLikelyHeaderRow(firstRow);

  if (hasHeader) {
    return {
      headers: firstRow,
      rows: allRows.slice(1),
      hasHeaderRow: true
    };
  }

  // Generate synthetic headers
  const maxCols = Math.max(...allRows.map((r) => r.length));
  const headers = Array.from({ length: maxCols }, (_, i) => `第 ${i + 1} 列`);
  return {
    headers,
    rows: allRows,
    hasHeaderRow: false
  };
}

// -------------------------------------------------------------
// Pure TypeScript XLSX Reader using native DecompressionStream
// -------------------------------------------------------------

async function decompressZipEntry(compressed: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return compressed;
  if (method !== 8) {
    throw new Error(`不支持的 ZIP 压缩格式 (方法: ${method})`);
  }
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressed);
      controller.close();
    }
  });
  const decompressed = stream.pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = decompressed.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParseResult> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = new Map<string, Uint8Array>();

  // Find End of Central Directory Record (EOCD)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65536); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("无效的 Excel / ZIP 文件格式");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  let currentCdOffset = cdOffset;
  for (let entry = 0; entry < totalEntries; entry++) {
    if (view.getUint32(currentCdOffset, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(currentCdOffset + 10, true);
    const compressedSize = view.getUint32(currentCdOffset + 20, true);
    const fileNameLength = view.getUint16(currentCdOffset + 28, true);
    const extraFieldLength = view.getUint16(currentCdOffset + 30, true);
    const fileCommentLength = view.getUint16(currentCdOffset + 32, true);
    const localHeaderOffset = view.getUint32(currentCdOffset + 42, true);

    const fileNameBytes = bytes.subarray(currentCdOffset + 46, currentCdOffset + 46 + fileNameLength);
    const fileName = new TextDecoder().decode(fileNameBytes);

    // Read local header
    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraFieldLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;

    if (
      fileName === "xl/sharedStrings.xml" ||
      fileName.startsWith("xl/worksheets/sheet") ||
      fileName === "xl/workbook.xml"
    ) {
      const compressedData = bytes.subarray(dataOffset, dataOffset + compressedSize);
      const decompressed = await decompressZipEntry(compressedData, compressionMethod);
      files.set(fileName, decompressed);
    }

    currentCdOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  // Parse shared strings
  const sharedStrings: string[] = [];
  const sharedStringsData = files.get("xl/sharedStrings.xml");
  if (sharedStringsData) {
    const xml = new TextDecoder().decode(sharedStringsData);
    const siRegex = /<si\b[^>]*>(.*?)<\/si>/gs;
    let match: RegExpExecArray | null;
    while ((match = siRegex.exec(xml)) !== null) {
      const siContent = match[1];
      const tRegex = /<t\b[^>]*>(.*?)<\/t>/gs;
      let textPieces = "";
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(siContent)) !== null) {
        textPieces += decodeXmlEntities(tMatch[1]);
      }
      sharedStrings.push(textPieces);
    }
  }

  // Find the primary worksheet
  let sheetData = files.get("xl/worksheets/sheet1.xml");
  if (!sheetData) {
    for (const [name, data] of files.entries()) {
      if (name.startsWith("xl/worksheets/sheet")) {
        sheetData = data;
        break;
      }
    }
  }

  if (!sheetData) {
    throw new Error("Excel 文件中未找到任何工作表");
  }

  const sheetXml = new TextDecoder().decode(sheetData);
  return parseWorksheetXml(sheetXml, sharedStrings);
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function colLettersToIndex(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

function parseWorksheetXml(xml: string, sharedStrings: string[]): ParseResult {
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>(.*?)<\/row>/gs;
  const rows: Array<{ rowIndex: number; cells: Record<number, string> }> = [];

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowNum = parseInt(rowMatch[1], 10);
    const rowContent = rowMatch[2];
    const cells: Record<number, string> = {};

    const cellRegex = /<c\b[^>]*\br="([A-Z]+)\d+"(?:[^>]*\bt="([^"]*)")?[^>]*>(.*?)<\/c>/gs;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const colLetter = cellMatch[1];
      const cellType = cellMatch[2] || "";
      const cellBody = cellMatch[3];
      const colIndex = colLettersToIndex(colLetter);

      let val = "";
      if (cellType === "inlineStr") {
        const isMatch = /<t\b[^>]*>(.*?)<\/t>/s.exec(cellBody);
        if (isMatch) val = decodeXmlEntities(isMatch[1]);
      } else if (cellType === "s") {
        const vMatch = /<v\b[^>]*>(\d+)<\/v>/s.exec(cellBody);
        if (vMatch) {
          const sIndex = parseInt(vMatch[1], 10);
          val = sharedStrings[sIndex] || "";
        }
      } else {
        const vMatch = /<v\b[^>]*>(.*?)<\/v>/s.exec(cellBody);
        if (vMatch) val = decodeXmlEntities(vMatch[1]);
      }

      cells[colIndex] = val;
    }

    rows.push({ rowIndex: rowNum, cells });
  }

  // Convert map to dense 2D string array
  if (rows.length === 0) {
    return { headers: [], rows: [], hasHeaderRow: false };
  }

  let maxCol = 0;
  for (const r of rows) {
    for (const c of Object.keys(r.cells)) {
      maxCol = Math.max(maxCol, Number(c) + 1);
    }
  }

  const tableRows: string[][] = rows.map((r) => {
    const rowArray: string[] = [];
    for (let c = 0; c < maxCol; c++) {
      rowArray.push((r.cells[c] || "").trim());
    }
    return rowArray;
  });

  const firstRow = tableRows[0];
  const hasHeader = isLikelyHeaderRow(firstRow);

  if (hasHeader) {
    return {
      headers: firstRow,
      rows: tableRows.slice(1),
      hasHeaderRow: true
    };
  }

  const headers = Array.from({ length: maxCol }, (_, i) => `第 ${i + 1} 列`);
  return {
    headers,
    rows: tableRows,
    hasHeaderRow: false
  };
}

// -------------------------------------------------------------
// Field Mapping Recognition
// -------------------------------------------------------------

export function detectColumnMapping(headers: string[]): ColumnMappingItem[] {
  const usedFields = new Set<ImportTargetField>();

  return headers.map((header, colIndex) => {
    const raw = header.trim().toLowerCase();

    let targetField: ImportTargetField = "ignore";

    if (!usedFields.has("company") && /^(公司|企业|公司名称|企业名称|单位|投递公司|投递企业|company|employer|corp)$/i.test(raw)) {
      targetField = "company";
    } else if (!usedFields.has("position") && /^(岗位|职位|投递岗位|投递职位|应聘职位|应聘岗位|岗位名称|职位名称|position|job|title|role)$/i.test(raw)) {
      targetField = "position";
    } else if (!usedFields.has("stage") && /^(当前阶段|阶段|状态|当前状态|进度|投递进度|流程状态|流程进度|招聘进度|stage|status|progress)$/i.test(raw)) {
      targetField = "stage";
    } else if (!usedFields.has("appliedAt") && /^(投递时间|投递日期|申请时间|申请日期|时间|日期|applied\s*at|date|applied\s*time)$/i.test(raw)) {
      targetField = "appliedAt";
    } else if (!usedFields.has("city") && /^(城市|地点|工作地点|工作城市|base|base地|city|location)$/i.test(raw)) {
      targetField = "city";
    } else if (!usedFields.has("department") && /^(部门|业务线|事业群|bg|bu|事业部|department|team)$/i.test(raw)) {
      targetField = "department";
    } else if (!usedFields.has("recruitmentType") && /^(招聘类型|岗位类型|批次|招聘批次|秋招\/春招|类型|recruitment\s*type|batch|type)$/i.test(raw)) {
      targetField = "recruitmentType";
    } else if (!usedFields.has("rawExcerpt") && (/^(岗位jd|jd|岗位职责|职位描述|任职要求|职责要求|工作职责|description|notes)$/i.test(raw) || raw.includes("备注") || raw.includes("说明"))) {
      targetField = "rawExcerpt";
    } else if (!usedFields.has("sourceUrl") && /^(链接|投递链接|岗位链接|官网|网申链接|url|link|website)$/i.test(raw)) {
      targetField = "sourceUrl";
    } else if (!usedFields.has("company") && (raw.includes("公司") || raw.includes("企业"))) {
      targetField = "company";
    } else if (!usedFields.has("position") && (raw.includes("岗位") || raw.includes("职位"))) {
      targetField = "position";
    } else if (!usedFields.has("stage") && (raw.includes("阶段") || raw.includes("状态") || raw.includes("进度"))) {
      targetField = "stage";
    } else if (!usedFields.has("appliedAt") && (raw.includes("投递时间") || raw.includes("申请时间") || raw.includes("日期"))) {
      targetField = "appliedAt";
    } else if (!usedFields.has("city") && (raw.includes("城市") || raw.includes("地点") || raw.includes("base"))) {
      targetField = "city";
    }

    if (targetField !== "ignore") {
      usedFields.add(targetField);
    }

    return { colIndex, headerName: header, targetField };
  });
}

// -------------------------------------------------------------
// Normalizers & Directory Matching
// -------------------------------------------------------------

/** Clean up company name and extract department if embedded (e.g. 腾讯-IEG -> 腾讯, IEG) */
export function extractCompanyAndDepartment(raw: string): { company: string; department?: string } {
  let cleaned = raw.trim();
  let department: string | undefined;

  // Check format "公司（部门）" or "公司(部门)"
  const bracketMatch = cleaned.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
  if (bracketMatch) {
    cleaned = bracketMatch[1].trim();
    department = bracketMatch[2].trim();
  } else {
    // Check format "公司 - 部门" or "公司/部门"
    const dashMatch = cleaned.match(/^([^-—/|｜]+)[-—/|｜](.+)$/);
    if (dashMatch && dashMatch[1].length >= 2 && dashMatch[2].length >= 2) {
      cleaned = dashMatch[1].trim();
      department = dashMatch[2].trim();
    }
  }

  return { company: cleaned, department };
}

/** Match company against JobKoi's official directory */
export function matchOfficialCompany(name: string): {
  canonicalName: string;
  careerUrl?: string;
  matched: boolean;
} {
  const norm = normalizeApplicationCompany(name);
  if (!norm) return { canonicalName: name, matched: false };

  for (const category of companyDirectory) {
    for (const entry of category.companies) {
      const entryNorm = normalizeApplicationCompany(entry.name);
      const shortNorm = normalizeApplicationCompany(entry.shortName);
      if (norm === entryNorm || norm === shortNorm) {
        return { canonicalName: entry.name, careerUrl: entry.careerUrl, matched: true };
      }
      for (const alias of entry.aliases) {
        if (norm === normalizeApplicationCompany(alias)) {
          return { canonicalName: entry.name, careerUrl: entry.careerUrl, matched: true };
        }
      }
    }
  }

  return { canonicalName: name, matched: false };
}

/** Normalize stage text to JobKoi ApplicationStage, ClosedStageReason, InterviewRound */
export function normalizeStageValue(raw?: string): {
  stage: ApplicationStage;
  closedReason?: ClosedStageReason;
  interviewRound?: InterviewRound;
} {
  if (!raw || !raw.trim()) {
    return { stage: "applied" };
  }
  const str = raw.trim().toLowerCase();

  // Offer
  if (/offer|录用|意向书|带薪|两方|三方/i.test(str)) {
    return { stage: "offer" };
  }

  // Closed / Failed
  if (/挂|感谢信|结束|不匹配|淘汰|终止|未通过|人才库|拒|放弃/i.test(str)) {
    let closedReason: ClosedStageReason | undefined;
    if (/笔试|测评|机试|ot|oa/.test(str)) closedReason = "assessment_rejected";
    else if (/三面/.test(str)) closedReason = "interview_3_rejected";
    else if (/二面|复试/.test(str)) closedReason = "interview_2_rejected";
    else if (/一面|初试/.test(str)) closedReason = "interview_1_rejected";
    else if (/hr/.test(str)) closedReason = "hr_rejected";
    else if (/简历|初筛|简历关/.test(str)) closedReason = "resume_rejected";
    return { stage: "closed", closedReason };
  }

  // Interview
  if (/面|初试|复试|终面|约面/.test(str)) {
    let interviewRound: InterviewRound | undefined;
    if (/一面|初试|技术一面|专业一面/.test(str)) interviewRound = "interview_1";
    else if (/二面|复试|技术二面|专业二面/.test(str)) interviewRound = "interview_2";
    else if (/三面|技术三面/.test(str)) interviewRound = "interview_3";
    else if (/hr|人事|综合素质/.test(str)) interviewRound = "hr_interview";
    else if (/电话|电面/.test(str)) interviewRound = "phone_screen";
    return { stage: "interview", interviewRound };
  }

  // Assessment
  if (/笔试|测评|机试|在线测试|ot|oa/.test(str)) {
    return { stage: "assessment" };
  }

  // Interested
  if (/想投|待投|准备投|关注|收藏|有意向|待网申/.test(str)) {
    return { stage: "interested" };
  }

  // Default to applied
  return { stage: "applied" };
}

/** Normalize recruitment type */
export function normalizeRecruitmentTypeValue(raw?: string, position = ""): RecruitmentType | undefined {
  const str = (raw || "").toLowerCase().trim();
  if (/提前批/.test(str)) return "autumn_early";
  if (/秋/.test(str)) return "autumn";
  if (/春|补录/.test(str)) return "spring";
  if (/暑期/.test(str)) return "summer_internship";
  if (/实习/.test(str)) return "daily_internship";

  return inferRecruitmentType(position, "", "", "");
}

/** Convert various date formats or Excel numeric serial dates to YYYY-MM-DD HH:mm */
export function normalizeDateValue(raw?: string): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  const str = raw.trim();

  // Excel serial number like 45529 or 45529.333
  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
    }
  }

  // ISO date like 2026-08-25T08:00:00.000Z or 2026-08-25T08:00:00
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]} ${isoMatch[2]}`;
  }

  // Match 2026/08/25 or 2026.08.25 or 2026年8月25日
  const ymdMatch = str.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})(?:[日\s]*(\d{1,2}):(\d{1,2}))?/);
  if (ymdMatch) {
    const [, y, m, d, hh, mm] = ymdMatch;
    const pad = (v?: string, def = "00") => (v ? String(v).padStart(2, "0") : def);
    return `${y}-${pad(m)}-${pad(d)} ${pad(hh, "08")}:${pad(mm, "00")}`;
  }

  // Match 08/25 or 8月25日 (no year -> default to current year)
  const mdMatch = str.match(/(\d{1,2})[月/.-](\d{1,2})(?:[日\s]*(\d{1,2}):(\d{1,2}))?/);
  if (mdMatch) {
    const currentYear = new Date().getFullYear();
    const [, m, d, hh, mm] = mdMatch;
    const pad = (v?: string, def = "00") => (v ? String(v).padStart(2, "0") : def);
    return `${currentYear}-${pad(m)}-${pad(d)} ${pad(hh, "08")}:${pad(mm, "00")}`;
  }

  return undefined;
}

// -------------------------------------------------------------
// Reconciliation with Existing Records
// -------------------------------------------------------------

function findExistingMatch(
  company: string,
  position: string,
  existingItems: ApplicationSyncItem[]
): ApplicationSyncItem | undefined {
  const normComp = normalizeApplicationCompany(company);
  const normPos = normalizeApplicationPosition(position);

  if (!normComp || !normPos) return undefined;

  return existingItems.find(({ application }) => {
    const existComp = normalizeApplicationCompany(application.company);
    const existPos = normalizeApplicationPosition(application.position);
    if (!existComp || !existPos) return false;

    if (existComp !== normComp) return false;

    // Company matches. Check position
    if (existPos === normPos) return true;
    if (normPos.includes(existPos) || existPos.includes(normPos)) return true;

    return false;
  });
}

export function buildImportCandidates(
  rawRows: string[][],
  mapping: ColumnMappingItem[],
  existingItems: ApplicationSyncItem[],
  strategy: ConflictStrategy
): NormalizedImportApplication[] {
  const getColValue = (row: string[], field: ImportTargetField): string => {
    const item = mapping.find((m) => m.targetField === field);
    if (!item || item.colIndex >= row.length) return "";
    return row[item.colIndex].trim();
  };

  return rawRows.map((row, rawIndex) => {
    const rawCompany = getColValue(row, "company");
    const rawPosition = getColValue(row, "position");
    const rawStage = getColValue(row, "stage");
    const rawAppliedAt = getColValue(row, "appliedAt");
    const rawCity = getColValue(row, "city");
    const rawDepartment = getColValue(row, "department");
    const rawRecruitmentType = getColValue(row, "recruitmentType");
    const rawExcerpt = getColValue(row, "rawExcerpt");
    const rawUrl = getColValue(row, "sourceUrl");

    const errors: string[] = [];
    if (!rawCompany) errors.push("缺失公司名称");
    if (!rawPosition) errors.push("缺失岗位名称");

    const { company: extractedCompany, department: extractedDept } = extractCompanyAndDepartment(rawCompany);
    const finalDepartment = rawDepartment || extractedDept;

    const { canonicalName, careerUrl, matched } = matchOfficialCompany(extractedCompany);
    const finalCompany = canonicalName;

    const { stage, closedReason, interviewRound } = normalizeStageValue(rawStage);
    const recruitmentType = normalizeRecruitmentTypeValue(rawRecruitmentType, rawPosition);
    const appliedAt = normalizeDateValue(rawAppliedAt);
    const city = rawCity ? normalizeApplicationCity(rawCity) : undefined;
    const finalUrl = rawUrl || (matched && careerUrl ? careerUrl : "offerflow://manual");

    // Match with existing application
    const matchedExisting = findExistingMatch(finalCompany, rawPosition, existingItems);

    let action: "create" | "update" | "skip" = "create";
    if (matchedExisting) {
      if (strategy === "skip_existing") {
        action = "skip";
      } else if (strategy === "update_existing") {
        action = "update";
      } else {
        action = "create";
      }
    }

    return {
      id: createUuid(),
      rawRowIndex: rawIndex + 1,
      company: finalCompany,
      matchedDirectoryCompany: matched ? canonicalName : undefined,
      officialCareerUrl: careerUrl,
      position: rawPosition,
      department: finalDepartment,
      city,
      recruitmentType,
      stage,
      closedReason,
      interviewRound,
      appliedAt,
      rawExcerpt: rawExcerpt || undefined,
      sourceUrl: finalUrl,
      action,
      matchedExistingItem: matchedExisting,
      errors,
      selected: errors.length === 0 && action !== "skip"
    };
  });
}

// -------------------------------------------------------------
// Execution Engine
// -------------------------------------------------------------

export interface ImportApiDeps {
  createApplication: (body: { application: JobApplication }) => Promise<unknown>;
  updateApplication: (id: string, body: { application: JobApplication; expectedRevision: number }) => Promise<unknown>;
}

export interface ImportExecutionResult {
  total: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  failedItems: Array<{ company: string; position: string; error: string }>;
}

export async function executeApplicationImport(
  deps: ImportApiDeps,
  candidates: NormalizedImportApplication[],
  onProgress?: (processed: number, total: number) => void
): Promise<ImportExecutionResult> {
  const toProcess = candidates.filter((c) => c.selected && c.errors.length === 0);
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = candidates.filter((c) => !c.selected || c.action === "skip").length;
  let failedCount = 0;
  const failedItems: Array<{ company: string; position: string; error: string }> = [];

  const now = new Date().toISOString();

  for (let i = 0; i < toProcess.length; i++) {
    const candidate = toProcess[i];
    try {
      if (candidate.action === "update" && candidate.matchedExistingItem) {
        const existing = candidate.matchedExistingItem.application;
        const updated: JobApplication = {
          ...existing,
          company: candidate.company || existing.company,
          position: candidate.position || existing.position,
          department: candidate.department ?? existing.department,
          city: candidate.city ?? existing.city,
          recruitmentType: candidate.recruitmentType ?? existing.recruitmentType,
          stage: candidate.stage,
          closedReason: candidate.stage === "closed" ? candidate.closedReason || existing.closedReason : undefined,
          interviewRound: candidate.stage === "interview" ? candidate.interviewRound || existing.interviewRound : undefined,
          appliedAt: candidate.appliedAt ?? existing.appliedAt,
          rawExcerpt: candidate.rawExcerpt
            ? existing.rawExcerpt
              ? `${existing.rawExcerpt}\n\n[批量导入备注]\n${candidate.rawExcerpt}`
              : candidate.rawExcerpt
            : existing.rawExcerpt,
          sourceUrl: candidate.sourceUrl !== "offerflow://manual" ? candidate.sourceUrl : existing.sourceUrl,
          updatedAt: now,
          events: [
            ...existing.events,
            {
              id: createUuid(),
              type: "stage_changed",
              title: `批量导入更新进度为：${candidate.stage}`,
              occurredAt: now
            }
          ]
        };

        await deps.updateApplication(existing.id, {
          application: updated,
          expectedRevision: candidate.matchedExistingItem.revision
        });
        updatedCount++;
      } else {
        // Create new application
        const isManual = candidate.sourceUrl === "offerflow://manual";
        let sourceHost = "manual";
        if (!isManual) {
          try {
            sourceHost = new URL(candidate.sourceUrl).hostname.replace(/^www\./, "");
          } catch {
            sourceHost = "manual";
          }
        }

        const newApp: JobApplication = {
          id: createUuid(),
          company: candidate.company,
          position: candidate.position,
          department: candidate.department,
          city: candidate.city,
          recruitmentType: candidate.recruitmentType,
          stage: candidate.stage,
          closedReason: candidate.stage === "closed" ? candidate.closedReason : undefined,
          interviewRound: candidate.stage === "interview" ? candidate.interviewRound : undefined,
          appliedAt: candidate.appliedAt,
          rawExcerpt: candidate.rawExcerpt,
          sourceUrl: candidate.sourceUrl,
          sourceHost,
          responsibilities: [],
          requirements: [],
          createdAt: now,
          updatedAt: now,
          events: [{ id: createUuid(), type: "created", title: "批量导入投递记录", occurredAt: now }]
        };

        await deps.createApplication({ application: newApp });
        createdCount++;
      }
    } catch (err) {
      failedCount++;
      failedItems.push({
        company: candidate.company,
        position: candidate.position,
        error: err instanceof Error ? err.message : "保存失败"
      });
    }

    onProgress?.(i + 1, toProcess.length);
  }

  return {
    total: candidates.length,
    createdCount,
    updatedCount,
    skippedCount,
    failedCount,
    failedItems
  };
}
