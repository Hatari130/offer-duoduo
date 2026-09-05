import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from "react";
import type {
  PersonalProfile,
  ProfileAward,
  ProfileCampusExperience,
  ProfileEducation,
  ProfileProject,
  ResumeAsset,
  ResumeContentBlock,
  ResumeDocument,
  ResumeStudioSectionKey,
  ResumeTailorProposal
} from "@offerflow/domain";
import {
  createResumeDocument,
  hydrateResumeProfileSemantics,
  resolveProfileExperienceKind,
  RESUME_TEMPLATES,
  serializeResumeContentBlocks
} from "@offerflow/domain";
import {
  AlertTriangle,
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Award,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  ImagePlus,
  LayoutTemplate,
  List,
  ListPlus,
  LoaderCircle,
  Minus,
  Palette,
  PencilLine,
  Plus,
  RotateCcw,
  Route,
  Save,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { api } from "../app/api";
import { createUuid } from "../app/id";
import { navigate, startUiTransition } from "../app/router";
import { calculateResumePreviewScale } from "../features/resumes/resumePreviewLayout";
import ExperienceEditor from "../features/resumes/ExperienceEditor";
import { blockInlineText } from "../features/resumes/descriptionDocument";
import {
  isStudioSectionHidden,
  moveStudioSection,
  normalizeStudioSectionOrder,
  toggleStudioSectionHidden
} from "../features/resumes/resumeStudioSections";

type StudioTab = "preview" | "editor";
type SaveState = "idle" | "saving" | "saved" | "error";

export type ResumeStepKey =
  | "personal"
  | "education"
  | "internship"
  | "work"
  | "projects"
  | "skills"
  | "summary"
  | "campus"
  | "awards";

export interface StepMeta {
  key: ResumeStepKey;
  sectionKey?: ResumeStudioSectionKey;
  label: string;
  shortLabel: string;
  description: string;
}

const STEP_METAS: Record<ResumeStepKey, StepMeta> = {
  personal: { key: "personal", label: "个人信息", shortLabel: "信息", description: "姓名、联系方式与求职意向" },
  education: { key: "education", sectionKey: "education", label: "教育背景", shortLabel: "教育", description: "学校、专业、学历和在校时间" },
  internship: { key: "internship", sectionKey: "internship", label: "实习经历", shortLabel: "实习", description: "实习中的行动、成果与量化结果" },
  work: { key: "work", sectionKey: "work", label: "工作经历", shortLabel: "工作", description: "正式工作中的职责、成果与量化结果" },
  projects: { key: "projects", sectionKey: "projects", label: "项目经历", shortLabel: "项目", description: "项目成果、职责与技术产物" },
  skills: { key: "skills", sectionKey: "skills", label: "专业技能", shortLabel: "技能", description: "岗位相关的专业技能、工具与关键词" },
  summary: { key: "summary", sectionKey: "summary", label: "个人简介", shortLabel: "简介", description: "用简洁证据总结核心优势" },
  campus: { key: "campus", sectionKey: "campus", label: "校园经历", shortLabel: "在校", description: "社团干部、活动实践与组织协作" },
  awards: { key: "awards", sectionKey: "awards", label: "荣誉奖项", shortLabel: "奖项", description: "奖学金、竞赛荣誉与专业资质" }
};

const RESUME_STEPS: readonly StepMeta[] = Object.values(STEP_METAS);

const makeId = (prefix: string) => `${prefix}_${createUuid()}`;

function displayDate(value?: string): string {
  if (!value) return "";
  return value
    .replace(/年|\/|-/g, ".")
    .replace(/月|日/g, "")
    .replace(/\.$/, "")
    .trim();
}

function displayDateRange(startDate?: string, endDate?: string, isCurrent = false): string {
  const start = displayDate(startDate);
  const end = isCurrent ? "至今" : displayDate(endDate);
  return [start, end].filter(Boolean).join(" ～ ");
}

function normalizeDateInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "至今" || trimmed.toLowerCase() === "present") return "至今";
  return trimmed
    .replace(/年|\/|-/g, ".")
    .replace(/月|日/g, "")
    .replace(/\.$/, "")
    .trim();
}

function isResumeStepComplete(document: ResumeDocument, step: ResumeStepKey): boolean {
  const { profile } = document;
  switch (step) {
    case "personal":
      return Boolean(profile.fullName && (profile.phone || profile.email));
    case "education":
      return profile.education.some((item) => Boolean(item.school));
    case "internship":
    case "work":
      return profile.experiences.some((item) => resolveProfileExperienceKind(item) === step && Boolean(item.organization || item.title));
    case "projects":
      return profile.projects.some((item) => Boolean(item.name));
    case "skills":
      return Boolean(profile.strengths);
    case "summary":
      return Boolean(profile.selfIntroduction);
    case "campus":
      return profile.campusExperiences.length > 0;
    case "awards":
      return profile.awards.length > 0;
  }
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  wide = false,
  multiline = false
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
  multiline?: boolean;
}) {
  const id = useMemo(() => `field_${createUuid()}`, []);
  return (
    <label className={wide ? "resume-field resume-field--wide" : "resume-field"} htmlFor={id}>
      <span>{label}</span>
      {multiline ? (
        <textarea id={id} value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} />
      ) : (
        <input id={id} value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  placeholder = "2024.09",
  allowCurrent = false
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCurrent?: boolean;
}) {
  const id = useMemo(() => `field_${createUuid()}`, []);
  return (
    <div className="resume-field resume-date-field">
      <label htmlFor={id}>
        <span>{label}</span>
      </label>
      <div className="resume-date-input-wrap">
        <input
          id={id}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(normalizeDateInput(e.target.value))}
          placeholder={placeholder}
        />
        {allowCurrent && (
          <button
            type="button"
            className={`resume-date-current-btn ${value === "至今" ? "is-active" : ""}`}
            onClick={() => onChange(value === "至今" ? "" : "至今")}
            title="一键设为至今"
          >
            至今
          </button>
        )}
      </div>
    </div>
  );
}

