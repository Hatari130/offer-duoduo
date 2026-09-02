import type { ApplicationSyncItem } from "@offerflow/contracts";
import {
  CLOSED_STAGE_REASON_LABELS,
  INTERVIEW_ROUND_LABELS,
  RECRUITMENT_TYPE_LABELS,
  STAGE_LABELS,
  inferRecruitmentType,
  selectableStage,
  type JobApplication,
  type RecruitmentType
} from "@offerflow/domain";

type ZipEntry = { name: string; content: string };

const textEncoder = new TextEncoder();

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function inlineString(value: string): string {
  const escaped = xml(value);
  return /^\s|\s$/.test(value) ? `<is><t xml:space="preserve">${escaped}</t></is>` : `<is><t>${escaped}</t></is>`;
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** Creates a standards-compliant, uncompressed ZIP archive for a small client-side .xlsx workbook. */
function zip(entries: ZipEntry[]): Uint8Array {
  const localFiles: Uint8Array[] = [];
  const centralRecords: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const content = textEncoder.encode(entry.content);
    const checksum = crc32(content);
    const localHeader = new Uint8Array(30 + name.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, content.length);
    writeUint32(localHeader, 22, content.length);
    writeUint16(localHeader, 26, name.length);
    localHeader.set(name, 30);
    localFiles.push(localHeader, content);

    const centralHeader = new Uint8Array(46 + name.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, content.length);
    writeUint32(centralHeader, 24, content.length);
    writeUint16(centralHeader, 28, name.length);
    writeUint32(centralHeader, 42, offset);
    centralHeader.set(name, 46);
    centralRecords.push(centralHeader);
    offset += localHeader.length + content.length;
  }

  const centralDirectory = concat(centralRecords);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, offset);
  return concat([...localFiles, centralDirectory, end]);
}

function columnName(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function recruitmentType(application: JobApplication): RecruitmentType | undefined {
  return application.recruitmentType || inferRecruitmentType(
    application.position,
    application.jobType,
    application.summary,
    application.rawExcerpt
  );
}

function stageLabel(application: JobApplication): string {
  const stage = selectableStage(application.stage);
  if (stage === "closed" && application.closedReason) return `${STAGE_LABELS.closed} · ${CLOSED_STAGE_REASON_LABELS[application.closedReason]}`;
  if (stage === "interview" && application.interviewRound) return `${STAGE_LABELS.interview} · ${INTERVIEW_ROUND_LABELS[application.interviewRound]}`;
  return STAGE_LABELS[stage];
}

function applicationEvents(application: JobApplication): string {
  return application.events
    .map((event) => `${formatDate(event.occurredAt)} ${event.title}`.trim())
    .join("\n");
}

const headers = [
  "公司", "岗位", "部门", "岗位类型", "当前阶段", "投递时间", "截止时间", "地点",
  "下一步行动", "岗位摘要", "岗位 JD", "岗位职责", "任职要求", "来源链接", "来源网站",
  "关联简历", "外部招聘进度", "是否收藏", "投递事件"
];

function applicationRow(application: JobApplication): string[] {
  const type = recruitmentType(application);
  return [
    application.company,
    application.position,
    application.department || "",
    type ? RECRUITMENT_TYPE_LABELS[type] : "未识别",
    stageLabel(application),
    formatDate(application.appliedAt),
    formatDate(application.deadline),
    application.city || "",
    application.nextAction || "",
    application.summary || "",
    application.rawExcerpt || "",
    application.responsibilities.join("\n"),
    application.requirements.join("\n"),
    application.sourceUrl,
    application.sourceHost,
    application.tailoredResumeName || "",
    application.externalStage || "",
    application.isFavorite ? "是" : "否",
    applicationEvents(application)
  ];
}

function worksheet(rows: string[][]): string {
  const columnWidths = [18, 28, 16, 13, 16, 20, 16, 16, 22, 34, 48, 42, 42, 44, 22, 24, 20, 12, 48];
  const columns = columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const cells = (row: string[], rowIndex: number, style: number) => row
    .map((value, columnIndex) => `<c r="${columnName(columnIndex)}${rowIndex}" t="inlineStr" s="${style}">${inlineString(value)}</c>`)
    .join("");
  const rowXml = [
    `<row r="1" ht="25" customHeight="1">${cells(headers, 1, 1)}</row>`,
    ...rows.map((row, index) => `<row r="${index + 2}" ht="48" customHeight="1">${cells(row, index + 2, 2)}</row>`)
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:S${Math.max(1, rows.length + 1)}"/></worksheet>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><color rgb="FF20283A"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3F56B8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`;

/** Builds an .xlsx file containing the current set of application records. */
export function createApplicationExportXlsx(items: ApplicationSyncItem[]): Uint8Array {
  const rows = items.map((item) => applicationRow(item.application));
  return zip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="投递记录" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: styles },
    { name: "xl/worksheets/sheet1.xml", content: worksheet(rows) }
  ]);
}

function filename(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ].join("");
  return `JobKoI-投递记录-${stamp}.xlsx`;
}

export function downloadApplicationExport(items: ApplicationSyncItem[]): void {
  const workbook = createApplicationExportXlsx(items);
  const blob = new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename();
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
