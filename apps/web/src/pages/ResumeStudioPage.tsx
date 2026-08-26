import {
  useEffect,
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
  ProfileExperience,
  ProfileProject,
  ResumeAsset,
  ResumeContentBlock,
  ResumeDocument,
  ResumeTailorProposal
} from "@offerflow/domain";
import {
  hydrateResumeProfileSemantics,
  RESUME_TEMPLATES,
  serializeResumeContentBlocks
} from "@offerflow/domain";
import {
  ArrowLeft,
  Award,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileText,
  GraduationCap,
  ImagePlus,
  LoaderCircle,
  Palette,
  Plus,
  Route,
  Save,
  Settings2,
  Target,
  Trash2,
  UserRound
} from "lucide-react";
import { api } from "../app/api";
import { createUuid } from "../app/id";
import { navigate, startUiTransition } from "../app/router";

type StudioTab = "preview" | "editor";
type SaveState = "idle" | "saving" | "saved" | "error";

const makeId = (prefix: string) => `${prefix}_${createUuid()}`;

function displayDate(value?: string): string {
  return value?.replace(/年|月/g, ".").replace(/\.$/, "") || "";
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
    <details className="resume-editor-section" open>
      <summary>
        <span className="resume-section-icon">{icon}</span>
        <span><strong>{title}</strong><small>{description}</small></span>
        <span className="resume-section-action" onClick={(event) => event.preventDefault()}>{action}</span>
        <ChevronDown className="resume-section-chevron" aria-hidden="true" size={17} />
      </summary>
      <div className="resume-section-body">{children}</div>
    </details>
  );
}

function ResumePreview({ document }: { document: ResumeDocument }) {
  const { profile, template } = document;
  const contacts = [profile.phone, profile.email, profile.currentCity, profile.portfolioUrl || profile.githubUrl].filter(Boolean);
  const accentStyle = { "--resume-accent": template.accentColor } as React.CSSProperties;
  const portrait = document.assets?.find((asset) => asset.id === document.portraitAssetId);

  return (
    <article className={`resume-paper resume-paper--${template.templateId}`} style={accentStyle} aria-label="简历实时预览">
      <header className="resume-paper-header">
        <div>
          <h1>{profile.fullName || "你的姓名"}</h1>
          <p>{profile.targetRole || "目标岗位"}</p>
          <ul>{contacts.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        {portrait ? (
          <img className="resume-portrait" src={portrait.dataUrl} alt={`${profile.fullName || "候选人"}的简历照片`} />
        ) : (
          <span className="resume-monogram" aria-hidden="true">{(profile.fullName || "OF").slice(-1)}</span>
        )}
      </header>

      {profile.selfIntroduction && (
        <PreviewSection title="个人总结"><p className="resume-summary">{profile.selfIntroduction}</p></PreviewSection>
      )}

      {profile.education.length > 0 && (
        <PreviewSection title="教育经历">
          {profile.education.map((item) => (
            <PreviewEntry key={item.id} title={`${item.school}${item.major ? ` · ${item.major}` : ""}`} meta={`${displayDate(item.startDate)} — ${displayDate(item.endDate)}`} subtitle={[item.degree, item.gpa && `GPA ${item.gpa}`].filter(Boolean).join(" · ")} />
          ))}
        </PreviewSection>
      )}

      {profile.experiences.length > 0 && (
        <PreviewSection title="工作经历">
          {profile.experiences.map((item) => (
            <PreviewEntry key={item.id} title={`${item.organization}${item.title ? ` · ${item.title}` : ""}`} meta={`${displayDate(item.startDate)} — ${item.isCurrent ? "至今" : displayDate(item.endDate)}`} blocks={item.contentBlocks} />
          ))}
        </PreviewSection>
      )}

      {profile.projects.length > 0 && (
        <PreviewSection title="项目经历">
          {profile.projects.map((item) => (
            <PreviewEntry key={item.id} title={`${item.name}${item.role ? ` · ${item.role}` : ""}`} meta={`${displayDate(item.startDate)} — ${displayDate(item.endDate)}`} blocks={item.contentBlocks} />
          ))}
        </PreviewSection>
      )}

      {profile.campusExperiences.length > 0 && (
        <PreviewSection title="在校经历">
          {profile.campusExperiences.map((item) => (
            <PreviewEntry key={item.id} title={`${item.type}${item.role ? ` · ${item.role}` : ""}`} meta={`${displayDate(item.startDate)} — ${displayDate(item.endDate)}`} blocks={item.contentBlocks} />
          ))}
        </PreviewSection>
      )}

      {profile.awards.length > 0 && (
        <PreviewSection title="获奖情况">
          {profile.awards.map((item) => (
            <PreviewEntry key={item.id} title={item.name} meta={displayDate(item.date)} subtitle={[item.level, item.description].filter(Boolean).join(" · ")} />
          ))}
        </PreviewSection>
      )}

      {(profile.strengths || profile.hobbies) && (
        <PreviewSection title="技能特长"><p className="resume-summary">{[profile.strengths, profile.hobbies].filter(Boolean).join(" · ")}</p></PreviewSection>
      )}
    </article>
  );
}

function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="resume-preview-section"><h2>{title}</h2><div>{children}</div></section>;
}