function EditorSection({
  icon,
  title,
  description,
  children,
  action
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="resume-editor-section">
      <header>
        <span className="resume-section-icon">{icon}</span>
        <span><strong>{title}</strong><small>{description}</small></span>
        <span className="resume-section-action">{action}</span>
      </header>
      <div className="resume-section-body">{children}</div>
    </section>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value?: string; onChange: (value: string) => void; children: ReactNode }) {
  const id = useMemo(() => `field_${createUuid()}`, []);
  return <label className="resume-field" htmlFor={id}><span>{label}</span><select id={id} value={value || ""} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function CheckField({ label, checked, onChange }: { label: string; checked?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="resume-check-field"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function ResumePaperStage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateScale = (width: number) => {
      // A hidden mobile preview has no measurable width; retain its last scale.
      if (width > 0) setScale(calculateResumePreviewScale(width));
    };
    const style = window.getComputedStyle(stage);
    updateScale(stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateScale(entry.contentRect.width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return <div ref={stageRef} className="resume-paper-stage" style={{ "--resume-preview-scale": scale } as React.CSSProperties}>{children}</div>;
}

function ResumePreview({
  document,
  activeStep,
  onSelectStep,
  paperRef
}: {
  document: ResumeDocument;
  activeStep: ResumeStepKey;
  onSelectStep: (step: ResumeStepKey) => void;
  paperRef: React.RefObject<HTMLElement | null>;
}) {
  const { profile, template } = document;
  const accentStyle = {
    "--resume-accent": template.templateId === "clarity" ? "#050505" : template.accentColor
  } as React.CSSProperties;

  const portrait = document.assets?.find((asset) => asset.id === document.portraitAssetId);
  const profileLinks = [
    { label: "个人作品网站", url: profile.portfolioUrl?.trim() },
    { label: "GitHub", url: profile.githubUrl?.trim() }
  ].filter((item, index, items) => item.url && items.findIndex((candidate) => candidate.url === item.url) === index);

  const internships = profile.experiences.filter((item) => resolveProfileExperienceKind(item) === "internship");
  const workExperiences = profile.experiences.filter((item) => resolveProfileExperienceKind(item) === "work");

  // Fix Issue 02: Support both newline and semicolon delimiters
  const skillLines = profile.strengths
    ? profile.strengths
        .split(/\r?\n+|[；;]+/)
        .map((item) => item.replace(/^[•·▪●\-]\s*/, "").trim())
        .filter(Boolean)
    : [];

  const sectionOrder = normalizeStudioSectionOrder(template);
  const pageLimit = template.pageLimit || 1;

  const renderSection = (key: ResumeStudioSectionKey) => {
    if (isStudioSectionHidden(template, key)) return null;

    switch (key) {
      case "summary":
        return profile.selfIntroduction ? (
          <PreviewSection
            key="summary"
            title="个人简介"
            step="summary"
            selected={activeStep === "summary"}
            onSelect={onSelectStep}
          >
            <p className="resume-summary">{profile.selfIntroduction}</p>
          </PreviewSection>
        ) : null;

      case "education":
        return profile.education.length > 0 ? (
          <PreviewSection
            key="education"
            title="教育背景"
            step="education"
            selected={activeStep === "education"}
            onSelect={onSelectStep}
          >
            {profile.education.map((item) => (
              <PreviewEntry
                key={item.id}
                title={[item.school, item.college].filter(Boolean).join("｜")}
                middle={[item.major, item.degree].filter(Boolean).join("｜")}
                meta={displayDateRange(item.startDate, item.endDate)}
                subtitle={[item.gpa && `GPA ${item.gpa}`, item.rank, item.courses].filter(Boolean).join("｜")}
              />
            ))}
          </PreviewSection>
        ) : null;

      case "internship":
        return internships.length > 0 ? (
          <PreviewSection
            key="internship"
            title="实习经历"
            step="internship"
            selected={activeStep === "internship"}
            onSelect={onSelectStep}
          >
            {internships.map((item) => (
              <PreviewEntry
                key={item.id}
                title={[item.organization, item.department].filter(Boolean).join("｜")}
                middle={item.title}
                meta={displayDateRange(item.startDate, item.endDate, item.isCurrent)}
                blocks={item.contentBlocks}
              />
            ))}
          </PreviewSection>
        ) : null;

      case "work":
        return workExperiences.length > 0 ? (
          <PreviewSection
            key="work"
            title="工作经历"
            step="work"
            selected={activeStep === "work"}
            onSelect={onSelectStep}
          >
            {workExperiences.map((item) => (
              <PreviewEntry
                key={item.id}
                title={[item.organization, item.department].filter(Boolean).join("｜")}
                middle={item.title}
                meta={displayDateRange(item.startDate, item.endDate, item.isCurrent)}
                blocks={item.contentBlocks}
              />
            ))}
          </PreviewSection>
        ) : null;

      case "projects":
        return profile.projects.length > 0 ? (
          <PreviewSection
            key="projects"
            title="项目经历"
            step="projects"
            selected={activeStep === "projects"}
            onSelect={onSelectStep}
          >
            {profile.projects.map((item) => (
              <PreviewEntry
                key={item.id}
                title={item.name}
                middle={item.role}
                meta={displayDateRange(item.startDate, item.endDate, Boolean(item.startDate && !item.endDate))}
                link={item.link}
                blocks={item.contentBlocks}
              />
            ))}
          </PreviewSection>
        ) : null;

      case "campus":
        return profile.campusExperiences.length > 0 ? (
          <PreviewSection
            key="campus"
            title="在校经历"
            step="campus"
            selected={activeStep === "campus"}
            onSelect={onSelectStep}
          >
            {profile.campusExperiences.map((item) => (
              <PreviewEntry
                key={item.id}
                title={`${item.type}${item.role ? ` · ${item.role}` : ""}`}
                meta={displayDateRange(item.startDate, item.endDate)}
                blocks={item.contentBlocks}
              />
            ))}
          </PreviewSection>
        ) : null;

      case "awards":
        return profile.awards.length > 0 ? (
          <PreviewSection
            key="awards"
            title="获奖情况"
            step="awards"
            selected={activeStep === "awards"}
            onSelect={onSelectStep}
          >
            {profile.awards.map((item) => (
              <PreviewEntry
                key={item.id}
                title={item.name}
                meta={displayDate(item.date)}
                subtitle={[item.level, item.description].filter(Boolean).join(" · ")}
              />
            ))}
          </PreviewSection>
        ) : null;

      case "skills":
        return profile.strengths || profile.hobbies ? (
          <PreviewSection
            key="skills"
            title="技能特长"
            step="skills"
            selected={activeStep === "skills"}
            onSelect={onSelectStep}
          >
            {skillLines.length > 0 && (
              <ul className="resume-skill-list">
                {skillLines.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            )}
            {profile.hobbies && <p className="resume-summary">{profile.hobbies}</p>}
          </PreviewSection>
        ) : null;
    }
  };

  return (
    <article
      ref={paperRef as any}
      className={`resume-paper resume-paper--${template.templateId}`}
      style={accentStyle}
      aria-label="简历实时预览"
    >
      {/* Fix Issue 03: Page 1 and Page 2 Break Indicators */}
      <div className="resume-page-break-line" style={{ top: "297mm" }} aria-hidden="true">
        <span className="resume-page-break-badge">
          第 1 页截止线 {pageLimit === 1 ? "（超出部分将印入第 2 页）" : ""}
        </span>
      </div>
      {pageLimit === 2 && (
        <div className="resume-page-break-line" style={{ top: "594mm" }} aria-hidden="true">
          <span className="resume-page-break-badge">第 2 页截止线</span>
        </div>
      )}

      <header
        className={`resume-paper-header ${portrait ? "has-portrait" : "without-portrait"} ${
          profileLinks.length ? "has-profile-links" : "without-profile-links"
        }`}
      >
        <div className="resume-paper-identity">
          <h1>{profile.fullName || "你的姓名"}</h1>

          {/* Fix Issue 01: Earliest start date and target cities both display properly without || drop */}
          <p className="resume-header-line resume-header-intent">
            <span>求职意向：{profile.targetRole || "目标岗位"}</span>
            {profile.earliestStartDate && (
              <>
                <i aria-hidden="true" />
                <span>到岗：{profile.earliestStartDate}</span>
              </>
            )}
            {(profile.targetCities || profile.currentCity) && (
              <>
                <i aria-hidden="true" />
                <span>地点：{profile.targetCities || profile.currentCity}</span>
              </>
            )}
          </p>

          <p className="resume-header-line resume-header-contact">
            {profile.phone && <span>{profile.phone}</span>}
            {profile.phone && profile.email && <i aria-hidden="true" />}
            {profile.email && <span>{profile.email}</span>}
            {!profile.phone && !profile.email && <span>手机号&nbsp;&nbsp;|&nbsp;&nbsp;邮箱</span>}
          </p>

          {profileLinks.map((link) => (
            <p className="resume-header-line resume-header-portfolio" key={`${link.label}-${link.url}`}>
              <span>{link.label}：</span>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.url}
              </a>
            </p>
          ))}
        </div>
        {portrait ? (
          <img className="resume-portrait" src={portrait.dataUrl} alt={`${profile.fullName || "候选人"}的简历照片`} />
        ) : (
          <span className="resume-monogram" aria-hidden="true">
            {(profile.fullName || "OF").slice(-1)}
          </span>
        )}
      </header>

      {/* Fix Issue 09: Render sections dynamically according to sectionOrder and hiddenSections */}
      {sectionOrder.map((key) => renderSection(key))}
    </article>
  );
}

function PreviewSection({ title, step, selected, onSelect, children }: { title: string; step: ResumeStepKey; selected: boolean; onSelect: (step: ResumeStepKey) => void; children: ReactNode }) {
  return <section className={`resume-preview-section ${selected ? "is-selected" : ""}`}><h2><button type="button" onClick={() => onSelect(step)} aria-label={`编辑${title}`} aria-current={selected ? "step" : undefined}>{title}</button></h2><div>{children}</div></section>;
}

function ResumeBlockText({ block }: { block: ResumeContentBlock }) {
  return <span className="resume-rich-inline">{blockInlineText(block).map((run, index) => {
    const text = run.bold ? <strong>{run.text}</strong> : run.text;
    return run.href ? <a key={index} href={run.href} target="_blank" rel="noreferrer">{text}</a> : <span key={index}>{text}</span>;
  })}</span>;
}

function ResumeBlocks({ blocks }: { blocks?: ResumeContentBlock[] }) {
  if (!blocks?.length) return null;
  const nodes: ReactNode[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index]!;
    if (block.kind === "bullet") {
      const bullets: ResumeContentBlock[] = [];
      const ordered = Boolean(block.listOrder);
      let expectedOrder = block.listOrder;
      while (blocks[index]?.kind === "bullet" && Boolean(blocks[index]?.listOrder) === ordered && (!ordered || blocks[index]?.listOrder === expectedOrder)) {
        bullets.push(blocks[index++]!);
        if (expectedOrder) expectedOrder++;
      }
      const ListTag = ordered ? "ol" : "ul";
      nodes.push(<ListTag start={ordered ? block.listOrder : undefined} key={`bullets-${bullets[0]?.id}`}>{bullets.map((item) => <li key={item.id}><ResumeBlockText block={item} /></li>)}</ListTag>);
      continue;
    }
    if (block.kind === "project") {
      nodes.push(<div className="resume-content-project" key={block.id}><h3>{block.title}</h3><ResumeBlocks blocks={block.children} /></div>);
    } else {
      nodes.push(<p className="resume-content-paragraph" key={block.id}>{block.text || block.label ? <ResumeBlockText block={block} /> : <br />}</p>);
    }
    index += 1;
  }
  return <div className="resume-content-blocks">{nodes}</div>;
}

function PreviewEntry({ title, middle, meta, subtitle, link, blocks }: { title: string; middle?: string; meta?: string; subtitle?: string; link?: string; blocks?: ResumeContentBlock[] }) {
  return (
    <div className="resume-preview-entry">
      <div className="resume-entry-heading"><strong>{title}</strong>{middle && <b>{middle}</b>}{meta && <span>{meta}</span>}</div>
      {link && <a className="resume-entry-link" href={link} target="_blank" rel="noreferrer">{link}</a>}
      {subtitle && <p>{subtitle}</p>}
      <ResumeBlocks blocks={blocks} />
    </div>
  );
}
function TemplatePicker({ value, onChange }: { value: ResumeDocument["template"]["templateId"]; onChange: (value: ResumeDocument["template"]["templateId"]) => void }) {
  return (
    <section className="resume-template-picker" aria-labelledby="resume-template-title">
      <header><div><span>版式系统</span><strong id="resume-template-title">选择简历模板</strong></div><small>只改变排版，不改内容</small></header>
      <div className="resume-template-grid">
        {RESUME_TEMPLATES.map((template) => (
          <button key={template.id} type="button" className={`resume-template-card is-${template.id}`} aria-pressed={value === template.id} onClick={() => onChange(template.id)}>
            <span className="resume-template-mini" aria-hidden="true"><i /><i /><i /><i /></span>
            <span><strong>{template.name}</strong><small>{template.description}</small><em>{template.bestFor}</em></span>
            {value === template.id && <Check size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </section>
  );
}

function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取这张图片"));
    image.src = dataUrl;
  });
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取这张图片"));
    reader.onerror = () => reject(reader.error || new Error("无法读取这张图片"));
    reader.readAsDataURL(file);
  });
}

function PortraitAssetPicker({
  assets = [],
  selectedId,
  onChange,
  onError
}: {
  assets?: ResumeAsset[];
  selectedId?: string;
  onChange: (assets: ResumeAsset[], selectedId?: string) => void;
  onError: (message: string) => void;
}) {
  const upload = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(file.type)) {
      onError("请上传 PNG、JPG 或 WebP 图片");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError("图片不能超过 5MB");
      return;
    }
    try {
      const dataUrl = await fileDataUrl(file);
      const dimensions = await imageDimensions(dataUrl);
      const asset: ResumeAsset = {
        id: makeId("portrait"),
        kind: "portrait",
        dataUrl,
        mimeType: file.type,
        width: dimensions.width,
        height: dimensions.height,
        source: "upload",
        confidence: 1
      };
      onChange([...assets, asset], asset.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "无法读取这张图片");
    }
  };

  const remove = (assetId: string) => {
    const next = assets.filter((asset) => asset.id !== assetId);
    const nextSelected = selectedId === assetId
      ? next.find((asset) => asset.kind === "portrait")?.id || next[0]?.id
      : selectedId;
    onChange(next, nextSelected);
  };

  return (
    <section className="resume-portrait-picker" aria-labelledby="resume-portrait-title">
      <header>
        <span><strong id="resume-portrait-title">简历照片</strong><small>PDF 中的原图会自动迁移；识别不准时可重新选择</small></span>
        <label className="resume-portrait-upload"><ImagePlus size={15} />上传照片<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </header>
      <div className="resume-portrait-assets">
        {assets.map((asset) => (
          <div className="resume-portrait-option" key={asset.id}>
            <button type="button" className="resume-portrait-select" aria-pressed={asset.id === selectedId} onClick={() => onChange(assets, asset.id)}>
              <img src={asset.dataUrl} alt={`候选照片，来源：${asset.source === "pdf" ? `PDF 第 ${asset.sourcePage || 1} 页` : "手动上传"}`} />
              <span>{asset.source === "pdf" ? `PDF · 第 ${asset.sourcePage || 1} 页` : "手动上传"}</span>
              {asset.id === selectedId && <Check size={14} aria-hidden="true" />}
            </button>
            <button type="button" className="resume-portrait-remove" aria-label="删除这张候选照片" onClick={() => remove(asset.id)}><Trash2 size={13} /></button>
          </div>
        ))}
        <button type="button" className="resume-portrait-none" aria-pressed={!selectedId} onClick={() => onChange(assets, undefined)}><UserRound size={18} /><span>不显示照片</span></button>
      </div>
      {!assets.length && <p>当前简历没有可用图片。重新导入原 PDF，或在这里上传证件照。</p>}
    </section>
  );
}

