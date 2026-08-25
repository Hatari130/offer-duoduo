import type {
  PersonalProfile,
  ProfileAward,
  ProfileCampusExperience,
  ProfileEducation,
  ProfileExperience,
  ProfileProject
} from "@offerflow/domain";
import { parseResumeContentBlocks } from "@offerflow/domain";

export type ResumeSectionKind =
  | "header"
  | "education"
  | "experience"
  | "project"
  | "campus"
  | "award"
  | "skills"
  | "summary"
  | "unknown";

export interface ResumeDiagnosticLine {
  /** One-based line number in the normalized source text. */
  line: number;
  text: string;
}

export interface ResumeParsedSection {
  id: string;
  kind: ResumeSectionKind;
  heading: string;
  startLine: number;
  endLine: number;
  sourceText: string;
  entryCount: number;
}

export interface ResumeStructuredDiagnostics {
  fileName: string;
  normalizedText: string;
  totalNonEmptyLines: number;
  coveredLines: number;
  coverage: number;
  sections: ResumeParsedSection[];
  unclassifiedLines: ResumeDiagnosticLine[];
  unclassifiedText: string;
  warnings: string[];
}

export interface ResumeStructuredParseResult {
  profile: PersonalProfile;
  diagnostics: ResumeStructuredDiagnostics;
}

export interface ResumeDateRange {
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  matchedText: string;
}

interface SourceLine {
  index: number;
  text: string;
  content: string;
  isBlank: boolean;
  isBullet: boolean;
}

interface WorkingSection {
  id: string;
  kind: ResumeSectionKind;
  heading: string;
  headingLine?: SourceLine;
  lines: SourceLine[];
}

interface HeadingMatch {
  kind: ResumeSectionKind;
  heading: string;
  inlineContent: string;
}

interface ParsedEntries<T> {
  entries: T[];
  consumed: Set<number>;
}

const BULLET_CHARACTERS = /[\u2022\u2023\u2043\u204C\u204D\u2219\u25AA\u25AB\u25CF\u25CB\u25E6\u2981\u2B24\uF000-\uF8FF]/g;
const LEADING_BULLET = /^[\s•·●○▪▫■□◆◇▶►➤➢✓✔☑☆★※→—–-]+/;
const DATE_TOKEN_SOURCE = "(?:19|20)\\d{2}(?:\\s*(?:年|[./-])\\s*(?:1[0-2]|0?[1-9])\\s*月?)?";
const CURRENT_DATE_WORDS = /(?:至今|现在|目前|在职|present|current)/i;

const SECTION_ALIASES: Record<Exclude<ResumeSectionKind, "unknown">, readonly string[]> = {
  header: ["基本信息", "个人信息", "联系方式", "个人资料", "基础信息"],
  education: ["教育经历", "教育背景", "学历背景", "学习经历", "教育情况", "学历信息"],
  experience: [
    "实习工作经历",
    "实习与工作经历",
    "实习/工作经历",
    "工作经历",
    "实习经历",
    "工作实践",
    "实践经历",
    "职业经历",
    "工作经验",
    "实习经验",
    "社会实践"
  ],
  project: [
    "项目经历",
    "项目经验",
    "项目实践",
    "个人项目",
    "科研项目",
    "科研经历",
    "科研竞赛",
    "竞赛经历",
    "项目成果",
    "项目案例"
  ],
  campus: [
    "在校经历",
    "校园经历",
    "校园活动",
    "学生工作",
    "社团经历",
    "校内实践",
    "校内经历",
    "校园实践"
  ],
  award: [
    "获奖情况",
    "奖项荣誉",
    "荣誉奖励",
    "荣誉与奖项",
    "获奖经历",
    "奖励情况",
    "获奖与证书",
    "荣誉奖项",
    "奖项"
  ],
  skills: [
    "技能特长",
    "专业技能",
    "技能证书",
    "技能与证书",
    "证书技能",
    "资格证书",
    "个人技能",
    "技能/证书",
    "语言能力"
  ],
  summary: [
    "自我介绍",
    "个人简介",
    "个人总结",
    "自我评价",
    "个人评价",
    "个人优势",
    "核心优势",
    "职业规划",
    "发展规划",
    "求职偏好",
    "求职意向"
  ]
};

type ScalarField =
  | "fullName"
  | "gender"
  | "phone"
  | "email"
  | "birthDate"
  | "graduationDate"
  | "currentCity"
  | "nativePlace"
  | "height"
  | "weight"
  | "recruitmentType"
  | "graduateStatus"
  | "address"
  | "targetRole"
  | "targetCities"
  | "earliestStartDate"
  | "portfolioUrl"
  | "githubUrl"
  | "currentResidence"
  | "nationality"
  | "wechat"
  | "qq"
  | "politicalStatus"
  | "maritalStatus"
  | "healthStatus"
  | "specialty"
  | "workYears"
  | "countryRegion"
  | "expectedSalary"
  | "hobbies";