function ResumeBlocks({ blocks }: { blocks?: ResumeContentBlock[] }) {
  if (!blocks?.length) return null;
  const nodes: ReactNode[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index]!;
    if (block.kind === "bullet") {
      const bullets: ResumeContentBlock[] = [];
      while (blocks[index]?.kind === "bullet") bullets.push(blocks[index++]!);
      nodes.push(<ul key={`bullets-${bullets[0]?.id}`}>{bullets.map((item) => <li key={item.id}>{item.label && <strong>{item.label}：</strong>}{item.text}</li>)}</ul>);
      continue;
    }
    if (block.kind === "project") {
      nodes.push(<div className="resume-content-project" key={block.id}><h3>{block.title}</h3><ResumeBlocks blocks={block.children} /></div>);
    } else {
      nodes.push(<p className="resume-content-paragraph" key={block.id}>{block.label && <strong>{block.label}：</strong>}{block.text}</p>);
    }
    index += 1;
  }
  return <div className="resume-content-blocks">{nodes}</div>;
}

function PreviewEntry({ title, meta, subtitle, blocks }: { title: string; meta?: string; subtitle?: string; blocks?: ResumeContentBlock[] }) {
  return (
    <div className="resume-preview-entry">
      <div className="resume-entry-heading"><strong>{title}</strong>{meta && <span>{meta}</span>}</div>
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

export function ResumeStudioPage({ taskId }: { taskId: string }) {
  const [document, setDocument] = useState<ResumeDocument>();
  const [taskTitle, setTaskTitle] = useState("正在载入岗位…");
  const [versionId, setVersionId] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<StudioTab>("editor");
  const [proposal, setProposal] = useState<ResumeTailorProposal>();
  const [tailoring, setTailoring] = useState(false);
  const revisionRef = useRef(0);
  const savedDocumentRef = useRef("");
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    api.resumes.getTailorTask(taskId)
      .then(({ task, version }) => {
        if (!active) return;
        const hydratedDocument = {
          ...version.version.document,
          profile: hydrateResumeProfileSemantics(version.version.document.profile)
        };
        setTaskTitle(`${task.job.company} · ${task.job.position}`);
        setVersionId(version.version.id);
        revisionRef.current = version.revision;
        savedDocumentRef.current = JSON.stringify(version.version.document);
        setDocument(hydratedDocument);
        setSaveState("saved");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "无法载入这次简历定制任务");
      });
    return () => { active = false; };
  }, [taskId]);

  useEffect(() => {
    if (!document || !versionId) return;
    const serialized = JSON.stringify(document);
    if (serialized === savedDocumentRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const snapshot = structuredClone(document);
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        try {
          const result = await api.resumes.updateVersion(versionId, {
            document: snapshot,
            expectedRevision: revisionRef.current
          });
          revisionRef.current = result.item.revision;
          savedDocumentRef.current = JSON.stringify(snapshot);
          setSaveState(JSON.stringify(document) === JSON.stringify(snapshot) ? "saved" : "saving");
        } catch (cause) {
          setSaveState("error");
          setError(cause instanceof Error ? cause.message : "自动保存失败");
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [document, versionId]);

  const updateProfile = <K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) => {
    setDocument((current) => current ? {
      ...current,
      profile: { ...current.profile, [key]: value },
      updatedAt: new Date().toISOString()
    } : current);
  };

  const updateTemplate = (patch: Partial<ResumeDocument["template"]>) => {
    setDocument((current) => current ? {
      ...current,
      template: { ...current.template, ...patch },
      updatedAt: new Date().toISOString()
    } : current);
  };

  const updateAssets = (assets: ResumeAsset[], portraitAssetId?: string) => {
    setDocument((current) => current ? {
      ...current,
      assets,
      portraitAssetId,
      updatedAt: new Date().toISOString()
    } : current);
  };

  const generateProposal = async () => {
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
    setDocument((current) => current ? {
      ...current,
      profile: proposal.profile,
      updatedAt: new Date().toISOString()
    } : current);
    setProposal(undefined);
  };

  const selectStudioTab = (tab: StudioTab) => {
    if (activeTab === tab) return;
    startUiTransition(() => setActiveTab(tab), "resume-tab");
  };

  const handleStudioTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: StudioTab) => {
    const tabs: StudioTab[] = ["preview", "editor"];
    const currentIndex = tabs.indexOf(tab);
    let nextTab: StudioTab | undefined;

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextTab = tabs[(currentIndex + 1) % tabs.length];
    } else if (event.key === "Home") {
      nextTab = tabs[0];
    } else if (event.key === "End") {
      nextTab = tabs[tabs.length - 1];
    }

    if (!nextTab) return;
    event.preventDefault();
    selectStudioTab(nextTab);
    globalThis.document.getElementById(`resume-tab-${nextTab}`)?.focus();
  };

  if (error && !document) {
    return <main className="resume-studio-state"><FileText size={32} /><h1>无法打开简历工作台</h1><p>{error}</p><button className="primary-button" onClick={() => navigate("/app/applications")}>返回投递管理</button></main>;
  }
  if (!document) {
    return <main className="resume-studio-state" role="status"><LoaderCircle className="spin" size={28} /><h1>正在准备简历工作台</h1><p>正在同步岗位和母版简历。</p></main>;
  }

  const profile = document.profile;
  return (
    <main className="resume-studio-shell">
      <header className="resume-studio-topbar">
        <button className="resume-back" aria-label="返回投递管理" onClick={() => navigate("/app/applications")}><ArrowLeft size={17} aria-hidden="true" />投递管理</button>
        <div className="resume-studio-title"><span>简历工作室</span><strong>{taskTitle}</strong></div>
        <div className="resume-studio-controls">
          <button className="primary-button resume-ai-button" onClick={() => void generateProposal()} disabled={tailoring}>{tailoring ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Route size={16} aria-hidden="true" />}{tailoring ? "正在定制" : "AI 定制"}</button>
          <label className="resume-color-control" title="简历主题色"><Palette size={16} /><input aria-label="简历主题色" type="color" value={document.template.accentColor} onChange={(event) => updateTemplate({ accentColor: event.target.value })} /></label>
          <label className="resume-page-control"><span>页数</span><select value={document.template.pageLimit} onChange={(event) => updateTemplate({ pageLimit: Number(event.target.value) as 1 | 2 })}><option value="1">1 页</option><option value="2">2 页</option></select></label>
          <span className={`resume-save-state is-${saveState}`} role="status" aria-live="polite">{saveState === "saving" ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : saveState === "saved" ? <Check size={14} aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}{saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : saveState === "error" ? "保存失败" : "草稿"}</span>
          <details className="resume-document-settings">
            <summary aria-label="文档设置"><Settings2 size={17} aria-hidden="true" /><span>文档设置</span></summary>
            <div className="resume-settings-popover">
              <header><strong>文档设置</strong><small>调整主题、页数并查看保存状态</small></header>
              <label className="resume-settings-row">
                <span><Palette size={16} aria-hidden="true" />主题色</span>
                <input aria-label="简历主题色" type="color" value={document.template.accentColor} onChange={(event) => updateTemplate({ accentColor: event.target.value })} />
              </label>
              <label className="resume-settings-row">
                <span><FileText size={16} aria-hidden="true" />页数</span>
                <select aria-label="简历页数" value={document.template.pageLimit} onChange={(event) => updateTemplate({ pageLimit: Number(event.target.value) as 1 | 2 })}><option value="1">1 页</option><option value="2">2 页</option></select>
              </label>
              <div className={`resume-settings-save is-${saveState}`} role="status" aria-live="polite">
                <span>{saveState === "saving" ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : saveState === "saved" ? <Check size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}保存状态</span>
                <strong>{saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : saveState === "error" ? "保存失败" : "草稿"}</strong>
              </div>
            </div>
          </details>
          <button className="secondary-button resume-export-button" aria-label="导出 PDF" onClick={() => window.print()}><Download size={16} aria-hidden="true" />导出 PDF</button>
        </div>
      </header>

      <nav className="resume-mobile-tabs" aria-label="简历工作区" role="tablist">
        <button id="resume-tab-preview" role="tab" aria-selected={activeTab === "preview"} aria-controls="resume-panel-preview" tabIndex={activeTab === "preview" ? 0 : -1} onClick={() => selectStudioTab("preview")} onKeyDown={(event) => handleStudioTabKeyDown(event, "preview")}><Eye size={16} aria-hidden="true" />预览</button>
        <button id="resume-tab-editor" role="tab" aria-selected={activeTab === "editor"} aria-controls="resume-panel-editor" tabIndex={activeTab === "editor" ? 0 : -1} onClick={() => selectStudioTab("editor")} onKeyDown={(event) => handleStudioTabKeyDown(event, "editor")}><FileText size={16} aria-hidden="true" />编辑</button>
      </nav>

      <div className="resume-studio-workspace">
        <section id="resume-panel-preview" role="tabpanel" aria-labelledby="resume-tab-preview" className={`resume-preview-pane ${activeTab === "preview" ? "is-mobile-active" : ""}`}>
          <div className="resume-preview-toolbar"><span><Route size={15} aria-hidden="true" />岗位定制草稿</span><small>固定模板 · 实时排版</small></div>
          <div className="resume-paper-stage"><ResumePreview document={document} /></div>
        </section>

        <aside id="resume-panel-editor" role="tabpanel" aria-labelledby="resume-tab-editor" className={`resume-editor-pane ${activeTab === "editor" ? "is-mobile-active" : ""}`} aria-label="简历内容编辑">
          <div className="resume-editor-intro"><span>当前母版</span><strong>{document.title}</strong><p>修改字段会自动保存并同步到该岗位的独立版本，不影响原始母版。</p></div>

          <TemplatePicker value={document.template.templateId} onChange={(templateId) => updateTemplate({ templateId })} />

          {document.sourceEvidence && (
            <section className={`resume-parse-health ${document.sourceEvidence.parseCoverage !== undefined && document.sourceEvidence.parseCoverage < 0.85 ? "needs-review" : "is-ready"}`}>
              <div><span>结构化解析</span><strong>{document.sourceEvidence.parseCoverage === undefined ? "待评估" : `${Math.round(document.sourceEvidence.parseCoverage * 100)}% 覆盖`}</strong></div>
              <p>{document.sourceEvidence.warnings?.length ? `有 ${document.sourceEvidence.warnings.length} 项需要核对；AI 改写只会使用已有证据块，不会把视觉换行当成要点。` : "结构层级已建立；模板与 AI 共用同一份语义数据。"}</p>
            </section>
          )}

          {error && <div className="resume-studio-alert" role="alert"><strong>暂时无法完成操作</strong><span>{error}</span><button type="button" onClick={() => setError("")}>关闭</button></div>}

          {proposal && (
            <section className="resume-ai-review" aria-labelledby="resume-ai-review-title">
              <header><span><Route size={17} aria-hidden="true" /></span><div><strong id="resume-ai-review-title">AI 建议修改 {proposal.changes.length} 处</strong><small>{proposal.provider} · 尚未写入简历</small></div></header>
              {proposal.changes.length > 0 ? (
                <ul>{proposal.changes.map((change) => <li key={change.id}><strong>{change.label}</strong><span>{change.reason}</span></li>)}</ul>
              ) : <p>AI 没有发现需要调整的字段，当前母版已经较贴合这个岗位。</p>}
              <footer><button type="button" className="secondary-button" onClick={() => setProposal(undefined)}>暂不采用</button><button type="button" className="primary-button" onClick={applyProposal} disabled={!proposal.changes.length}><Check size={15} />应用全部修改</button></footer>
            </section>
          )}

          <EditorSection icon={<UserRound size={18} />} title="基本信息" description="姓名、联系方式与求职方向">
            <PortraitAssetPicker assets={document.assets} selectedId={document.portraitAssetId} onChange={updateAssets} onError={setError} />
            <div className="resume-fields-grid">
              <TextField label="姓名" value={profile.fullName} onChange={(value) => updateProfile("fullName", value)} />
              <TextField label="目标岗位" value={profile.targetRole} onChange={(value) => updateProfile("targetRole", value)} />
              <TextField label="手机号" value={profile.phone} onChange={(value) => updateProfile("phone", value)} />
              <TextField label="邮箱" value={profile.email} onChange={(value) => updateProfile("email", value)} />
              <TextField label="所在城市" value={profile.currentCity} onChange={(value) => updateProfile("currentCity", value)} />
              <TextField label="作品集 / GitHub" value={profile.portfolioUrl || profile.githubUrl} onChange={(value) => updateProfile("portfolioUrl", value)} />
            </div>
          </EditorSection>

          <EditorSection icon={<Target size={18} />} title="个人总结" description="针对岗位表达你的核心优势">
            <TextField wide multiline label="总结内容" value={profile.selfIntroduction} onChange={(value) => updateProfile("selfIntroduction", value)} placeholder="用 2–4 句话概括与目标岗位最相关的能力。" />
          </EditorSection>

          <EditorSection icon={<GraduationCap size={18} />} title="教育经历" description={`${profile.education.length} 段经历`} action={<AddButton label="添加教育" onClick={() => updateProfile("education", [...profile.education, { id: makeId("edu"), school: "", major: "", degree: "", startDate: "", endDate: "", gpa: "" }])} />}>
            {profile.education.map((item, index) => <EducationEditor key={item.id} item={item} index={index} onChange={(next) => updateProfile("education", profile.education.map((entry) => entry.id === item.id ? next : entry))} onDelete={() => updateProfile("education", profile.education.filter((entry) => entry.id !== item.id))} />)}
          </EditorSection>

          <EditorSection icon={<BriefcaseBusiness size={18} />} title="工作经历" description={`${profile.experiences.length} 段经历`} action={<AddButton label="添加工作" onClick={() => updateProfile("experiences", [...profile.experiences, { id: makeId("exp"), organization: "", title: "", startDate: "", endDate: "", description: "" }])} />}>
            {profile.experiences.map((item, index) => <ExperienceEditor key={item.id} item={item} index={index} onChange={(next) => updateProfile("experiences", profile.experiences.map((entry) => entry.id === item.id ? next : entry))} onDelete={() => updateProfile("experiences", profile.experiences.filter((entry) => entry.id !== item.id))} />)}
          </EditorSection>

          <EditorSection icon={<FileText size={18} />} title="项目经历" description={`${profile.projects.length} 个项目`} action={<AddButton label="添加项目" onClick={() => updateProfile("projects", [...profile.projects, { id: makeId("project"), name: "", role: "", startDate: "", endDate: "", description: "" }])} />}>
            {profile.projects.map((item, index) => <ProjectEditor key={item.id} item={item} index={index} onChange={(next) => updateProfile("projects", profile.projects.map((entry) => entry.id === item.id ? next : entry))} onDelete={() => updateProfile("projects", profile.projects.filter((entry) => entry.id !== item.id))} />)}
          </EditorSection>

          <EditorSection icon={<UserRound size={18} />} title="在校经历" description={`${profile.campusExperiences.length} 段经历`} action={<AddButton label="添加在校经历" onClick={() => updateProfile("campusExperiences", [...profile.campusExperiences, { id: makeId("campus"), type: "", role: "", startDate: "", endDate: "", description: "" }])} />}>
            {profile.campusExperiences.map((item, index) => <CampusEditor key={item.id} item={item} index={index} onChange={(next) => updateProfile("campusExperiences", profile.campusExperiences.map((entry) => entry.id === item.id ? next : entry))} onDelete={() => updateProfile("campusExperiences", profile.campusExperiences.filter((entry) => entry.id !== item.id))} />)}
          </EditorSection>

          <EditorSection icon={<Award size={18} />} title="获奖情况" description={`${profile.awards.length} 项荣誉`} action={<AddButton label="添加获奖" onClick={() => updateProfile("awards", [...profile.awards, { id: makeId("award"), date: "", name: "", level: "", description: "" }])} />}>
            {profile.awards.map((item, index) => <AwardEditor key={item.id} item={item} index={index} onChange={(next) => updateProfile("awards", profile.awards.map((entry) => entry.id === item.id ? next : entry))} onDelete={() => updateProfile("awards", profile.awards.filter((entry) => entry.id !== item.id))} />)}
          </EditorSection>

          <EditorSection icon={<Check size={18} />} title="技能特长" description="技能、工具与能力关键词">
            <TextField wide multiline label="技能内容" value={profile.strengths} onChange={(value) => updateProfile("strengths", value)} placeholder="例如：产品规划；用户研究；SQL；Python" />
          </EditorSection>
        </aside>
      </div>
    </main>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="resume-add-button" onClick={onClick}><Plus size={14} />{label}</button>;
}