export function ResumeStudioPage({ taskId, templateId }: { taskId?: string; templateId?: string }) {
  const [document, setDocument] = useState<ResumeDocument>();
  const [taskTitle, setTaskTitle] = useState(taskId ? "正在载入岗位…" : "正在载入简历…");
  const [versionId, setVersionId] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<StudioTab>("editor");
  const [activeStep, setActiveStep] = useState<ResumeStepKey>("personal");
  const [proposal, setProposal] = useState<ResumeTailorProposal>();
  const [tailoring, setTailoring] = useState(false);
  const [zoom, setZoom] = useState(0.85);
  const [paperHeightMm, setPaperHeightMm] = useState(0);
  const [aiAuditOpen, setAiAuditOpen] = useState(false);
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);
  const [expandedExpId, setExpandedExpId] = useState<string | null>(null);
  const [expandedEduId, setExpandedEduId] = useState<string | null>(null);
  const [expandedProjId, setExpandedProjId] = useState<string | null>(null);
  const [expandedCampusId, setExpandedCampusId] = useState<string | null>(null);
  const [expandedAwardId, setExpandedAwardId] = useState<string | null>(null);

  const revisionRef = useRef(0);
  const savedDocumentRef = useRef("");
  const saveQueueRef = useRef(Promise.resolve());
  const paperRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = taskId
      ? api.resumes.getTailorTask(taskId).then(({ task, version }) => {
          const hydratedDocument = {
            ...version.version.document,
            profile: hydrateResumeProfileSemantics(version.version.document.profile)
          };
          return {
            document: hydratedDocument,
            title: `${task.job.company} · ${task.job.position}`,
            versionId: version.version.id,
            revision: version.revision
          };
        })
      : templateId
        ? api.resumes.getTemplate(templateId).then(({ template }) => {
            const resumeDocument =
              template.document ||
              createResumeDocument({
                id: template.id,
                title: template.name,
                profile: template.profile
              });
            return {
              document: {
                ...resumeDocument,
                title: template.name,
                profile: hydrateResumeProfileSemantics(template.profile)
              },
              title: template.name,
              versionId: "",
              revision: 0
            };
          })
        : Promise.reject(new Error("缺少简历标识"));

    load
      .then((loaded) => {
        if (!active) return;
        setTaskTitle(loaded.title);
        setVersionId(loaded.versionId);
        revisionRef.current = loaded.revision;
        savedDocumentRef.current = JSON.stringify(loaded.document);
        setDocument(loaded.document);
        setSaveState("saved");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : taskId ? "无法载入这次简历定制任务" : "无法载入这份通用简历");
      });
    return () => {
      active = false;
    };
  }, [taskId, templateId]);

  useLayoutEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    const measure = () => {
      const scrollHeight = paper.scrollHeight;
      const heightMm = scrollHeight / 3.7795;
      setPaperHeightMm(Math.round(heightMm));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    return () => observer.disconnect();
  }, [document]);

  const triggerImmediateSave = async () => {
    if (!document || (!versionId && !templateId)) return;
    setSaveState("saving");
    const snapshot = structuredClone(document);
    try {
      if (taskId) {
        const result = await api.resumes.updateVersion(versionId, {
          document: snapshot,
          expectedRevision: revisionRef.current
        });
        revisionRef.current = result.item.revision;
      } else if (templateId) {
        const result = await api.resumes.updateTemplate(templateId, {
          name: snapshot.title,
          document: snapshot
        });
        setTaskTitle(result.template.name);
      }
      savedDocumentRef.current = JSON.stringify(snapshot);
      setSaveState("saved");
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "保存失败，请点击重试");
    }
  };

  useEffect(() => {
    if (!document || (!versionId && !templateId)) return;
    const serialized = JSON.stringify(document);
    if (serialized === savedDocumentRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const snapshot = structuredClone(document);
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        try {
          if (taskId) {
            const result = await api.resumes.updateVersion(versionId, {
              document: snapshot,
              expectedRevision: revisionRef.current
            });
            revisionRef.current = result.item.revision;
          } else if (templateId) {
            const result = await api.resumes.updateTemplate(templateId, {
              name: snapshot.title,
              document: snapshot
            });
            setTaskTitle(result.template.name);
          }
          savedDocumentRef.current = JSON.stringify(snapshot);
          setSaveState(JSON.stringify(document) === JSON.stringify(snapshot) ? "saved" : "saving");
        } catch (cause) {
          setSaveState("error");
          setError(cause instanceof Error ? cause.message : "自动保存失败");
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [document, taskId, templateId, versionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void triggerImmediateSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [document, versionId, templateId, taskId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState === "saving" || (document && JSON.stringify(document) !== savedDocumentRef.current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [document, saveState]);

  const updateProfile = <K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) => {
    setDocument((current) =>
      current
        ? {
            ...current,
            profile: { ...current.profile, [key]: value },
            updatedAt: new Date().toISOString()
          }
        : current
    );
  };

  const updateTemplate = (patch: Partial<ResumeDocument["template"]>) => {
    setDocument((current) =>
      current
        ? {
            ...current,
            template: { ...current.template, ...patch },
            updatedAt: new Date().toISOString()
          }
        : current
    );
  };

  const updateAssets = (assets: ResumeAsset[], portraitAssetId?: string) => {
    setDocument((current) =>
      current
        ? {
            ...current,
            assets,
            portraitAssetId,
            updatedAt: new Date().toISOString()
          }
        : current
    );
  };

  const moveSectionOrder = (sectionKey: ResumeStudioSectionKey, direction: -1 | 1) => {
    if (!document) return;
    updateTemplate({ studioSectionOrder: moveStudioSection(document.template, sectionKey, direction) });
  };

  const toggleSectionHidden = (sectionKey: ResumeStudioSectionKey) => {
    if (!document) return;
    updateTemplate(toggleStudioSectionHidden(document.template, sectionKey));
  };

  const generateProposal = async () => {
    if (!taskId) return;
    setTailoring(true);
    setError("");
    try {
      const result = await api.resumes.generateTailorTask(taskId);
      setProposal(result.proposal);
      setActiveTab("editor");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 定制暂时不可用");
    } finally {
      setTailoring(false);
    }
  };

  const applyProposal = () => {
    if (!proposal) return;
    setDocument((current) =>
      current
        ? {
            ...current,
            profile: proposal.profile,
            updatedAt: new Date().toISOString()
          }
        : current
    );
    setProposal(undefined);
  };

  const handleExportPdf = () => {
    if (!document) return;
    const originalTitle = globalThis.document.title;
    const candidateName = document.profile.fullName?.trim() || "个人简历";
    const candidateRole = document.profile.targetRole?.trim() || document.title || "求职简历";
    const cleanTitle = `${candidateName}_${candidateRole}_简历`;
    globalThis.document.title = cleanTitle;
    try {
      window.print();
    } finally {
      window.setTimeout(() => {
        globalThis.document.title = originalTitle;
      }, 2000);
    }
  };

  const selectStudioTab = (tab: StudioTab) => {
    if (activeTab === tab) return;
    startUiTransition(() => setActiveTab(tab), "resume-tab");
  };

  if (error && !document) {
    return (
      <main className="resume-studio-state">
        <FileText size={32} />
        <h1>无法打开简历工作台</h1>
        <p>{error}</p>
        <button className="primary-button" onClick={() => navigate(taskId ? "/app/applications" : "/app/resumes")}>
          {taskId ? "返回投递管理" : "返回简历中心"}
        </button>
      </main>
    );
  }

  if (!document) {
    return (
      <main className="resume-studio-state resume-studio-state--loading" role="status">
        <span className="sr-only">正在准备简历工作台，正在同步母版简历...</span>
        <div className="studio-skeleton" aria-hidden="true">
          <div className="studio-skeleton__topbar">
            <span className="skel studio-skeleton__back" />
            <span className="skel studio-skeleton__title" />
            <span className="skel studio-skeleton__action" />
          </div>
          <div className="studio-skeleton__workspace">
            <div className="studio-skeleton__panel">
              <span className="skel studio-skeleton__tab" />
              <span className="skel studio-skeleton__tab" />
              <span className="skel studio-skeleton__tab studio-skeleton__tab--short" />
            </div>
            <div className="studio-skeleton__preview">
              <span className="skel studio-skeleton__preview-title" />
              <span className="skel studio-skeleton__preview-line" />
              <span className="skel studio-skeleton__preview-line" />
              <span className="skel studio-skeleton__preview-line studio-skeleton__preview-line--short" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  const profile = document.profile;
  const editingExperienceKind = activeStep === "internship" || activeStep === "work" ? activeStep : null;
  const editingExperiences = editingExperienceKind
    ? profile.experiences.filter(item => resolveProfileExperienceKind(item) === editingExperienceKind)
    : [];
  const activeExpId = expandedExpId === "none"
    ? null
    : (editingExperiences.some(item => item.id === expandedExpId) ? expandedExpId : editingExperiences[0]?.id ?? null);
  const activeEduId = expandedEduId === "none" ? null : (expandedEduId ?? profile.education[0]?.id ?? null);
  const activeProjId = expandedProjId === "none" ? null : (expandedProjId ?? profile.projects[0]?.id ?? null);
  const activeCampusId = expandedCampusId === "none" ? null : (expandedCampusId ?? profile.campusExperiences[0]?.id ?? null);
  const activeAwardId = expandedAwardId === "none" ? null : (expandedAwardId ?? profile.awards[0]?.id ?? null);
  const sectionOrder = normalizeStudioSectionOrder(document.template);
  const pageLimit = document.template.pageLimit || 1;
  const pageLimitHeightMm = pageLimit * 297;
  const isOverflowing = paperHeightMm > pageLimitHeightMm + 6;
  const estimatedPages = (paperHeightMm / 297).toFixed(1);
  const fillPercent = Math.min(200, Math.round((paperHeightMm / pageLimitHeightMm) * 100));
  const allStepKeys: ResumeStepKey[] = [
    "personal",
    ...sectionOrder
  ];
  const currentStepIdx = allStepKeys.indexOf(activeStep);
  const prevStepKey = currentStepIdx > 0 ? allStepKeys[currentStepIdx - 1] : null;
  const nextStepKey = currentStepIdx < allStepKeys.length - 1 ? allStepKeys[currentStepIdx + 1] : null;

  return (
    <main className="resume-studio-shell">
      <header className="resume-studio-topbar">
        <div className="resume-topbar-left">
          <button
            className="resume-back"
            aria-label={taskId ? "返回投递管理" : "返回简历中心"}
            onClick={() => navigate(taskId ? "/app/applications" : "/app/resumes")}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            <span>{taskId ? "投递管理" : "简历中心"}</span>
          </button>
          <div className="resume-studio-title">
            <span className="resume-title-badge">{taskId ? "岗位定制" : "通用母版"}</span>
            <strong title={taskTitle}>{taskTitle}</strong>
          </div>
        </div>

        <div className="resume-topbar-actions">
          {taskId ? (
            <button className="primary-button resume-ai-button" onClick={() => void generateProposal()} disabled={tailoring}>
              {tailoring ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <Route size={15} aria-hidden="true" />}
              <span>{tailoring ? "正在定制..." : "AI 岗位定制"}</span>
            </button>
          ) : (
            <button className="primary-button resume-ai-audit-button" onClick={() => setAiAuditOpen(true)}>
              <Sparkles size={15} aria-hidden="true" />
              <span>AI 简历诊断</span>
            </button>
          )}

          <span className={`resume-save-state is-${saveState}`} role="status" aria-live="polite">
            {saveState === "saving" ? (
              <LoaderCircle className="spin" size={14} aria-hidden="true" />
            ) : saveState === "saved" ? (
              <Check size={14} aria-hidden="true" />
            ) : saveState === "error" ? (
              <AlertTriangle size={14} aria-hidden="true" />
            ) : (
              <Save size={14} aria-hidden="true" />
            )}
            <span>
              {saveState === "saving"
                ? "正在保存..."
                : saveState === "saved"
                ? "已自动保存"
                : saveState === "error"
                ? "保存失败"
                : "草稿"}
            </span>
          </span>

          {saveState === "error" && (
            <button type="button" className="resume-retry-save-btn" onClick={() => void triggerImmediateSave()}>
              重试
            </button>
          )}

          <button className="secondary-button resume-export-button" onClick={handleExportPdf} title="快捷打印或另存为 PDF">
            <Download size={15} aria-hidden="true" />
            <span>导出 PDF</span>
          </button>
        </div>
      </header>

      <nav className="resume-mobile-tabs" aria-label="简历工作区" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "editor"}
          onClick={() => selectStudioTab("editor")}
        >
          <FileText size={16} aria-hidden="true" />
          编辑内容
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "preview"}
          onClick={() => selectStudioTab("preview")}
        >
          <Eye size={16} aria-hidden="true" />
          A4 实时预览
        </button>
      </nav>

      <div className="resume-studio-workspace">
        <nav className="resume-step-rail" aria-label="简历大纲与模块管理">
          <div className="resume-rail-header">
            <span>模块结构</span>
            <small>可排序与按需显隐</small>
          </div>

          <div className="resume-rail-list">
            <div
              className={`resume-rail-item ${activeStep === "personal" ? "is-active" : ""}`}
              onClick={() => setActiveStep("personal")}
              role="button"
              tabIndex={0}
            >
              <span className="resume-rail-badge">
                {isResumeStepComplete(document, "personal") ? <Check size={12} /> : 1}
              </span>
              <strong className="resume-rail-label">个人信息</strong>
            </div>

            {sectionOrder.map((secKey, index) => {
              const meta = RESUME_STEPS.find((s) => s.sectionKey === secKey);
              if (!meta) return null;
              const isHidden = isStudioSectionHidden(document.template, secKey);
              const isComplete = isResumeStepComplete(document, meta.key);

              return (
                <div
                  key={secKey}
                  className={`resume-rail-item ${activeStep === meta.key ? "is-active" : ""} ${isHidden ? "is-hidden" : ""}`}
                >
                  <button
                    type="button"
                    className="resume-rail-item-main"
                    onClick={() => setActiveStep(meta.key)}
                    title={isHidden ? `${meta.label}（已在简历中隐藏）` : meta.label}
                  >
                    <span className="resume-rail-badge">
                      {isComplete ? <Check size={12} /> : index + 2}
                    </span>
                    <strong className="resume-rail-label">{meta.label}</strong>
                  </button>

                  <div className="resume-rail-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="resume-rail-btn"
                      disabled={index === 0}
                      onClick={() => moveSectionOrder(secKey, -1)}
                      title="上移此模块"
                      aria-label={`上移${meta.label}`}
                    >
                      <ArrowUp size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="resume-rail-btn"
                      disabled={index === sectionOrder.length - 1}
                      onClick={() => moveSectionOrder(secKey, 1)}
                      title="下移此模块"
                      aria-label={`下移${meta.label}`}
                    >
                      <ArrowDown size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`resume-rail-btn ${isHidden ? "is-hidden-btn" : ""}`}
                      onClick={() => toggleSectionHidden(secKey)}
                      title={isHidden ? "取消隐藏，显示在简历中" : "从简历中隐藏此模块"}
                      aria-label={isHidden ? `显示${meta.label}` : `隐藏${meta.label}`}
                    >
                      {isHidden ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <aside
          id="resume-panel-editor"
          role="tabpanel"
          className={`resume-editor-pane ${activeTab === "editor" ? "is-mobile-active" : ""}`}
          aria-label="简历内容编辑"
        >
          <div className="resume-editor-scroll">
            {error && (
              <div className="resume-studio-alert" role="alert">
                <strong>暂时无法完成操作</strong>
                <span>{error}</span>
                <button type="button" onClick={() => setError("")}>
                  关闭
                </button>
              </div>
            )}

            {proposal && (
              <section className="resume-ai-review" aria-labelledby="resume-ai-review-title">
                <header>
                  <span>
                    <Route size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <strong id="resume-ai-review-title">AI 建议修改 {proposal.changes.length} 处</strong>
                    <small>{proposal.provider} · 针对目标岗位定制</small>
                  </div>
                </header>
                {proposal.changes.length > 0 ? (
                  <ul>
                    {proposal.changes.map((change) => (
                      <li key={change.id}>
                        <strong>{change.label}</strong>
                        <span>{change.reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>当前内容已经较贴合这个岗位。</p>
                )}
                <footer>
                  <button type="button" className="secondary-button" onClick={() => setProposal(undefined)}>
                    暂不采用
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={applyProposal}
                    disabled={!proposal.changes.length}
                  >
                    <Check size={15} />
                    应用全部修改
                  </button>
                </footer>
              </section>
            )}

            {activeStep === "personal" && (
              <EditorSection icon={<UserRound size={18} />} title="个人信息" description="简历抬头与联系方式">
                <div className="resume-personal-top">
                  <div className="resume-fields-grid resume-document-name">
                    <TextField
                      wide
                      label="简历名称"
                      value={document.title}
                      onChange={(value) =>
                        setDocument((current) =>
                          current
                            ? {
                                ...current,
                                title: value || "未命名简历",
                                updatedAt: new Date().toISOString()
                              }
                            : current
                        )
                      }
                      placeholder="例如：产品经理通用简历"
                    />
                  </div>
                  <PortraitAssetPicker
                    assets={document.assets}
                    selectedId={document.portraitAssetId}
                    onChange={updateAssets}
                    onError={setError}
                  />
                </div>
                <div className="resume-fields-grid">
                  <TextField label="姓名" value={profile.fullName} onChange={(value) => updateProfile("fullName", value)} />
                  <TextField
                    label="目标岗位"
                    value={profile.targetRole}
                    onChange={(value) => updateProfile("targetRole", value)}
                    placeholder="例如：AI 产品经理"
                  />
                  <TextField label="手机号" value={profile.phone} onChange={(value) => updateProfile("phone", value)} />
                  <TextField label="邮箱" value={profile.email} onChange={(value) => updateProfile("email", value)} />
                  <TextField
                    label="意向城市"
                    value={profile.targetCities || profile.currentCity}
                    onChange={(value) => updateProfile("targetCities", value)}
                    placeholder="例如：北京 / 上海 / 深圳"
                  />
                  <TextField
                    label="到岗时间"
                    value={profile.earliestStartDate}
                    onChange={(value) => updateProfile("earliestStartDate", value)}
                    placeholder="例如：随时到岗 / 2026.07"
                  />
                  <TextField
                    wide
                    label="作品集链接（可选）"
                    value={profile.portfolioUrl}
                    onChange={(value) => updateProfile("portfolioUrl", value)}
                    placeholder="https://..."
                  />
                  <TextField
                    wide
                    label="GitHub 或个人主页（可选）"
                    value={profile.githubUrl}
                    onChange={(value) => updateProfile("githubUrl", value)}
                    placeholder="https://github.com/..."
                  />
                </div>
              </EditorSection>
            )}

            {activeStep === "education" && (
              <EditorSection
                icon={<GraduationCap size={18} />}
                title="教育背景"
                description={`${profile.education.length} 段经历`}
                action={
                  <AddButton
                    label="添加学校"
                    onClick={() => {
                      const newId = makeId("edu");
                      updateProfile("education", [
                        ...profile.education,
                        {
                          id: newId,
                          school: "",
                          major: "",
                          degree: "",
                          startDate: "",
                          endDate: "",
                          gpa: ""
                        }
                      ]);
                      setExpandedEduId(newId);
                    }}
                  />
                }
              >
                {profile.education.map((item, index) => (
                  <EducationEditor
                    key={item.id}
                    item={item}
                    index={index}
                    isExpanded={activeEduId === item.id}
                    onToggle={() => setExpandedEduId(activeEduId === item.id ? "none" : item.id)}
                    onChange={(next) =>
                      updateProfile(
                        "education",
                        profile.education.map((entry) => (entry.id === item.id ? next : entry))
                      )
                    }
                    onDelete={() =>
                      updateProfile(
                        "education",
                        profile.education.filter((entry) => entry.id !== item.id)
                      )
                    }
                  />
                ))}
                {!profile.education.length && (
                  <EmptyStep
                    label="还没有教育经历"
                    action="添加学校"
                    onClick={() => {
                      const newId = makeId("edu");
                      updateProfile("education", [
                        {
                          id: newId,
                          school: "",
                          major: "",
                          degree: "",
                          startDate: "",
                          endDate: "",
                          gpa: ""
                        }
                      ]);
                      setExpandedEduId(newId);
                    }}
                  />
                )}
              </EditorSection>
            )}

            {editingExperienceKind && (
              <EditorSection
                icon={<BriefcaseBusiness size={18} />}
                title={editingExperienceKind === "internship" ? "实习经历" : "工作经历"}
                description={`${editingExperiences.length} 段经历`}
                action={
                  <AddButton
                    label={editingExperienceKind === "internship" ? "添加实习" : "添加工作"}
                    onClick={() => {
                      const newId = makeId("exp");
                      updateProfile("experiences", [
                        ...profile.experiences,
                        {
                          id: newId,
                          organization: "",
                          title: "",
                          kind: editingExperienceKind,
                          startDate: "",
                          endDate: "",
                          description: ""
                        }
                      ]);
                      setExpandedExpId(newId);
                    }}
                  />
                }
              >
                {editingExperiences.map((item, index) => (
                  <ExperienceEditor
                    key={item.id}
                    item={item}
                    index={index}
                    count={editingExperiences.length}
                    onMove={(direction) => {
                      const entries = [...profile.experiences];
                      const destination = index + direction;
                      if (destination < 0 || destination >= editingExperiences.length) return;
                      const sourceIndex = entries.findIndex(entry => entry.id === item.id);
                      const destinationIndex = entries.findIndex(entry => entry.id === editingExperiences[destination]?.id);
                      if (sourceIndex < 0 || destinationIndex < 0) return;
                      [entries[sourceIndex], entries[destinationIndex]] = [entries[destinationIndex]!, entries[sourceIndex]!];
                      updateProfile("experiences", entries);
                    }}
                    isExpanded={activeExpId === item.id}
                    onToggle={() => setExpandedExpId(activeExpId === item.id ? "none" : item.id)}
                    onChange={(next) =>
                      updateProfile(
                        "experiences",
                        profile.experiences.map((entry) => (entry.id === item.id ? next : entry))
                      )
                    }
                    onDelete={() =>
                      updateProfile(
                        "experiences",
                        profile.experiences.filter((entry) => entry.id !== item.id)
                      )
                    }
                  />
                ))}
                {!editingExperiences.length && (
                  <EmptyStep
                    label={editingExperienceKind === "internship" ? "还没有实习经历" : "还没有工作经历"}
                    action={editingExperienceKind === "internship" ? "添加实习" : "添加工作"}
                    onClick={() => {
                      const newId = makeId("exp");
                      updateProfile("experiences", [
                        {
                          id: newId,
                          organization: "",
                          title: "",
                          kind: editingExperienceKind,
                          startDate: "",
                          endDate: "",
                          description: ""
                        }
                      ]);
                      setExpandedExpId(newId);
                    }}
                  />
                )}
              </EditorSection>
            )}

            {activeStep === "projects" && (
              <EditorSection
                icon={<FileText size={18} />}
                title="项目经历"
                description={`${profile.projects.length} 个项目`}
                action={
                  <AddButton
                    label="添加项目"
                    onClick={() => {
                      const newId = makeId("project");
                      updateProfile("projects", [
                        ...profile.projects,
                        {
                          id: newId,
                          name: "",
                          role: "",
                          startDate: "",
                          endDate: "",
                          description: ""
                        }
                      ]);
                      setExpandedProjId(newId);
                    }}
                  />
                }
              >
                {profile.projects.map((item, index) => (
                  <ProjectEditor
                    key={item.id}
                    item={item}
                    index={index}
                    isExpanded={activeProjId === item.id}
                    onToggle={() => setExpandedProjId(activeProjId === item.id ? "none" : item.id)}
                    onChange={(next) =>
                      updateProfile(
                        "projects",
                        profile.projects.map((entry) => (entry.id === item.id ? next : entry))
                      )
                    }
                    onDelete={() =>
                      updateProfile(
                        "projects",
                        profile.projects.filter((entry) => entry.id !== item.id)
                      )
                    }
                  />
                ))}
                {!profile.projects.length && (
                  <EmptyStep
                    label="还没有项目经历"
                    action="添加项目"
                    onClick={() => {
                      const newId = makeId("project");
                      updateProfile("projects", [
                        {
                          id: newId,
                          name: "",
                          role: "",
                          startDate: "",
                          endDate: "",
                          description: ""
                        }
                      ]);
                      setExpandedProjId(newId);
                    }}
                  />
                )}
              </EditorSection>
            )}

            {activeStep === "skills" && (
              <EditorSection icon={<Check size={18} />} title="专业技能" description="技能、工具与关键词">
                <TextField
                  wide
                  multiline
                  label="技能内容（支持换行或分号分隔各要点）"
                  value={profile.strengths}
                  onChange={(value) => updateProfile("strengths", value)}
                  placeholder="例如：产品规划；用户研究；数据分析；SQL；Python"
                />
                <TextField
                  wide
                  multiline
                  label="兴趣与补充特长"
                  value={profile.hobbies}
                  onChange={(value) => updateProfile("hobbies", value)}
                  placeholder="例如：英语六级；热爱开源产品；关注 AI Agent 落地实践"
                />
              </EditorSection>
            )}

            {activeStep === "summary" && (
              <EditorSection icon={<Target size={18} />} title="个人简介" description="用 2-4 句话总结你的核心优势">
                <TextField
                  wide
                  multiline
                  label="简介内容"
                  value={profile.selfIntroduction}
                  onChange={(value) => updateProfile("selfIntroduction", value)}
                  placeholder="用 2–4 句话概括与目标岗位最相关的能力，并尽量包含可验证的结果与方法。"
                />
              </EditorSection>
            )}

            {activeStep === "campus" && (
              <EditorSection
                icon={<UserRound size={18} />}
                title="在校经历"
                description={`${profile.campusExperiences.length} 段经历`}
                action={
                  <AddButton
                    label="添加校园经历"
                    onClick={() => {
                      const newId = makeId("campus");
                      updateProfile("campusExperiences", [
                        ...profile.campusExperiences,
                        {
                          id: newId,
                          type: "",
                          role: "",
                          startDate: "",
                          endDate: "",
                          description: ""
                        }
                      ]);
                      setExpandedCampusId(newId);
                    }}
                  />
                }
              >
                {profile.campusExperiences.map((item, index) => (
                  <CampusEditor
                    key={item.id}
                    item={item}
                    index={index}
                    isExpanded={activeCampusId === item.id}
                    onToggle={() => setExpandedCampusId(activeCampusId === item.id ? "none" : item.id)}
                    onChange={(next) =>
                      updateProfile(
                        "campusExperiences",
                        profile.campusExperiences.map((entry) => (entry.id === item.id ? next : entry))
                      )
                    }
                    onDelete={() =>
                      updateProfile(
                        "campusExperiences",
                        profile.campusExperiences.filter((entry) => entry.id !== item.id)
                      )
                    }
                  />
                ))}
                {!profile.campusExperiences.length && (
                  <EmptyStep
                    label="还没有校园活动或社团经历"
                    action="添加校园经历"
                    onClick={() => {
                      const newId = makeId("campus");
                      updateProfile("campusExperiences", [
                        {
                          id: newId,
                          type: "",
                          role: "",
                          startDate: "",
                          endDate: "",
                          description: ""
                        }
                      ]);
                      setExpandedCampusId(newId);
                    }}
                  />
                )}
              </EditorSection>
            )}

            {activeStep === "awards" && (
              <EditorSection
                icon={<Award size={18} />}
                title="荣誉奖项"
                description={`${profile.awards.length} 项荣誉`}
                action={
                  <AddButton
                    label="添加获奖"
                    onClick={() => {
                      const newId = makeId("award");
                      updateProfile("awards", [
                        ...profile.awards,
                        {
                          id: newId,
                          date: "",
                          name: "",
                          level: "",
                          description: ""
                        }
                      ]);
                      setExpandedAwardId(newId);
                    }}
                  />
                }
              >
                {profile.awards.map((item, index) => (
                  <AwardEditor
                    key={item.id}
                    item={item}
                    index={index}
                    isExpanded={activeAwardId === item.id}
                    onToggle={() => setExpandedAwardId(activeAwardId === item.id ? "none" : item.id)}
                    onChange={(next) =>
                      updateProfile(
                        "awards",
                        profile.awards.map((entry) => (entry.id === item.id ? next : entry))
                      )
                    }
                    onDelete={() =>
                      updateProfile(
                        "awards",
                        profile.awards.filter((entry) => entry.id !== item.id)
                      )
                    }
                  />
                ))}
                {!profile.awards.length && (
                  <EmptyStep
                    label="还没有添加获奖情况"
                    action="添加获奖"
                    onClick={() => {
                      const newId = makeId("award");
                      updateProfile("awards", [
                        {
                          id: newId,
                          date: "",
                          name: "",
                          level: "",
                          description: ""
                        }
                      ]);
                      setExpandedAwardId(newId);
                    }}
                  />
                )}
              </EditorSection>
            )}

          </div>
          <footer className="resume-editor-footer">
            <button
              type="button"
              className="secondary-button"
              disabled={!prevStepKey}
              onClick={() => prevStepKey && setActiveStep(prevStepKey)}
            >
              上一步
            </button>
            <span>
              第 {currentStepIdx >= 0 ? currentStepIdx + 1 : 1} / {allStepKeys.length} 步
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={!nextStepKey}
              onClick={() => nextStepKey && setActiveStep(nextStepKey)}
            >
              下一步
            </button>
          </footer>
        </aside>

        <section
          id="resume-panel-preview"
          role="tabpanel"
          className={`resume-preview-pane ${activeTab === "preview" ? "is-mobile-active" : ""}`}
          aria-label="A4 简历实时预览"
        >
          {/* Canvas controls: floating bar at top of preview */}
          <div className="resume-canvas-controls">
            <div className="resume-canvas-tools-group">
              <div className="resume-canvas-select-wrap">
                <LayoutTemplate size={14} />
                <select
                  aria-label="切换简历模板"
                  value={document.template.templateId}
                  onChange={(e) => updateTemplate({ templateId: e.target.value as any })}
                >
                  {RESUME_TEMPLATES.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="resume-canvas-select-wrap">
                <span>目标</span>
                <select
                  aria-label="单双页目标"
                  value={document.template.pageLimit || 1}
                  onChange={(e) => updateTemplate({ pageLimit: Number(e.target.value) as 1 | 2 })}
                >
                  <option value={1}>单页 A4</option>
                  <option value={2}>双页 A4</option>
                </select>
              </div>

              <div
                className={`resume-canvas-overflow-badge ${isOverflowing ? "is-overflow" : "is-fit"}`}
                title={`当前高度约为 ${paperHeightMm}mm（目标 ${pageLimitHeightMm}mm，饱满度 ${fillPercent}%）`}
              >
                {isOverflowing ? (
                  <>
                    <AlertTriangle size={13} />
                    <span>超出 {paperHeightMm - pageLimitHeightMm}mm (约 {estimatedPages} 页)</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>容量合身 ({fillPercent}%)</span>
                  </>
                )}
              </div>
            </div>

            <div className="resume-canvas-zoom-group">
              <button
                type="button"
                className="resume-zoom-btn"
                onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                title="缩小"
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                className="resume-zoom-val"
                onClick={() => setZoom(0.85)}
                title="重置为适中缩放 85%"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="resume-zoom-btn"
                onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                title="放大"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                className={`resume-zoom-btn resume-zoom-preset ${zoom === 1 ? "is-active" : ""}`}
                onClick={() => setZoom(1)}
                title="实际 100% 打印尺寸"
              >
                100%
              </button>
            </div>
          </div>

          <div
            className="resume-paper-stage"
            style={{ "--resume-preview-scale": zoom } as React.CSSProperties}
          >
            <div className="resume-paper-wrapper">
              <ResumePreview
                document={document}
                activeStep={activeStep}
                onSelectStep={(step) => {
                  setActiveStep(step);
                  setActiveTab("editor");
                }}
                paperRef={paperRef}
              />

              <div className="resume-page-break-line" style={{ top: "297mm" }}>
                <span className="resume-page-break-badge">第 1 页终止线 (297mm)</span>
              </div>
              <div className="resume-page-break-line" style={{ top: "594mm" }}>
                <span className="resume-page-break-badge">第 2 页终止线 (594mm)</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {aiAuditOpen && (
        <AiResumeAuditModal
          document={document}
          paperHeightMm={paperHeightMm}
          isOverflowing={isOverflowing}
          estimatedPages={estimatedPages}
          onClose={() => setAiAuditOpen(false)}
        />
      )}
    </main>
  );
}

function EmptyStep({ label, action, onClick }: { label: string; action: string; onClick: () => void }) {
  return (
    <div className="resume-step-empty">
      <p>{label}</p>
      <button type="button" onClick={onClick}>
        <Plus size={14} />
        {action}
      </button>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="resume-add-button" onClick={onClick}><Plus size={14} />{label}</button>;
}
function CollapsibleEntryCard({
  index,
  title,
  subtitle,
  dateRange,
  badge,
  badgeType = "default",
  isExpanded,
  onToggle,
  onDelete,
  children
}: {
  index?: number;
  title: string;
  subtitle?: string;
  dateRange?: string;
  badge?: string;
  badgeType?: "default" | "brand" | "subtle";
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`resume-entry-card ${isExpanded ? "is-expanded" : "is-collapsed"}`}>
      <div
        className="resume-entry-summary-bar"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={isExpanded}
      >
        <div className="resume-entry-summary-main">
          <div className="resume-entry-title-row">
            {typeof index === "number" && (
              <span className="resume-entry-index-num">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
            <strong className="resume-entry-summary-title">{title || "未命名"}</strong>
            {badge && <span className={`resume-entry-badge badge-${badgeType}`}>{badge}</span>}
            {isExpanded && <span className="resume-entry-editing-tag">编辑中</span>}
          </div>
          {(subtitle || dateRange) && (
            <div className="resume-entry-summary-sub">
              {subtitle && <span className="resume-entry-sub-text">{subtitle}</span>}
              {subtitle && dateRange && <span className="resume-entry-dot-sep">·</span>}
              {dateRange && <span className="resume-entry-date-text">{dateRange}</span>}
            </div>
          )}
        </div>

        <div className="resume-entry-summary-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="resume-entry-toggle-btn"
            onClick={onToggle}
            title={isExpanded ? "收起此项" : "展开编辑"}
            aria-label={isExpanded ? "收起" : "展开"}
          >
            {isExpanded ? (
              <>
                <ChevronUp size={14} />
                <span>收起</span>
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                <span>编辑</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="resume-entry-delete-btn"
            onClick={onDelete}
            title="删除此项"
            aria-label={`删除${title}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isExpanded && <div className="resume-entry-body">{children}</div>}
    </div>
  );
}

function EntryCard({
  title,
  onDelete,
  children
}: {
  title: string;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <CollapsibleEntryCard
      title={title}
      isExpanded={true}
      onToggle={() => {}}
      onDelete={onDelete}
    >
      {children}
    </CollapsibleEntryCard>
  );
}

function ContentBlocksEditor({
  blocks = [],
  onChange,
  allowProjects = true
}: {
  blocks?: ResumeContentBlock[];
  onChange: (blocks: ResumeContentBlock[]) => void;
  allowProjects?: boolean;
}) {
  const [editMode, setEditMode] = useState<"list" | "text">("list");
  const [rawText, setRawText] = useState("");
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchInput, setBatchInput] = useState("");
  const [lastDeleted, setLastDeleted] = useState<{ block: ResumeContentBlock; index: number } | null>(null);

  const textRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const pendingFocusId = useRef<{ id: string; target: "text" | "label" } | null>(null);

  const blocksToMarkdown = (items: ResumeContentBlock[]): string => {
    return items
      .map((b) => {
        if (b.kind === "project") {
          const sub = b.children ? blocksToMarkdown(b.children) : "";
          return `【项目】${b.title || ""}\n${sub}`;
        }
        if (b.kind === "paragraph") {
          return b.text || "";
        }
        const tag = b.label?.trim() ? `[${b.label.trim()}] ` : "";
        return `• ${tag}${b.text || ""}`;
      })
      .join("\n");
  };

  const markdownToBlocks = (sourceText: string): ResumeContentBlock[] => {
    const lines = sourceText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((rawLine) => {
      const trimmed = rawLine.trim();
      const projMatch = trimmed.match(/^【项目】\s*(.+)$/);
      if (projMatch && allowProjects) {
        return {
          id: makeId("content-project"),
          kind: "project",
          title: projMatch[1].trim(),
          children: []
        };
      }
      const hasBullet = /^[\s•·●○▪▫■□◆◇▶►➤➢✓✔☑☆★※→—–\d\.-]+/.test(trimmed);
      const cleanText = trimmed.replace(/^[\s•·●○▪▫■□◆◇▶►➤➢✓✔☑☆★※→—–\d\.-]+/, "").trim();
      const bracketTag = cleanText.match(/^\[([^\]]{1,12})\]\s*(.+)$/);
      const colonTag = cleanText.match(/^([^\n：:]{2,8})[：:]\s*(.+)$/);
      const tagMatch = bracketTag || colonTag;
      if (tagMatch && tagMatch[1] && tagMatch[2]) {
        return {
          id: makeId("content-bullet"),
          kind: "bullet",
          label: tagMatch[1].trim(),
          text: tagMatch[2].trim()
        };
      }
      return {
        id: makeId(hasBullet ? "content-bullet" : "content-paragraph"),
        kind: hasBullet ? "bullet" : "paragraph",
        text: cleanText || trimmed
      };
    });
  };

  useLayoutEffect(() => {
    for (const id in textRefs.current) {
      const el = textRefs.current[id];
      if (el) {
        el.style.height = "auto";
        el.style.height = `${Math.max(28, el.scrollHeight)}px`;
      }
    }
  }, [blocks, editMode]);

  useEffect(() => {
    if (pendingFocusId.current) {
      const { id, target } = pendingFocusId.current;
      if (target === "text") {
        const el = textRefs.current[id];
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }
      pendingFocusId.current = null;
    }
  });

  const update = (index: number, block: ResumeContentBlock) =>
    onChange(blocks.map((item, itemIndex) => (itemIndex === index ? block : item)));

  const remove = (index: number) => {
    const block = blocks[index];
    if (block) {
      setLastDeleted({ block, index });
    }
    onChange(blocks.filter((_, itemIndex) => itemIndex !== index));
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    const next = [...blocks];
    next.splice(lastDeleted.index, 0, lastDeleted.block);
    onChange(next);
    setLastDeleted(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const temp = next[index]!;
    next[index] = next[target]!;
    next[target] = temp;
    onChange(next);
  };

  const add = (kind: ResumeContentBlock["kind"]) => {
    const newId = makeId(`content-${kind}`);
    const next = [
      ...blocks,
      kind === "project"
        ? { id: newId, kind, title: "新项目", children: [] }
        : { id: newId, kind, text: "" }
    ];
    onChange(next);
    if (kind !== "project") {
      pendingFocusId.current = { id: newId, target: "text" };
    }
  };

  const addBulletAfter = (afterIndex: number) => {
    const newId = makeId("content-bullet");
    const next = [...blocks];
    next.splice(afterIndex + 1, 0, { id: newId, kind: "bullet", text: "" });
    onChange(next);
    pendingFocusId.current = { id: newId, target: "text" };
  };

  const removeBulletAndFocusPrev = (index: number) => {
    if (index > 0) {
      const prevId = blocks[index - 1]?.id;
      if (prevId) {
        pendingFocusId.current = { id: prevId, target: "text" };
      }
    }
    remove(index);
  };

  const handleBulletKeyDown = (
    e: ReactKeyboardEvent<HTMLTextAreaElement>,
    index: number,
    block: ResumeContentBlock
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addBulletAfter(index);
    } else if (e.key === "Backspace") {
      const input = e.currentTarget;
      if (input.selectionStart === 0 && input.selectionEnd === 0 && !block.text) {
        e.preventDefault();
        removeBulletAndFocusPrev(index);
      }
    } else if (e.key === "ArrowUp") {
      if (e.currentTarget.selectionStart === 0 && index > 0) {
        const prevId = blocks[index - 1]?.id;
        if (prevId && textRefs.current[prevId]) {
          e.preventDefault();
          textRefs.current[prevId]?.focus();
        }
      }
    } else if (e.key === "ArrowDown") {
      if (e.currentTarget.selectionStart === e.currentTarget.value.length && index < blocks.length - 1) {
        const nextId = blocks[index + 1]?.id;
        if (nextId && textRefs.current[nextId]) {
          e.preventDefault();
          textRefs.current[nextId]?.focus();
        }
      }
    }
  };

  const handleBatchImport = () => {
    if (!batchInput.trim()) return;
    const lines = batchInput
      .split(/\r?\n+/)
      .map((l) => l.replace(/^[•·▪●\-\d\.]\s*/, "").trim())
      .filter(Boolean);

    const newBlocks: ResumeContentBlock[] = lines.map((line) => {
      const match = line.match(/^([^\n：:]{2,8})[：:]\s*(.+)$/);
      if (match && match[1] && match[2]) {
        return {
          id: makeId("content-bullet"),
          kind: "bullet",
          label: match[1].trim(),
          text: match[2].trim()
        };
      }
      return {
        id: makeId("content-bullet"),
        kind: "bullet",
        text: line
      };
    });

    onChange([...blocks, ...newBlocks]);
    setBatchInput("");
    setBatchModalOpen(false);
  };

  const handleRawTextChange = (val: string) => {
    setRawText(val);
    onChange(markdownToBlocks(val));
  };

  return (
    <div className="resume-block-editor resume-field--wide">
      <div className="resume-block-editor-heading">
        <div className="resume-block-heading-info">
          <strong>成果要点与内容</strong>
          <small>STAR 原则：动作动词 + 背景方法 + 量化结果</small>
        </div>
        <div className="resume-block-toolbar">
          <div className="resume-mode-switch">
            <button
              type="button"
              className={`resume-mode-btn ${editMode === "list" ? "is-active" : ""}`}
              onClick={() => setEditMode("list")}
              title="结构化清单模式"
            >
              <List size={12} />
              <span>清单</span>
            </button>
            <button
              type="button"
              className={`resume-mode-btn ${editMode === "text" ? "is-active" : ""}`}
              onClick={() => {
                setRawText(blocksToMarkdown(blocks));
                setEditMode("text");
              }}
              title="纯文本速写模式"
            >
              <AlignLeft size={12} />
              <span>速写</span>
            </button>
          </div>
          <button
            type="button"
            className="resume-batch-btn"
            onClick={() => setBatchModalOpen(true)}
            title="一键将多行文字拆分为要点"
          >
            <ListPlus size={12} />
            <span>批量导入</span>
          </button>
        </div>
      </div>

      {lastDeleted && (
        <div className="resume-block-undo-bar">
          <span>已删除 1 个要点</span>
          <button type="button" onClick={undoDelete}>
            <RotateCcw size={12} />
            撤销恢复
          </button>
        </div>
      )}

      {batchModalOpen && (
        <div className="resume-batch-modal-backdrop" onClick={() => setBatchModalOpen(false)}>
          <div className="resume-batch-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>批量粘贴要点</strong>
              <small>每行将自动转换为一个 Bullet，支持自动识别“标签：内容”格式</small>
            </header>
            <textarea
              rows={6}
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              placeholder={`• 需求分析：访谈 18 位业务用户，梳理高频检索场景，输出需求文档\n• 方案落地：协同算法完成检索增强，上线后问题命中率提升 21%\n• 数据复盘：搭建核心指标看板，周度复盘时间从 2 小时缩短至 30 分钟`}
            />
            <footer>
              <button type="button" className="secondary-button" onClick={() => setBatchModalOpen(false)}>
                取消
              </button>
              <button type="button" className="primary-button" onClick={handleBatchImport} disabled={!batchInput.trim()}>
                导入为要点
              </button>
            </footer>
          </div>
        </div>
      )}

      {editMode === "text" ? (
        <div className="resume-quick-text-container">
          <div className="resume-quick-text-hint">
            <span>💡 速写模式：每行输入一条要点，支持“• [标签] 内容”或“• 标签：内容”自动结构化</span>
          </div>
          <textarea
            className="resume-quick-text-area"
            value={rawText}
            onChange={(e) => handleRawTextChange(e.target.value)}
            rows={Math.max(6, (rawText.match(/\n/g)?.length || 0) + 3)}
            placeholder={`• [需求分析] 访谈 18 位业务用户，梳理高频检索场景\n• [方案落地] 协同算法完成检索增强，上线后问题命中率提升 21%\n• [数据复盘] 搭建核心指标看板，周度复盘时间从 2 小时缩短至 30 分钟`}
          />
        </div>
      ) : (
        <>
          <div className="resume-block-list">
            {blocks.map((block, index) =>
              block.kind === "project" ? (
                <section className="resume-block-project" key={block.id}>
                  <header>
                    <span>项目组</span>
                    <div className="resume-block-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        title="上移此项目组"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={index === blocks.length - 1}
                        onClick={() => move(index, 1)}
                        title="下移此项目组"
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button type="button" aria-label="删除项目组" onClick={() => remove(index)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </header>
                  <input
                    aria-label="项目标题"
                    value={block.title || ""}
                    onChange={(event) => update(index, { ...block, title: event.target.value })}
                    placeholder="项目名称"
                  />
                  <ContentBlocksEditor
                    blocks={block.children}
                    allowProjects={false}
                    onChange={(children) => update(index, { ...block, children })}
                  />
                </section>
              ) : (
                <div className={`resume-bullet-row is-${block.kind}`} key={block.id}>
                  <div className="resume-bullet-lead">
                    {block.kind === "bullet" ? (
                      <span className="resume-bullet-dot" title="成果要点">•</span>
                    ) : (
                      <span className="resume-bullet-para-mark" title="背景段落">¶</span>
                    )}
                  </div>

                  <div className="resume-bullet-body">
                    {block.kind === "bullet" && (
                      <div className="resume-bullet-tag-wrapper">
                        <input
                          className="resume-bullet-tag-input"
                          value={block.label || ""}
                          onChange={(e) => update(index, { ...block, label: e.target.value })}
                          placeholder="+ 标签"
                          title="可选标签，如：需求分析、用户增长"
                        />
                      </div>
                    )}
                    <textarea
                      ref={(el) => {
                        textRefs.current[block.id] = el;
                      }}
                      className="resume-bullet-text-input"
                      rows={1}
                      value={block.text || ""}
                      onChange={(e) => {
                        update(index, { ...block, text: e.target.value });
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.max(28, e.target.scrollHeight)}px`;
                      }}
                      onKeyDown={(e) => handleBulletKeyDown(e, index, block)}
                      placeholder={
                        block.kind === "bullet"
                          ? "写清动作、方法、产物和量化成果（回车新增要点）"
                          : "一段不带圆点的背景说明（回车换行）"
                      }
                    />
                  </div>

                  <div className="resume-bullet-row-actions">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      title="上移要点"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={index === blocks.length - 1}
                      onClick={() => move(index, 1)}
                      title="下移要点"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      title="删除要点"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            )}
            {!blocks.length && (
              <p className="resume-block-empty">尚未添加具体描述，建议添加 2-4 条成果要点。</p>
            )}
          </div>

          <div className="resume-block-add-bar">
            <button type="button" className="resume-bullet-add-btn" onClick={() => add("bullet")}>
              <Plus size={13} />
              <span>成果要点 (Bullet)</span>
            </button>
            <button type="button" className="resume-bullet-add-btn is-ghost" onClick={() => add("paragraph")}>
              <Plus size={13} />
              <span>背景段落</span>
            </button>
            {allowProjects && (
              <button type="button" className="resume-bullet-add-btn is-ghost" onClick={() => add("project")}>
                <Plus size={13} />
                <span>项目子组</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function updateEntryBlocks<T extends { description: string; contentBlocks?: ResumeContentBlock[] }>(
  entry: T,
  contentBlocks: ResumeContentBlock[]
): T {
  return { ...entry, contentBlocks, description: serializeResumeContentBlocks(contentBlocks) };
}

function EducationEditor({
  item,
  index,
  isExpanded,
  onToggle,
  onChange,
  onDelete
}: {
  item: ProfileEducation;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (item: ProfileEducation) => void;
  onDelete: () => void;
}) {
  const field = (key: keyof ProfileEducation) => (value: string) => onChange({ ...item, [key]: value });
  const subtitle = [item.college, item.major, item.degree].filter(Boolean).join(" · ");
  const dateRange = [item.startDate, item.endDate].filter(Boolean).join(" - ");
  const badge = item.gpa ? `GPA ${item.gpa}` : item.degree || undefined;

  return (
    <CollapsibleEntryCard
      index={index}
      title={item.school || `教育经历 ${index + 1}`}
      subtitle={subtitle}
      dateRange={dateRange}
      badge={badge}
      badgeType="subtle"
      isExpanded={isExpanded}
      onToggle={onToggle}
      onDelete={onDelete}
    >
      <div className="resume-doc-card-body">
        <div className="resume-doc-row resume-doc-row--header">
          <input
            className="resume-doc-title-input"
            value={item.school}
            onChange={(e) => field("school")(e.target.value)}
            placeholder="学校名称（例如：北京大学）"
            aria-label="学校名称"
          />
          <div className="resume-doc-type-pill">
            <input
              className="resume-doc-degree-input"
              value={item.degree}
              onChange={(e) => field("degree")(e.target.value)}
              placeholder="学历（如：硕士 / 本科）"
              aria-label="学历"
            />
          </div>
        </div>

        <div className="resume-doc-meta-bar">
          <div className="resume-doc-meta-item">
            <GraduationCap size={13} className="resume-doc-meta-icon" />
            <input
              className="resume-doc-inline-input"
              value={item.major}
              onChange={(e) => field("major")(e.target.value)}
              placeholder="专业（例如：软件工程）"
              aria-label="专业"
            />
          </div>
          <span className="resume-doc-sep">·</span>
          <div className="resume-doc-meta-item">
            <input
              className="resume-doc-inline-input"
              value={item.college}
              onChange={(e) => field("college")(e.target.value)}
              placeholder="学院（例如：信息科学技术学院）"
              aria-label="学院"
            />
          </div>
          <span className="resume-doc-sep">|</span>
          <div className="resume-doc-meta-item resume-doc-meta-dates">
            <input
              className="resume-doc-date-input"
              value={item.startDate}
              onChange={(e) => field("startDate")(e.target.value)}
              placeholder="入学 (2022.09)"
              aria-label="入学时间"
            />
            <span className="resume-doc-dash">-</span>
            <input
              className="resume-doc-date-input"
              value={item.endDate}
              onChange={(e) => field("endDate")(e.target.value)}
              placeholder="毕业 (2026.06)"
              aria-label="毕业时间"
            />
          </div>
          <span className="resume-doc-sep">|</span>
          <div className="resume-doc-meta-item">
            <span className="resume-doc-meta-label">GPA</span>
            <input
              className="resume-doc-inline-input resume-doc-inline-input--short"
              value={item.gpa}
              onChange={(e) => field("gpa")(e.target.value)}
              placeholder="3.8/4.0"
              aria-label="GPA"
            />
          </div>
        </div>

        <div className="resume-doc-sub-row">
          <span className="resume-doc-meta-label">排名 / 核心课程：</span>
          <input
            className="resume-doc-inline-input"
            value={item.rank}
            onChange={(e) => field("rank")(e.target.value)}
            placeholder="例如：专业前 5%；算法设计、分布式系统、机器学习"
            aria-label="排名或核心课程"
          />
        </div>
      </div>
    </CollapsibleEntryCard>
  );
}

function ProjectEditor({
  item,
  index,
  isExpanded,
  onToggle,
  onChange,
  onDelete
}: {
  item: ProfileProject;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (item: ProfileProject) => void;
  onDelete: () => void;
}) {
  const field = (key: keyof ProfileProject) => (value: string) => onChange({ ...item, [key]: value });
  const subtitle = item.role;
  const dateRange = [item.startDate, item.endDate].filter(Boolean).join(" - ");
  const bulletCount = item.contentBlocks?.length || 0;
  const badge = bulletCount > 0 ? `${bulletCount}条要点` : undefined;

  return (
    <CollapsibleEntryCard
      index={index}
      title={item.name || `项目 ${index + 1}`}
      subtitle={subtitle}
      dateRange={dateRange}
      badge={badge}
      badgeType="subtle"
      isExpanded={isExpanded}
      onToggle={onToggle}
      onDelete={onDelete}
    >
      <div className="resume-doc-card-body">
        <div className="resume-doc-row resume-doc-row--header">
          <input
            className="resume-doc-title-input"
            value={item.name}
            onChange={(e) => field("name")(e.target.value)}
            placeholder="项目名称（例如：AI 知识库问答助手）"
            aria-label="项目名称"
          />
          <div className="resume-doc-link-pill">
            <input
              className="resume-doc-link-input"
              value={item.link || ""}
              onChange={(e) => field("link")(e.target.value)}
              placeholder="🔗 项目链接（可选）"
              aria-label="项目链接"
            />
          </div>
        </div>

        <div className="resume-doc-meta-bar">
          <div className="resume-doc-meta-item">
            <span className="resume-doc-meta-label">担任角色：</span>
            <input
              className="resume-doc-inline-input"
              value={item.role}
              onChange={(e) => field("role")(e.target.value)}
              placeholder="例如：产品负责人 / 核心开发"
              aria-label="担任角色"
            />
          </div>
          <span className="resume-doc-sep">|</span>
          <div className="resume-doc-meta-item resume-doc-meta-dates">
            <input
              className="resume-doc-date-input"
              value={item.startDate}
              onChange={(e) => field("startDate")(e.target.value)}
              placeholder="开始 (2024.10)"
              aria-label="开始时间"
            />
            <span className="resume-doc-dash">-</span>
            <input
              className="resume-doc-date-input"
              value={item.endDate}
              onChange={(e) => field("endDate")(e.target.value)}
              placeholder="结束 (2025.02)"
              aria-label="结束时间"
            />
          </div>
        </div>

        <ContentBlocksEditor
          blocks={item.contentBlocks}
          allowProjects={false}
          onChange={(blocks) => onChange(updateEntryBlocks(item, blocks))}
        />
      </div>
    </CollapsibleEntryCard>
  );
}

function CampusEditor({
  item,
  index,
  isExpanded,
  onToggle,
  onChange,
  onDelete
}: {
  item: ProfileCampusExperience;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (item: ProfileCampusExperience) => void;
  onDelete: () => void;
}) {
  const field = (key: keyof ProfileCampusExperience) => (value: string) => onChange({ ...item, [key]: value });
  const subtitle = item.role;
  const dateRange = [item.startDate, item.endDate].filter(Boolean).join(" - ");
  const bulletCount = item.contentBlocks?.length || 0;
  const badge = bulletCount > 0 ? `${bulletCount}条要点` : undefined;

  return (
    <CollapsibleEntryCard
      index={index}
      title={item.type || `在校经历 ${index + 1}`}
      subtitle={subtitle}
      dateRange={dateRange}
      badge={badge}
      badgeType="subtle"
      isExpanded={isExpanded}
      onToggle={onToggle}
      onDelete={onDelete}
    >
      <div className="resume-doc-card-body">
        <div className="resume-doc-row resume-doc-row--header">
          <input
            className="resume-doc-title-input"
            value={item.type}
            onChange={(e) => field("type")(e.target.value)}
            placeholder="组织 / 活动名称（例如：学生会 / 青年志愿者协会）"
            aria-label="组织或活动名称"
          />
        </div>

        <div className="resume-doc-meta-bar">
          <div className="resume-doc-meta-item">
            <UserRound size={13} className="resume-doc-meta-icon" />
            <input
              className="resume-doc-inline-input"
              value={item.role}
              onChange={(e) => field("role")(e.target.value)}
              placeholder="担任职务（例如：部长 / 副主席）"
              aria-label="担任职务"
            />
          </div>
          <span className="resume-doc-sep">|</span>
          <div className="resume-doc-meta-item resume-doc-meta-dates">
            <input
              className="resume-doc-date-input"
              value={item.startDate}
              onChange={(e) => field("startDate")(e.target.value)}
              placeholder="开始 (2022.09)"
              aria-label="开始时间"
            />
            <span className="resume-doc-dash">-</span>
            <input
              className="resume-doc-date-input"
              value={item.endDate}
              onChange={(e) => field("endDate")(e.target.value)}
              placeholder="结束 (2023.06)"
              aria-label="结束时间"
            />
          </div>
        </div>

        <ContentBlocksEditor
          blocks={item.contentBlocks}
          allowProjects={false}
          onChange={(blocks) => onChange(updateEntryBlocks(item, blocks))}
        />
      </div>
    </CollapsibleEntryCard>
  );
}

function AwardEditor({
  item,
  index,
  isExpanded,
  onToggle,
  onChange,
  onDelete
}: {
  item: ProfileAward;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (item: ProfileAward) => void;
  onDelete: () => void;
}) {
  const field = (key: keyof ProfileAward) => (value: string) => onChange({ ...item, [key]: value });

  return (
    <CollapsibleEntryCard
      index={index}
      title={item.name || `获奖 ${index + 1}`}
      subtitle={item.level}
      dateRange={item.date}
      badge={item.description || undefined}
      badgeType="subtle"
      isExpanded={isExpanded}
      onToggle={onToggle}
      onDelete={onDelete}
    >
      <div className="resume-doc-card-body">
        <div className="resume-doc-row resume-doc-row--header">
          <input
            className="resume-doc-title-input"
            value={item.name}
            onChange={(e) => field("name")(e.target.value)}
            placeholder="奖项名称（例如：国家奖学金 / 全国大学生数学竞赛）"
            aria-label="奖项名称"
          />
          <div className="resume-doc-type-pill">
            <input
              className="resume-doc-degree-input"
              value={item.level}
              onChange={(e) => field("level")(e.target.value)}
              placeholder="级别（如：国家级 / 省级）"
              aria-label="获奖级别"
            />
          </div>
        </div>

        <div className="resume-doc-meta-bar">
          <div className="resume-doc-meta-item">
            <span className="resume-doc-meta-label">获奖时间：</span>
            <input
              className="resume-doc-date-input"
              value={item.date}
              onChange={(e) => field("date")(e.target.value)}
              placeholder="2024.11"
              aria-label="获奖时间"
            />
          </div>
          <span className="resume-doc-sep">|</span>
          <div className="resume-doc-meta-item">
            <span className="resume-doc-meta-label">补充说明：</span>
            <input
              className="resume-doc-inline-input"
              value={item.description}
              onChange={(e) => field("description")(e.target.value)}
              placeholder="例如：排名前 1% / 独立参赛"
              aria-label="补充说明"
            />
          </div>
        </div>
      </div>
    </CollapsibleEntryCard>
  );
}

function AiResumeAuditModal({
  document,
  paperHeightMm,
  isOverflowing,
  estimatedPages,
  onClose
}: {
  document: ResumeDocument;
  paperHeightMm: number;
  isOverflowing: boolean;
  estimatedPages: string;
  onClose: () => void;
}) {
  const { profile } = document;

  const quantCount = useMemo(() => {
    let count = 0;
    const regex = /\d+(?:\.\d+)?%?|\d+倍|\d+人|\d+万/;
    for (const exp of profile.experiences) {
      for (const block of exp.contentBlocks || []) {
        if (block.text && regex.test(block.text)) count++;
      }
    }
    for (const proj of profile.projects) {
      for (const block of proj.contentBlocks || []) {
        if (block.text && regex.test(block.text)) count++;
      }
    }
    return count;
  }, [profile]);

  const auditItems = [
    {
      title: "单页容量检测",
      pass: !isOverflowing,
      desc: isOverflowing
        ? `当前内容约 ${estimatedPages} 页（${paperHeightMm}mm）。单页简历建议精简 1-2 条次要经历，或调整内容避免跨页被腰斩。`
        : `高度控制优异（${paperHeightMm}mm），适合 A4 单页标准打印。`
    },
    {
      title: "STAR 量化成果",
      pass: quantCount >= 3,
      desc:
        quantCount >= 3
          ? `检测到 ${quantCount} 处包含明确量化数据（如百分比、指标增量），表现力强。`
          : `当前仅检测到 ${quantCount} 处数字或指标，建议在实习和项目中增加“提升 xx%”、“支撑 xx 用户”等可验证成果。`
    },
    {
      title: "基本求职意向",
      pass: Boolean(profile.fullName && profile.targetRole && profile.phone && profile.email),
      desc:
        profile.fullName && profile.targetRole && profile.phone && profile.email
          ? "抬头信息完整（姓名、岗位、电话、邮箱、城市）。"
          : "基本信息仍有缺漏，建议补全电话、邮箱或目标岗位。"
    },
    {
      title: "专业技能完备度",
      pass: Boolean(profile.strengths && profile.strengths.length > 20),
      desc:
        profile.strengths && profile.strengths.length > 20
          ? "技能关键词充足，有助于匹配 ATS 简历筛选系统。"
          : "技能描述较少，建议补充 3-5 个具体工具或方法论（如 SQL、用户研究、产品原型等）。"
    }
  ];

  const score = Math.min(
    100,
    Math.max(
      60,
      (quantCount >= 3 ? 35 : 20) +
        (!isOverflowing ? 35 : 15) +
        (profile.phone ? 15 : 0) +
        (profile.strengths ? 15 : 0)
    )
  );

  return (
    <div className="resume-audit-modal-backdrop" onClick={onClose}>
      <div className="resume-audit-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="resume-audit-title">
            <Sparkles size={18} />
            <strong>AI 简历体检诊断</strong>
          </div>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="resume-audit-content">
          <div className="resume-audit-score">
            <div className="resume-audit-score-num">
              <strong>{score}</strong>
              <span>健康得分</span>
            </div>
            <p>基于校招与社招通用 ATS 筛选规则与 A4 单页版式最佳实践评分。</p>
          </div>

          <div className="resume-audit-list">
            {auditItems.map((item, idx) => (
              <div key={idx} className={`resume-audit-item ${item.pass ? "is-pass" : "is-warning"}`}>
                <div className="resume-audit-item-head">
                  {item.pass ? <Check size={15} /> : <AlertTriangle size={15} />}
                  <strong>{item.title}</strong>
                </div>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <footer>
          <button type="button" className="primary-button" onClick={onClose}>
            我知道了
          </button>
        </footer>
      </div>
    </div>
  );
}