const SCALAR_LABELS: Array<{ key: ScalarField; labels: readonly string[] }> = [
  { key: "fullName", labels: ["姓名", "名字", "Name"] },
  { key: "gender", labels: ["性别", "Gender"] },
  { key: "phone", labels: ["手机", "手机号", "联系电话", "电话", "Phone", "Mobile"] },
  { key: "email", labels: ["邮箱", "电子邮箱", "邮件", "Email", "E-mail"] },
  { key: "birthDate", labels: ["出生日期", "出生年月", "生日"] },
  { key: "graduationDate", labels: ["毕业时间", "毕业日期", "预计毕业"] },
  { key: "currentCity", labels: ["现居城市", "所在城市", "现居地"] },
  { key: "currentResidence", labels: ["当前居住地", "居住地", "现居住地"] },
  { key: "nativePlace", labels: ["籍贯"] },
  { key: "height", labels: ["身高"] },
  { key: "weight", labels: ["体重"] },
  { key: "recruitmentType", labels: ["是否统招", "统招"] },
  { key: "graduateStatus", labels: ["应届/往届", "应届往届", "毕业状态"] },
  { key: "address", labels: ["联系地址", "通讯地址", "地址"] },
  { key: "targetRole", labels: ["求职意向", "目标岗位", "应聘职位", "期望职位", "意向岗位"] },
  { key: "targetCities", labels: ["意向城市", "期望城市", "工作地点"] },
  { key: "earliestStartDate", labels: ["最早到岗", "可到岗时间", "到岗时间"] },
  { key: "portfolioUrl", labels: ["作品集", "个人网站", "作品链接", "Portfolio"] },
  { key: "githubUrl", labels: ["GitHub", "Github", "代码仓库"] },
  { key: "nationality", labels: ["国籍", "民族"] },
  { key: "wechat", labels: ["微信", "WeChat"] },
  { key: "qq", labels: ["QQ"] },
  { key: "politicalStatus", labels: ["政治面貌"] },
  { key: "maritalStatus", labels: ["婚姻状况"] },
  { key: "healthStatus", labels: ["健康状况"] },
  { key: "specialty", labels: ["特长"] },
  { key: "workYears", labels: ["工作年限"] },
  { key: "countryRegion", labels: ["国家/地区", "国家地区"] },
  { key: "expectedSalary", labels: ["期望薪资", "薪资要求"] },
  { key: "hobbies", labels: ["兴趣爱好", "爱好"] }
];

const ALL_SCALAR_LABELS = SCALAR_LABELS.flatMap((definition) => definition.labels)
  .sort((left, right) => right.length - left.length);

/**
 * Normalize only characters that are presentation noise. Newlines and source
 * order are retained so diagnostics can always point back to the input.
 */
export function normalizeResumeStructuredText(rawText: string): string {
  return rawText
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\b((?:19|20)\d)\s+(\d)(?=\s*(?:年|[./-]))/g, "$1$2")
    .replace(/\b(19|20)\s+(\d{2})(?=\s*(?:年|[./-]))/g, "$1$2")
    .replace(BULLET_CHARACTERS, " • ")
    .split("\n")
    .map((line) => line.replace(/[\t\u00A0]+/g, " ").replace(/ {2,}/g, " ").trim())
    .join("\n");
}

function cleanContent(text: string): string {
  return text.replace(LEADING_BULLET, "").trim();
}

function makeSourceLines(normalizedText: string): SourceLine[] {
  return normalizedText.split("\n").map((text, index) => ({
    index,
    text,
    content: cleanContent(text),
    isBlank: !text.trim(),
    isBullet: /^[\s•·●○▪▫■□◆◇▶►➤➢✓✔☑☆★※→-]/.test(text)
  }));
}

function headingKey(value: string): string {
  return cleanContent(value)
    .replace(/[【】\[\]()（）<>《》「」『』]/g, "")
    .replace(/[：:|｜/\\&、·•—–_\s]/g, "")
    .replace(/[A-Za-z]/g, "")
    .trim();
}

function detectHeading(value: string): HeadingMatch | undefined {
  const clean = cleanContent(value).replace(/^[【\[（(]|[】\]）)]$/g, "").trim();
  const colonIndex = clean.search(/[：:]/);
  const headingPart = colonIndex >= 0 ? clean.slice(0, colonIndex) : clean;
  const inlineContent = colonIndex >= 0 ? clean.slice(colonIndex + 1).trim() : "";
  const key = headingKey(headingPart);

  for (const [kind, aliases] of Object.entries(SECTION_ALIASES) as Array<[
    Exclude<ResumeSectionKind, "unknown">,
    readonly string[]
  ]>) {
    const alias = aliases.find((candidate) => headingKey(candidate) === key);
    if (alias) return { kind, heading: headingPart.trim() || alias, inlineContent };
  }
  return undefined;
}

function looksLikeUnknownHeading(lines: SourceLine[], index: number): boolean {
  const line = lines[index];
  if (!line || line.isBlank || line.isBullet || line.content.length > 18) return false;
  if (new RegExp(DATE_TOKEN_SOURCE, "i").test(line.content) || /[@：:，,。；;]/.test(line.content)) return false;
  const previousBlank = index === 0 || Boolean(lines[index - 1]?.isBlank);
  const nextBlank = index === lines.length - 1 || Boolean(lines[index + 1]?.isBlank);
  return (previousBlank || nextBlank) && /(?:经历|背景|信息|情况|技能|证书|成果|作品|专利|论文|评价|介绍|规划|荣誉|奖项|实践|兴趣|爱好)$/.test(line.content);
}

function stableId(prefix: string, value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function buildSections(lines: SourceLine[], consumed: Set<number>): WorkingSection[] {
  const sections: WorkingSection[] = [];
  let current: WorkingSection = {
    id: "section-header-0",
    kind: "header",
    heading: "",
    lines: []
  };

  const flush = () => {
    if (current.headingLine || current.lines.some((line) => !line.isBlank)) sections.push(current);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.isBlank) {
      current.lines.push(line);
      continue;
    }
    const known = detectHeading(line.content);
    const unknown = !known && looksLikeUnknownHeading(lines, index);
    if (!known && !unknown) {
      current.lines.push(line);
      continue;
    }

    flush();
    const kind = known?.kind || "unknown";
    current = {
      id: stableId("section", `${kind}:${line.index}:${line.content}`),
      kind,
      heading: known?.heading || line.content,
      headingLine: line,
      lines: []
    };
    if (known) consumed.add(line.index);
    if (known?.inlineContent) {
      current.lines.push({
        ...line,
        text: known.inlineContent,
        content: cleanContent(known.inlineContent),
        isBullet: false
      });
    }
  }
  flush();
  return sections;
}