function EntryCard({ title, onDelete, children }: { title: string; onDelete: () => void; children: ReactNode }) {
  return <div className="resume-entry-card"><header><strong>{title}</strong><button type="button" aria-label={`删除${title}`} onClick={onDelete}><Trash2 size={15} /></button></header><div className="resume-fields-grid">{children}</div></div>;
}

function ContentBlocksEditor({ blocks = [], onChange, allowProjects = true }: { blocks?: ResumeContentBlock[]; onChange: (blocks: ResumeContentBlock[]) => void; allowProjects?: boolean }) {
  const update = (index: number, block: ResumeContentBlock) => onChange(blocks.map((item, itemIndex) => itemIndex === index ? block : item));
  const remove = (index: number) => onChange(blocks.filter((_, itemIndex) => itemIndex !== index));
  const add = (kind: ResumeContentBlock["kind"]) => onChange([...blocks, kind === "project"
    ? { id: makeId("content-project"), kind, title: "新项目", children: [] }
    : { id: makeId(`content-${kind}`), kind, text: "" }]);

  return (
    <div className="resume-block-editor resume-field--wide">
      <div className="resume-block-editor-heading"><span><strong>内容层级</strong><small>项目标题和背景不加圆点，只有成果要点使用 bullet</small></span></div>
      <div className="resume-block-list">
        {blocks.map((block, index) => block.kind === "project" ? (
          <section className="resume-block-project" key={block.id}>
            <header><span>项目组</span><button type="button" aria-label="删除项目组" onClick={() => remove(index)}><Trash2 size={14} /></button></header>
            <input aria-label="项目标题" value={block.title || ""} onChange={(event) => update(index, { ...block, title: event.target.value })} placeholder="项目名称" />
            <ContentBlocksEditor blocks={block.children} allowProjects={false} onChange={(children) => update(index, { ...block, children })} />
          </section>
        ) : (
          <div className={`resume-block-row is-${block.kind}`} key={block.id}>
            <div className="resume-block-kind"><span>{block.kind === "bullet" ? "要点" : "背景"}</span><button type="button" aria-label="删除内容块" onClick={() => remove(index)}><Trash2 size={13} /></button></div>
            {block.kind === "bullet" && <input aria-label="要点标签" value={block.label || ""} onChange={(event) => update(index, { ...block, label: event.target.value })} placeholder="可选标签，如：用户研究" />}
            <textarea aria-label={block.kind === "bullet" ? "成果要点" : "背景说明"} rows={2} value={block.text || ""} onChange={(event) => update(index, { ...block, text: event.target.value })} placeholder={block.kind === "bullet" ? "写清动作、方法、产物和结果" : "一段不带圆点的背景说明"} />
          </div>
        ))}
        {!blocks.length && <p className="resume-block-empty">尚未识别到内容，可按真实层级添加背景、要点或项目组。</p>}
      </div>
      <footer><button type="button" onClick={() => add("paragraph")}><Plus size={13} />背景段</button><button type="button" onClick={() => add("bullet")}><Plus size={13} />成果要点</button>{allowProjects && <button type="button" onClick={() => add("project")}><Plus size={13} />项目组</button>}</footer>
    </div>
  );
}

