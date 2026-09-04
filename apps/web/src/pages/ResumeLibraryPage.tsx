import { useEffect, useMemo, useState } from "react";
import type { ResumeTemplateRecord, ResumeVersionRecord } from "@offerflow/contracts";
import { createResumeDocument, createResumeStarterProfile, type ResumeAsset } from "@offerflow/domain";
import { ChevronRight, Clock3, FileCheck2, FileText, House, LoaderCircle, PencilLine, Plus, Trash2 } from "lucide-react";
import { api } from "../app/api";
import { createUuid } from "../app/id";
import { navigate } from "../app/router";

const STATUS_LABELS = { draft: "编辑中", reviewed: "已审阅", exported: "已导出", applied: "已投递", archived: "已归档" } as const;

function createStarterPortrait(id: string): ResumeAsset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="320" viewBox="0 0 280 320"><rect width="280" height="320" fill="#f2f2f0"/><circle cx="140" cy="105" r="58" fill="#c9c9c5"/><path d="M42 320c8-82 43-127 98-127s90 45 98 127" fill="#9e9e99"/><path d="M91 91c5-44 28-66 52-66 36 0 58 27 58 69-17-10-33-28-41-45-14 22-38 37-69 42Z" fill="#565653"/></svg>`;
  return {
    id,
    kind: "portrait",
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    mimeType: "image/svg+xml",
    width: 280,
    height: 320,
    source: "upload"
  };
}

export function ResumeLibraryPage() {
  const [versions, setVersions] = useState<ResumeVersionRecord[]>([]);
  const [templates, setTemplates] = useState<ResumeTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.resumes.listVersions(), api.resumes.listTemplates()])
      .then(([versionResult, templateResult]) => { setVersions(versionResult.versions); setTemplates(templateResult.templates); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法载入简历版本"))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, ResumeVersionRecord[]>();
    for (const version of versions) {
      const key = version.version.sourceResumeName || "未命名母版";
      map.set(key, [...(map.get(key) || []), version]);
    }
    return [...map.entries()];
  }, [versions]);

  const removeVersion = async (item: ResumeVersionRecord) => {
    const label = `${item.version.company} · ${item.version.position}`;
    if (!window.confirm(`确定删除《${label}》这份定制简历吗？\n删除后不能恢复，也会解除与投递记录的关联。`)) return;
    try {
      await api.resumes.removeVersion(item.version.id, item.revision);
      setVersions((current) => current.filter(({ version }) => version.id !== item.version.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除定制简历失败，请稍后重试");
    }
  };

  const createTemplate = async () => {
    setCreating(true);
    setError("");
    const id = `resume_${createUuid()}`;
    const portrait = createStarterPortrait(`${id}_starter_portrait`);
    const starterCount = templates.filter((item) => item.name.startsWith("排版示例简历")).length;
    const name = starterCount ? `排版示例简历 ${starterCount + 1}` : "排版示例简历";
    try {
      const result = await api.resumes.createTemplate({
        id,
        name,
        document: createResumeDocument({ id, title: name, profile: createResumeStarterProfile(), assets: [portrait], portraitAssetId: portrait.id })
      });
      setTemplates((current) => [result.template, ...current]);
      navigate(`/app/resumes/edit/${encodeURIComponent(result.template.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法新建简历");
      setCreating(false);
    }
  };

  const removeTemplate = async (template: ResumeTemplateRecord) => {
    if (!window.confirm(`确定删除《${template.name}》吗？\n已有岗位定制版本不会被删除。`)) return;
    try {
      await api.resumes.removeTemplate(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除通用简历失败，请稍后重试");
    }
  };

  return <section className="data-page resume-library-page">
    <header className="page-header resume-library-heading">
      <div>
        <nav className="application-breadcrumb" aria-label="页面位置">
          <a href="/app/chat" onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate("/app/chat"); }}><House aria-hidden="true" size={13} />主页</a>
          <ChevronRight aria-hidden="true" size={13} /><span aria-current="page">简历档案</span>
        </nav>
        <h1 tabIndex={-1}>简历中心</h1>
        <p>一份通用版本作为岗位定制的起点；每个岗位的定制简历独立保存、可追溯。</p>
      </div>
      <div className="resume-library-actions"><div className="resume-library-metrics"><span><strong>{templates.length}</strong> 份通用版本</span><span><strong>{versions.length}</strong> 个岗位版本</span></div><button className="primary-button resume-create-button" type="button" onClick={() => void createTemplate()} disabled={creating}>{creating ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{creating ? "正在创建" : "制作新简历"}</button></div>
    </header>

    {error && <div className="data-error" role="alert">{error}</div>}
    {loading ? <div className="resume-library-skeleton" role="status"><span className="sr-only">正在同步简历版本…</span>{[0, 1].map((groupIndex) => <section className="resume-library-skeleton__group" key={groupIndex} aria-hidden="true"><header className="resume-library-skeleton__header"><span className="skel resume-library-skeleton__badge" /><div className="resume-library-skeleton__heading"><span className="skel resume-library-skeleton__title" /><span className="skel resume-library-skeleton__subtitle" /></div></header><div className="resume-library-skeleton__grid">{[0, 1, 2].map((cardIndex) => <div className="resume-library-skeleton__card" key={cardIndex}><span className="skel resume-library-skeleton__pill" /><span className="skel resume-library-skeleton__line" /><span className="skel resume-library-skeleton__line resume-library-skeleton__line--short" /></div>)}</div></section>)}</div>
    : !versions.length && !templates.length ? <div className="resume-library-empty"><span><FileText size={28} /></span><h2>从字段开始，制作第一份简历</h2><p>无需先上传 PDF。姓名、教育、经历和项目会保存为可编辑字段，之后可直接同步给插件用于网申填写和定岗修改。</p><button className="primary-button" type="button" onClick={() => void createTemplate()} disabled={creating}>{creating ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{creating ? "正在创建" : "从空白简历开始"}</button></div>
    : <div className="resume-library-sections">
      <section className="resume-template-section">
        <header className="resume-section-heading"><span><FileText size={18} /></span><div><strong>通用版本</strong><small>用于创建岗位定制简历的基础版本；只同步简历内容，不需要上传 PDF 原件。</small></div></header>
        {templates.length ? <div className="resume-template-grid">{templates.map((template) => <article className="resume-library-card" key={template.id}><button className="resume-library-card__open" type="button" onClick={() => navigate(`/app/resumes/edit/${encodeURIComponent(template.id)}`)}><span className="resume-template-card__tag">字段简历</span><strong>{template.name}</strong><span>{template.profile.targetRole || "点击继续完善简历"}</span><small><Clock3 size={13} />{new Date(template.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · {template.origin === "web" ? "网页创建" : "插件同步"}</small><em><PencilLine size={13} aria-hidden="true" />继续编辑</em></button><button className="resume-library-card__delete" type="button" onClick={() => void removeTemplate(template)} aria-label={`删除 ${template.name}`} title="删除通用简历"><Trash2 aria-hidden="true" size={15} /></button></article>)}</div> : <p className="resume-section-empty">还没有通用版本。你可以直接在网页制作，或从插件同步已有简历。</p>}
      </section>
      <section className="resume-tailored-section">
        <header className="resume-section-heading"><span><FileCheck2 size={18} /></span><div><strong>岗位定制简历</strong><small>每份定制简历独立对应一个岗位，删除不会影响插件中的通用模板。</small></div></header>
        {!versions.length ? <p className="resume-section-empty">还没有岗位定制版本。可以从投递管理中为具体岗位创建。</p> : <div className="resume-source-groups">{groups.map(([sourceName, items]) => <section className="resume-source-group" key={sourceName}><header><span><FileCheck2 size={18} /></span><div><strong>{sourceName}</strong><small>{items.length} 个岗位定制版本</small></div></header><div className="resume-version-grid">{items.map((item) => { const { version } = item; return <article className="resume-version-card" key={version.id}><button className="resume-version-card__open" type="button" onClick={() => navigate(`/app/resumes/tailor/${encodeURIComponent(version.tailorTaskId)}`)}><span className="resume-version-status"><PencilLine aria-hidden="true" size={13} />{STATUS_LABELS[version.status]}</span><strong>{version.position}</strong><span>{version.company}</span><small><Clock3 size={13} />{new Date(version.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></button><button className="resume-version-card__delete" type="button" onClick={() => void removeVersion(item)} aria-label={`删除 ${version.company} ${version.position} 的定制简历`} title="删除定制简历"><Trash2 aria-hidden="true" size={15} /></button></article>; })}</div></section>)}</div>}
      </section>
    </div>}
  </section>;
}