function normalizeDateToken(value: string): string {
  const match = value.match(/((?:19|20)\d{2})(?:\s*(?:年|[./-])\s*(\d{1,2})\s*月?)?/);
  if (!match) return "";
  if (!match[2]) return match[1];
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

/** Parse common Chinese and numeric resume date ranges without using wall-clock time. */
export function parseResumeDateRange(value: string): ResumeDateRange {
  const source = value.normalize("NFKC").replace(/[。．]/g, ".").replace(/\s+/g, " ").trim();
  const datePattern = new RegExp(DATE_TOKEN_SOURCE, "gi");
  const matches = [...source.matchAll(datePattern)];
  const current = CURRENT_DATE_WORDS.test(source);

  if (matches.length >= 2) {
    const first = matches[0];
    const second = matches[1];
    const startDate = normalizeDateToken(first?.[0] || "");
    const endDate = normalizeDateToken(second?.[0] || "");
    const start = first?.index || 0;
    const end = (second?.index || start) + (second?.[0]?.length || 0);
    return { startDate, endDate, isCurrent: false, matchedText: source.slice(start, end) };
  }

  const sameYear = source.match(/((?:19|20)\d{2})\s*(?:年|[./-])\s*(\d{1,2})\s*月?\s*(?:至|到|[-~～—–])\s*(\d{1,2})\s*月?/i);
  if (sameYear) {
    const startDate = normalizeDateToken(`${sameYear[1]}-${sameYear[2]}`);
    const endDate = normalizeDateToken(`${sameYear[1]}-${sameYear[3]}`);
    return { startDate, endDate, isCurrent: false, matchedText: sameYear[0] };
  }

  if (matches.length === 1) {
    const first = matches[0];
    const startDate = normalizeDateToken(first?.[0] || "");
    if (current) {
      const start = first?.index || 0;
      const currentMatch = source.match(CURRENT_DATE_WORDS);
      const end = (currentMatch?.index || start) + (currentMatch?.[0]?.length || 0);
      return { startDate, endDate: "至今", isCurrent: true, matchedText: source.slice(start, end) };
    }
    return { startDate, endDate: "", isCurrent: false, matchedText: first?.[0] || "" };
  }

  return { startDate: "", endDate: "", isCurrent: false, matchedText: "" };
}

function stripDateExpressions(value: string): string {
  return value
    .replace(new RegExp(DATE_TOKEN_SOURCE, "gi"), " ")
    .replace(CURRENT_DATE_WORDS, " ")
    .replace(/\s*(?:至|到|[-~～—–])\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[|｜·•，,;；:：\s]+|[|｜·•，,;；:：\s]+$/g, "")
    .trim();
}

function normalizedScalarDate(value: string): string {
  return parseResumeDateRange(value).startDate;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findNextLabelStart(text: string, from: number): number {
  let boundary = text.length;
  for (const label of ALL_SCALAR_LABELS) {
    const match = new RegExp(`${escapeRegExp(label)}\\s*[:：]?`, "i").exec(text.slice(from));
    if (match?.index !== undefined) boundary = Math.min(boundary, from + match.index);
  }
  return boundary;
}

function extractLabeledValue(text: string, labels: readonly string[]): { value: string; label: string } | undefined {
  for (const label of [...labels].sort((left, right) => right.length - left.length)) {
    const matcher = new RegExp(`(?:^|[\\s|｜;,，；])${escapeRegExp(label)}\\s*[:：]?\\s*`, "i");
    const match = matcher.exec(text);
    if (!match || match.index === undefined) continue;
    const start = match.index + match[0].length;
    const end = findNextLabelStart(text, start);
    const value = text.slice(start, end).replace(/^[|｜;,，；\s]+|[|｜;,，；\s]+$/g, "").trim();
    if (value) return { value, label };
  }
  return undefined;
}

function scalarValueNormalizer(key: ScalarField, value: string): string {
  if (key === "phone") return value.replace(/(?:\+?86[ -]?)?(1[3-9]\d)[ -]?(\d{4})[ -]?(\d{4})/, "$1$2$3");
  if (key === "birthDate" || key === "graduationDate") return normalizedScalarDate(value);
  return value.trim();
}

function filenameName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  const match = stem.match(/^([\u3400-\u9fff·]{2,4})(?:的)?(?:个人|求职)?简历$/);
  return match?.[1] || "";
}

function emptyProfile(scalars: Partial<Record<ScalarField, string>>): PersonalProfile {
  return {
    fullName: scalars.fullName || "",
    gender: scalars.gender || "",
    phone: scalars.phone || "",
    email: scalars.email || "",
    birthDate: scalars.birthDate || "",
    graduationDate: scalars.graduationDate || "",
    currentCity: scalars.currentCity || "",
    nativePlace: scalars.nativePlace || "",
    height: scalars.height || "",
    weight: scalars.weight || "",
    recruitmentType: scalars.recruitmentType || "",
    graduateStatus: scalars.graduateStatus || "",
    address: scalars.address || "",
    targetRole: scalars.targetRole || "",
    targetCities: scalars.targetCities || "",
    earliestStartDate: scalars.earliestStartDate || "",
    portfolioUrl: scalars.portfolioUrl || "",
    githubUrl: scalars.githubUrl || "",
    education: [],
    experiences: [],
    projects: [],
    campusExperiences: [],
    awards: [],
    selfIntroduction: "",
    strengths: "",
    careerPlan: "",
    currentResidence: scalars.currentResidence || "",
    nationality: scalars.nationality || "",
    wechat: scalars.wechat || "",
    qq: scalars.qq || "",
    politicalStatus: scalars.politicalStatus || "",
    maritalStatus: scalars.maritalStatus || "",
    healthStatus: scalars.healthStatus || "",
    specialty: scalars.specialty || "",
    workYears: scalars.workYears || "",
    countryRegion: scalars.countryRegion || "",
    expectedSalary: scalars.expectedSalary || "",
    hobbies: scalars.hobbies || ""
  };
}

function parseScalars(lines: SourceLine[], fileName: string, consumed: Set<number>): Partial<Record<ScalarField, string>> {
  const values: Partial<Record<ScalarField, string>> = {};
  for (const line of lines) {
    if (line.isBlank) continue;
    let matchedLine = false;
    for (const definition of SCALAR_LABELS) {
      if (values[definition.key]) continue;
      const extracted = extractLabeledValue(line.content, definition.labels);
      if (!extracted) continue;
      values[definition.key] = scalarValueNormalizer(definition.key, extracted.value);
      matchedLine = true;
    }

    if (!values.email) {
      const email = line.content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      if (email) {
        values.email = email;
        matchedLine = true;
      }
    }
    if (!values.phone) {
      const phone = line.content.match(/(?:\+?86[ -]?)?1[3-9]\d[ -]?\d{4}[ -]?\d{4}/)?.[0];
      if (phone) {
        values.phone = scalarValueNormalizer("phone", phone);
        matchedLine = true;
      }
    }
    const urls = line.content.match(/https?:\/\/[^\s|｜，,；;]+/gi) || [];
    for (const url of urls) {
      if (!values.githubUrl && /github\.com/i.test(url)) values.githubUrl = url;
      else if (!values.portfolioUrl) values.portfolioUrl = url;
      matchedLine = true;
    }
    if (matchedLine) consumed.add(line.index);
  }
  if (!values.fullName) values.fullName = filenameName(fileName);
  return values;
}

function compactLines(lines: SourceLine[]): SourceLine[] {
  return lines.filter((line) => !line.isBlank && Boolean(line.content));
}

function meaningfulParts(value: string): string[] {
  const clean = stripDateExpressions(cleanContent(value));
  const broad = clean
    .split(/\s*(?:\||｜|·|•|；|;)\s*|\t+|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (broad.length > 1) return broad;
  return clean.split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

function headerParts(value: string): string[] {
  return stripDateExpressions(cleanContent(value))
    .split(/\s*(?:\||｜|·|•|；|;)\s*|\t+|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasDate(value: string): boolean {
  return Boolean(parseResumeDateRange(value).startDate);
}

function looksLikeEntryLead(value: string, kind: ResumeSectionKind): boolean {
  const content = cleanContent(value);
  if (!content || content.length > 80 || /^[•·●○▪▫-]/.test(value) || /[。；;]/.test(content)) return false;
  if (kind === "education") return /(?:大学|学院|学校|中学)/.test(content);
  if (kind === "experience") return /(?:公司|集团|银行|研究院|研究所|事务所|工作室|实验室|中心|部门|政府|协会|委员会)/.test(content);
  if (kind === "project") return /^(?:项目[一二三四五六七八九十\d]+\s*[:：]|项目名称\s*[:：])/.test(content) || /(?:项目|平台|系统|产品|课题)$/.test(stripDateExpressions(content));
  if (kind === "campus") return /(?:学生会|研究生会|团委|社团|协会|班级|党支部|志愿者)/.test(content);
  if (kind === "award") return /(?:奖|荣誉|称号|表彰)/.test(content);
  return false;
}

function splitEntryGroups(lines: SourceLine[], kind: ResumeSectionKind): SourceLine[][] {
  const groups: SourceLine[][] = [];
  let current: SourceLine[] = [];
  let currentHasDate = false;
  let separated = false;

  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
    currentHasDate = false;
  };

  for (const line of lines) {
    if (line.isBlank || !line.content) {
      separated = true;
      continue;
    }
    const lineHasDate = hasDate(line.content);
    const dateStartsLine = new RegExp(`^${DATE_TOKEN_SOURCE}`, "i").test(line.content);
    const strongLead = looksLikeEntryLead(line.content, kind);
    const newAward = kind === "award" && current.length > 0 && (lineHasDate || (line.isBullet && /(?:奖|荣誉|称号|表彰)/.test(line.content)));
    const newByDate = current.length > 0 && currentHasDate && lineHasDate && (dateStartsLine || strongLead);
    const projectNameContinuation = kind === "project"
      && /^(?:项目名称|项目名)\s*[:：]/.test(line.content)
      && current.length <= 2;
    const newByLead = current.length > 0
      && currentHasDate
      && strongLead
      && !projectNameContinuation
      && (separated || !line.isBullet);
    if (newAward || newByDate || newByLead) flush();
    current.push(line);
    currentHasDate ||= lineHasDate;
    separated = false;
  }
  flush();
  return groups;
}

function firstLabeledValue(lines: SourceLine[], labels: readonly string[]): { value: string; line?: SourceLine } {
  for (const line of lines) {
    const result = extractLabeledValue(line.content, labels);
    if (result) return { value: result.value, line };
  }
  return { value: "" };
}

function firstDateRange(lines: SourceLine[]): { range: ResumeDateRange; line?: SourceLine } {
  for (const line of lines) {
    const range = parseResumeDateRange(line.content);
    if (range.startDate) return { range, line };
  }
  return { range: parseResumeDateRange("") };
}

function institutionIn(value: string): string {
  const clean = stripDateExpressions(value).replace(/[（(](?:985|211|双一流)[）)]/g, " ");
  return clean.match(/([\u3400-\u9fffA-Za-z0-9·&()（）-]{2,50}?(?:大学|学院|学校|中学))/)?.[1]?.trim() || "";
}

function parseEducationSection(section: WorkingSection): ParsedEntries<ProfileEducation> {
  const entries: ProfileEducation[] = [];
  const consumed = new Set<number>();
  for (const group of splitEntryGroups(section.lines, "education")) {
    const source = compactLines(group);
    const sourceText = source.map((line) => line.content).join(" ");
    const schoolLabeled = firstLabeledValue(source, ["学校", "院校", "毕业院校"]);
    const schoolLine = source.find((line) => institutionIn(line.content));
    const school = schoolLabeled.value || (schoolLine ? institutionIn(schoolLine.content) : "");
    const majorLabeled = firstLabeledValue(source, ["专业", "主修", "主修专业", "研究方向"]);
    const degreeLabeled = firstLabeledValue(source, ["学历", "学位"]);
    const degree = degreeLabeled.value || sourceText.match(/博士研究生|硕士研究生|博士|硕士|本科|学士|专科|大专|高中/)?.[0] || "";
    const dates = firstDateRange(source);
    const gpa = firstLabeledValue(source, ["GPA", "平均绩点", "绩点"]);
    const college = firstLabeledValue(source, ["学院", "院系"]);
    const educationForm = firstLabeledValue(source, ["学习形式", "培养方式", "教育形式"]);
    const educationFormValue = educationForm.value || sourceText.match(/全国普通高等院校非全日制|全国普通高等院校全日制|高等教育自学考试|成人高等教育|网络教育|开放教育|非全日制|全日制/)?.[0] || "";
    const courses = firstLabeledValue(source, ["核心课程", "主修课程", "课程"]);
    const researchDirection = firstLabeledValue(source, ["研究方向"]);
    const thesis = firstLabeledValue(source, ["论文", "毕业论文"]);
    const rank = firstLabeledValue(source, ["排名", "专业排名"]);

    let major = majorLabeled.value;
    if (!major && schoolLine) {
      const residual = stripDateExpressions(schoolLine.content)
        .replace(school, " ")
        .replace(degree, " ")
        .replace(/GPA\s*[:：]?\s*[\d./]+/i, " ")
        .replace(/[（(](?:985|211|双一流)[）)]/g, " ")
        .replace(/(?:专业|主修|学历|学位)\s*[:：]?/g, " ");
      major = meaningfulParts(residual).find((part) => /[\u3400-\u9fffA-Za-z]/.test(part) && !/^(?:全日制|非全日制)$/.test(part)) || "";
    }

    if (!school && !major && !degree) continue;
    const idValue = `${section.id}:${source.map((line) => `${line.index}:${line.content}`).join("|")}`;
    entries.push({
      id: stableId("education", idValue),
      school,
      college: college.value,
      major,
      degree,
      educationForm: educationFormValue,
      startDate: dates.range.startDate,
      endDate: dates.range.endDate,
      gpa: gpa.value
    });
    [schoolLabeled.line, schoolLine, majorLabeled.line, degreeLabeled.line, dates.line, gpa.line, college.line, educationForm.line, courses.line, researchDirection.line, thesis.line, rank.line]
      .filter((line): line is SourceLine => Boolean(line))
      .forEach((line) => consumed.add(line.index));
    if (courses.value) entries[entries.length - 1]!.courses = courses.value;
    if (researchDirection.value) entries[entries.length - 1]!.researchDirection = researchDirection.value;
    if (thesis.value) entries[entries.length - 1]!.thesis = thesis.value;
    if (rank.value) entries[entries.length - 1]!.rank = rank.value;
  }
  return { entries, consumed };
}

function organizationIn(value: string): string {
  const clean = stripDateExpressions(value);
  return clean.match(/([\u3400-\u9fffA-Za-z0-9·&()（）-]{2,50}?(?:有限责任公司|有限公司|公司|集团|银行|研究院|研究所|事务所|工作室|实验室|中心|部门|政府|协会|委员会|大学|学院|学校|团队))/)?.[1]?.trim() || "";
}

function detailText(lines: SourceLine[], excluded: Set<number>): string {
  return lines
    .filter((line) => !excluded.has(line.index) && !line.isBlank)
    .map((line) => cleanContent(line.content))
    .filter(Boolean)
    .join("\n");
}

function parseExperienceSection(section: WorkingSection): ParsedEntries<ProfileExperience> {
  const entries: ProfileExperience[] = [];
  const consumed = new Set<number>();
  for (const group of splitEntryGroups(section.lines, "experience")) {
    const source = compactLines(group);
    const sourceText = source.map((line) => line.content).join(" ");
    if (/(?:学生会|研究生会|团委|社团|协会|班级|班长|党支部|志愿者)/.test(sourceText)
      && !/(?:有限公司|有限责任公司|公司|集团|银行|研究院|研究所|事务所|工作室)/.test(sourceText)) {
      continue;
    }
    const organizationLabeled = firstLabeledValue(source, ["公司", "单位", "组织", "机构"]);
    const organizationLine = source.find((line) => organizationIn(line.content));
    let organization = organizationLabeled.value || (organizationLine ? organizationIn(organizationLine.content) : "");
    const titleLabeled = firstLabeledValue(source, ["职位", "岗位", "职务", "角色"]);
    const department = firstLabeledValue(source, ["部门", "事业部"]);
    const dates = firstDateRange(source);
    const lead = organizationLine || source.find((line) => !line.isBullet) || source[0];
    const parts = lead ? meaningfulParts(lead.content) : [];
    if (!organization && parts.length >= 2) organization = parts[0] || "";
    let title = titleLabeled.value;
    if (!title && lead) {
      const residual = stripDateExpressions(lead.content).replace(organization, " ").replace(department.value, " ");
      title = headerParts(residual).find((part) => part !== organization && /[\u3400-\u9fffA-Za-z]/.test(part)) || "";
    }
    if (!organization && !title) continue;

    const excluded = new Set<number>();
    [organizationLabeled.line, organizationLine, titleLabeled.line, department.line, dates.line, lead]
      .filter((line): line is SourceLine => Boolean(line))
      .forEach((line) => excluded.add(line.index));
    const description = detailText(source, excluded);
    source.forEach((line) => consumed.add(line.index));
    const entryId = stableId("experience", `${section.id}:${source.map((line) => `${line.index}:${line.content}`).join("|")}`);
    entries.push({
      id: entryId,
      organization,
      title,
      kind: /工作|职业/.test(section.heading) && !/实习/.test(section.heading) ? "work" : "internship",
      type: /实习/.test(section.heading) ? "实习" : /工作|职业/.test(section.heading) ? "工作" : "",
      department: department.value,
      startDate: dates.range.startDate,
      endDate: dates.range.endDate,
      description,
      contentBlocks: parseResumeContentBlocks(description, entryId),
      isCurrent: dates.range.isCurrent
    });
  }
  return { entries, consumed };
}

function parseProjectSection(section: WorkingSection): ParsedEntries<ProfileProject> {
  const entries: ProfileProject[] = [];
  const consumed = new Set<number>();
  const sectionLines = compactLines(section.lines);
  const sectionText = sectionLines.map((line) => line.content).join(" ");
  const listedNames = [...sectionText.matchAll(/《([^》]{2,120})》/g)]
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean)
    .filter((name, index, values) => values.indexOf(name) === index);
  if (listedNames.length > 1 && sectionLines.length <= 8) {
    sectionLines.forEach((line) => consumed.add(line.index));
    listedNames.forEach((name, index) => entries.push({
      id: stableId("project", `${section.id}:listed:${index}:${name}`),
      name,
      role: "",
      startDate: "",
      endDate: "",
      description: "",
      achievement: "",
      link: ""
    }));
    return { entries, consumed };
  }
  for (const group of splitEntryGroups(section.lines, "project")) {
    const source = compactLines(group);
    const nameLabeled = firstLabeledValue(source, ["项目名称", "项目名"]);
    const roleLabeled = firstLabeledValue(source, ["项目角色", "角色", "职责"]);
    const dates = firstDateRange(source);
    const lead = source.find((line) => !line.isBullet) || source[0];
    const parts = lead ? headerParts(lead.content.replace(/^项目[一二三四五六七八九十\d]+\s*[:：]?\s*/, "")) : [];
    let name = nameLabeled.value || parts[0] || "";
    name = stripDateExpressions(name).replace(/^项目(?:名称|经历|经验|实践)?\s*[:：]?\s*/, "").trim();
    const role = roleLabeled.value || (parts.length >= 2 ? parts[1] || "" : "");
    const link = source.map((line) => line.content).join(" ").match(/https?:\/\/[^\s|｜，,；;]+/i)?.[0] || "";
    const achievement = firstLabeledValue(source, ["项目成果", "成果", "业绩"]);
    if (!name) continue;
    const excluded = new Set<number>();
    [nameLabeled.line, roleLabeled.line, dates.line, lead, achievement.line]
      .filter((line): line is SourceLine => Boolean(line))
      .forEach((line) => excluded.add(line.index));
    const description = detailText(source, excluded);
    source.forEach((line) => consumed.add(line.index));
    const entryId = stableId("project", `${section.id}:${source.map((line) => `${line.index}:${line.content}`).join("|")}`);
    entries.push({
      id: entryId,
      name,
      role,
      startDate: dates.range.startDate,
      endDate: dates.range.endDate,
      description,
      contentBlocks: parseResumeContentBlocks(description, entryId),
      achievement: achievement.value,
      link
    });
  }
  return { entries, consumed };
}

function campusOrganizationIn(value: string): string {
  return stripDateExpressions(value).match(/([\u3400-\u9fffA-Za-z0-9·&()（）-]{0,30}?(?:学生会|研究生会|团委|社团|协会|班级|党支部|志愿者(?:协会|团队)?))/)?.[1]?.trim() || "";
}

function parseCampusSection(section: WorkingSection): ParsedEntries<ProfileCampusExperience> {
  const entries: ProfileCampusExperience[] = [];
  const consumed = new Set<number>();
  for (const group of splitEntryGroups(section.lines, "campus")) {
    const source = compactLines(group);
    const typeLabeled = firstLabeledValue(source, ["组织", "社团", "类型"]);
    const roleLabeled = firstLabeledValue(source, ["职务", "职位", "角色"]);
    const dates = firstDateRange(source);
    const lead = source.find((line) => !line.isBullet) || source[0];
    const parts = lead ? headerParts(lead.content) : [];
    const type = typeLabeled.value || (lead ? campusOrganizationIn(lead.content) : "") || (parts.length >= 2 ? parts[0] || "" : "");
    let role = roleLabeled.value;
    if (!role && lead) {
      role = headerParts(stripDateExpressions(lead.content).replace(type, " "))[0] || "";
    }
    if (!type && !role) continue;
    const excluded = new Set<number>();
    [typeLabeled.line, roleLabeled.line, dates.line, lead]
      .filter((line): line is SourceLine => Boolean(line))
      .forEach((line) => excluded.add(line.index));
    const description = detailText(source, excluded);
    source.forEach((line) => consumed.add(line.index));
    const entryId = stableId("campus", `${section.id}:${source.map((line) => `${line.index}:${line.content}`).join("|")}`);
    entries.push({
      id: entryId,
      type,
      role,
      startDate: dates.range.startDate,
      endDate: dates.range.endDate,
      description,
      contentBlocks: parseResumeContentBlocks(description, entryId)
    });
  }
  return { entries, consumed };
}

function parseCampusFromMixedExperience(section: WorkingSection): ParsedEntries<ProfileCampusExperience> {
  const campusLines: SourceLine[] = [];
  splitEntryGroups(section.lines, "experience").forEach((group, groupIndex) => {
    const sourceText = group.map((line) => line.content).join(" ");
    if (!/(?:学生会|研究生会|团委|社团|协会|班级|班长|党支部|志愿者)/.test(sourceText)) return;
    campusLines.push(...group, {
      index: -1_000_000 - groupIndex,
      text: "",
      content: "",
      isBlank: true,
      isBullet: false
    });
  });
  if (!campusLines.length) return { entries: [], consumed: new Set<number>() };
  return parseCampusSection({ ...section, kind: "campus", lines: campusLines });
}

function awardLevelIn(value: string): string {
  return value.match(/(?:国家级|省级|市级|校级|院级)?(?:特等奖|一等奖|二等奖|三等奖|金奖|银奖|铜奖|优秀奖|荣誉奖)|国家级|省级|市级|校级|院级/)?.[0] || "";
}

function splitAwardCandidates(value: string): string[] {
  const source = value
    .replace(/^(?:奖项荣誉|荣誉奖励|荣誉与奖项|获奖情况|奖项)\s*[:：]?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return [];
  return source
    .split(/[；;\n]+|、(?=[^、]{0,36}(?:奖|荣誉|优秀|十佳|志愿者|表彰))|\s+(?=(?:国家|省级|市级|校(?:级|一|二|三|特)|院(?:级|学生会)|全国|广东|三下乡|第[一二三四五六七八九十]))/)
    .map((candidate) => candidate.trim())
    .filter((candidate) => /(?:奖|荣誉|称号|表彰|优秀|十佳|志愿者)/.test(candidate));
}

function awardEntriesFromText(value: string, sourceId: string): ProfileAward[] {
  return splitAwardCandidates(value).map((candidate, index) => {
    const range = parseResumeDateRange(candidate);
    const level = awardLevelIn(candidate);
    const name = stripDateExpressions(candidate)
      .replace(/[（(]\s*(?:19|20)\d{2}(?:\s*[-—–~至]\s*(?:19|20)?\d{2})?\s*[）)]/g, "")
      .replace(level, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[|｜·•，,;；:：\s]+|[|｜·•，,;；:：\s]+$/g, "")
      .trim();
    return {
      id: stableId("award", `${sourceId}:${index}:${candidate}`),
      date: range.startDate,
      name,
      level,
      description: ""
    };
  }).filter((entry) => entry.name);
}

function parseAwardSection(section: WorkingSection): ParsedEntries<ProfileAward> {
  const entries: ProfileAward[] = [];
  const consumed = new Set<number>();
  for (const group of splitEntryGroups(section.lines, "award")) {
    const source = compactLines(group);
    const sourceText = source.map((line) => line.content).join(" ");
    const splitEntries = awardEntriesFromText(sourceText, `${section.id}:${source.map((line) => line.index).join("-")}`);
    if (splitEntries.length > 1) {
      entries.push(...splitEntries);
      source.forEach((line) => consumed.add(line.index));
      continue;
    }
    const nameLabeled = firstLabeledValue(source, ["奖项名称", "荣誉名称", "奖项"]);
    const levelLabeled = firstLabeledValue(source, ["级别", "等级"]);
    const date = firstDateRange(source);
    const level = levelLabeled.value || awardLevelIn(sourceText);
    const lead = source[0];
    let name = nameLabeled.value || (lead ? stripDateExpressions(lead.content) : "");
    name = name
      .replace(level, " ")
      .replace(/^(?:奖项名称|荣誉名称|奖项)\s*[:：]?\s*/, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[|｜·•，,;；:：\s]+|[|｜·•，,;；:：\s]+$/g, "")
      .trim();
    if (!name || (!date.range.startDate && !level && !/(?:奖|荣誉|称号|表彰)/.test(name))) continue;
    const excluded = new Set<number>();
    [nameLabeled.line, levelLabeled.line, date.line, lead]
      .filter((line): line is SourceLine => Boolean(line))
      .forEach((line) => excluded.add(line.index));
    const description = detailText(source, excluded);
    source.forEach((line) => consumed.add(line.index));
    entries.push({
      id: stableId("award", `${section.id}:${source.map((line) => `${line.index}:${line.content}`).join("|")}`),
      date: date.range.startDate,
      name,
      level,
      description
    });
  }
  return { entries, consumed };
}

function parseInlineAwards(sections: WorkingSection[]): ParsedEntries<ProfileAward> {
  const entries: ProfileAward[] = [];
  const consumed = new Set<number>();
  for (const section of sections) {
    if (section.kind === "award") continue;
    const lines = section.lines;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line || line.isBlank || !/(?:奖项|奖学金|特等奖|一等奖|二等奖|三等奖|金奖|银奖|铜奖|优秀团队|优秀干部|十佳|最美未成年人志愿者)/.test(line.content)) continue;
      let source = line.content;
      let cursor = index + 1;
      while (cursor < lines.length && lines[cursor] && !lines[cursor]!.isBlank && !lines[cursor]!.isBullet) {
        source += ` ${lines[cursor]!.content}`;
        cursor += 1;
      }
      const parsed = awardEntriesFromText(source.replace(/^.*?奖项\s*[:：]?\s*/, ""), `${section.id}:inline:${line.index}`);
      if (!parsed.length) continue;
      entries.push(...parsed);
      for (let consumedIndex = index; consumedIndex < cursor; consumedIndex += 1) {
        if (lines[consumedIndex]) consumed.add(lines[consumedIndex]!.index);
      }
      index = Math.max(index, cursor - 1);
    }
  }
  const seen = new Set<string>();
  return {
    entries: entries.filter((entry) => {
      const key = `${entry.name.replace(/\s+/g, "")}:${entry.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    consumed
  };
}

function summaryField(heading: string): "selfIntroduction" | "strengths" | "careerPlan" | "targetRole" {
  if (/优势|评价/.test(heading)) return "strengths";
  if (/规划/.test(heading)) return "careerPlan";
  if (/求职/.test(heading)) return "targetRole";
  return "selfIntroduction";
}

function sectionSourceText(section: WorkingSection): string {
  return compactLines(section.lines).map((line) => line.text).join("\n");
}

function diagnosticSection(section: WorkingSection, entryCount: number): ResumeParsedSection {
  const allLines = [section.headingLine, ...section.lines].filter((line): line is SourceLine => Boolean(line));
  const indices = allLines.map((line) => line.index);
  const fallback = section.headingLine?.index ?? section.lines[0]?.index ?? 0;
  return {
    id: section.id,
    kind: section.kind,
    heading: section.heading,
    startLine: (indices.length ? Math.min(...indices) : fallback) + 1,
    endLine: (indices.length ? Math.max(...indices) : fallback) + 1,
    sourceText: allLines.filter((line) => !line.isBlank).map((line) => line.text).join("\n"),
    entryCount
  };
}

/**
 * Pure, deterministic resume parser. It never performs OCR, I/O, network calls,
 * random ID generation, or time-based normalization.
 */
export function parseResumeStructuredText(rawText: string, fileName: string): ResumeStructuredParseResult {
  const normalizedText = normalizeResumeStructuredText(rawText);
  const lines = makeSourceLines(normalizedText);
  const consumed = new Set<number>();
  const scalars = parseScalars(lines, fileName, consumed);
  const profile = emptyProfile(scalars);
  const sections = buildSections(lines, consumed);
  const diagnosticsSections: ResumeParsedSection[] = [];
  const warnings: string[] = [];

  for (const section of sections) {
    let entryCount = 0;
    if (section.kind === "education") {
      const result = parseEducationSection(section);
      profile.education.push(...result.entries);
      result.consumed.forEach((index) => consumed.add(index));
      entryCount = result.entries.length;
    } else if (section.kind === "experience") {
      const result = parseExperienceSection(section);
      const campusResult = parseCampusFromMixedExperience(section);
      profile.experiences.push(...result.entries);
      profile.campusExperiences.push(...campusResult.entries);
      result.consumed.forEach((index) => consumed.add(index));
      campusResult.consumed.forEach((index) => consumed.add(index));
      entryCount = result.entries.length + campusResult.entries.length;
    } else if (section.kind === "project") {
      const result = parseProjectSection(section);
      profile.projects.push(...result.entries);
      result.consumed.forEach((index) => consumed.add(index));
      entryCount = result.entries.length;
    } else if (section.kind === "campus") {
      const result = parseCampusSection(section);
      profile.campusExperiences.push(...result.entries);
      result.consumed.forEach((index) => consumed.add(index));
      entryCount = result.entries.length;
    } else if (section.kind === "award") {
      const result = parseAwardSection(section);
      profile.awards.push(...result.entries);
      result.consumed.forEach((index) => consumed.add(index));
      entryCount = result.entries.length;
    } else if (section.kind === "summary") {
      const value = sectionSourceText(section);
      if (value) {
        const field = summaryField(section.heading);
        if (!profile[field]) profile[field] = value;
        compactLines(section.lines).forEach((line) => consumed.add(line.index));
        entryCount = 1;
      }
    } else if (section.kind === "skills") {
      const value = sectionSourceText(section);
      if (value) {
        profile.extraFields = { ...(profile.extraFields || {}), [section.heading || "技能与证书"]: value };
        compactLines(section.lines).forEach((line) => consumed.add(line.index));
        entryCount = 1;
      }
    }

    if (["education", "experience", "project", "campus", "award"].includes(section.kind) && compactLines(section.lines).length && entryCount === 0) {
      warnings.push(`章节“${section.heading}”存在内容，但没有可靠解析出条目。`);
    }
    diagnosticsSections.push(diagnosticSection(section, entryCount));
  }

  const inlineAwards = parseInlineAwards(sections);
  const existingAwardKeys = new Set(profile.awards.map((entry) => `${entry.name.replace(/\s+/g, "")}:${entry.date}`));
  inlineAwards.entries.forEach((entry) => {
    const key = `${entry.name.replace(/\s+/g, "")}:${entry.date}`;
    if (existingAwardKeys.has(key)) return;
    existingAwardKeys.add(key);
    profile.awards.push(entry);
  });
  inlineAwards.consumed.forEach((index) => consumed.add(index));

  if (!profile.graduationDate) {
    const datedEducation = [...profile.education].reverse().find((entry) => entry.endDate && entry.endDate !== "至今");
    if (datedEducation) profile.graduationDate = datedEducation.endDate;
  }

  const nonEmptyLines = lines.filter((line) => !line.isBlank);
  const unclassifiedLines = nonEmptyLines
    .filter((line) => !consumed.has(line.index))
    .map((line) => ({ line: line.index + 1, text: line.text }));
  const coveredLines = nonEmptyLines.length - unclassifiedLines.length;
  const coverage = nonEmptyLines.length ? coveredLines / nonEmptyLines.length : 1;

  if (!diagnosticsSections.some((section) => section.kind !== "header" && section.kind !== "unknown")) {
    warnings.push("没有识别到明确的简历章节标题；原文已保留在未分类内容中。");
  }
  if (unclassifiedLines.length) warnings.push(`有 ${unclassifiedLines.length} 行内容未可靠归类，已完整保留。`);
  if (coverage < 0.8) warnings.push(`结构化覆盖率为 ${(coverage * 100).toFixed(1)}%，建议人工核对未分类内容。`);

  return {
    profile,
    diagnostics: {
      fileName,
      normalizedText,
      totalNonEmptyLines: nonEmptyLines.length,
      coveredLines,
      coverage,
      sections: diagnosticsSections,
      unclassifiedLines,
      unclassifiedText: unclassifiedLines.map((line) => line.text).join("\n"),
      warnings: [...new Set(warnings)]
    }
  };
}