function updateEntryBlocks<T extends { description: string; contentBlocks?: ResumeContentBlock[] }>(entry: T, contentBlocks: ResumeContentBlock[]): T {
  return { ...entry, contentBlocks, description: serializeResumeContentBlocks(contentBlocks) };
}

function EducationEditor({ item, index, onChange, onDelete }: { item: ProfileEducation; index: number; onChange: (item: ProfileEducation) => void; onDelete: () => void }) {
  const field = (key: keyof ProfileEducation) => (value: string) => onChange({ ...item, [key]: value });
  return <EntryCard title={item.school || `教育经历 ${index + 1}`} onDelete={onDelete}><TextField label="学校" value={item.school} onChange={field("school")} /><TextField label="专业" value={item.major} onChange={field("major")} /><TextField label="学历" value={item.degree} onChange={field("degree")} /><TextField label="GPA" value={item.gpa} onChange={field("gpa")} /><TextField label="开始时间" value={item.startDate} onChange={field("startDate")} placeholder="2022.09" /><TextField label="结束时间" value={item.endDate} onChange={field("endDate")} placeholder="2026.06" /></EntryCard>;
}

function ExperienceEditor({ item, index, onChange, onDelete }: { item: ProfileExperience; index: number; onChange: (item: ProfileExperience) => void; onDelete: () => void }) {
  const field = (key: keyof ProfileExperience) => (value: string) => onChange({ ...item, [key]: value });
  return <EntryCard title={item.organization || `工作经历 ${index + 1}`} onDelete={onDelete}><TextField label="公司 / 组织" value={item.organization} onChange={field("organization")} /><TextField label="职位" value={item.title} onChange={field("title")} /><TextField label="开始时间" value={item.startDate} onChange={field("startDate")} /><TextField label="结束时间" value={item.endDate} onChange={field("endDate")} /><ContentBlocksEditor blocks={item.contentBlocks} onChange={(blocks) => onChange(updateEntryBlocks(item, blocks))} /></EntryCard>;
}

function ProjectEditor({ item, index, onChange, onDelete }: { item: ProfileProject; index: number; onChange: (item: ProfileProject) => void; onDelete: () => void }) {
  const field = (key: keyof ProfileProject) => (value: string) => onChange({ ...item, [key]: value });
  return <EntryCard title={item.name || `项目 ${index + 1}`} onDelete={onDelete}><TextField label="项目名称" value={item.name} onChange={field("name")} /><TextField label="担任角色" value={item.role} onChange={field("role")} /><TextField label="开始时间" value={item.startDate} onChange={field("startDate")} /><TextField label="结束时间" value={item.endDate} onChange={field("endDate")} /><ContentBlocksEditor blocks={item.contentBlocks} allowProjects={false} onChange={(blocks) => onChange(updateEntryBlocks(item, blocks))} /></EntryCard>;
}

function CampusEditor({ item, index, onChange, onDelete }: { item: ProfileCampusExperience; index: number; onChange: (item: ProfileCampusExperience) => void; onDelete: () => void }) {
  const field = (key: keyof ProfileCampusExperience) => (value: string) => onChange({ ...item, [key]: value });
  return <EntryCard title={item.type || `在校经历 ${index + 1}`} onDelete={onDelete}><TextField label="组织 / 类型" value={item.type} onChange={field("type")} /><TextField label="担任角色" value={item.role} onChange={field("role")} /><TextField label="开始时间" value={item.startDate} onChange={field("startDate")} /><TextField label="结束时间" value={item.endDate} onChange={field("endDate")} /><ContentBlocksEditor blocks={item.contentBlocks} allowProjects={false} onChange={(blocks) => onChange(updateEntryBlocks(item, blocks))} /></EntryCard>;
}

function AwardEditor({ item, index, onChange, onDelete }: { item: ProfileAward; index: number; onChange: (item: ProfileAward) => void; onDelete: () => void }) {
  const field = (key: keyof ProfileAward) => (value: string) => onChange({ ...item, [key]: value });
  return <EntryCard title={item.name || `获奖 ${index + 1}`} onDelete={onDelete}><TextField label="奖项名称" value={item.name} onChange={field("name")} /><TextField label="获奖时间" value={item.date} onChange={field("date")} /><TextField label="级别" value={item.level} onChange={field("level")} /><TextField label="补充说明" value={item.description} onChange={field("description")} /></EntryCard>;
}
