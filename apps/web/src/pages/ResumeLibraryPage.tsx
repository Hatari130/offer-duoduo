import { useEffect, useMemo, useState } from "react";
import type { ResumeTemplateRecord, ResumeVersionRecord } from "@offerflow/contracts";
import { ChevronRight, Clock3, FileCheck2, FileText, House, PencilLine, Trash2 } from "lucide-react";
import { api } from "../app/api";
import { navigate } from "../app/router";

const STATUS_LABELS = { draft: "编辑中", reviewed: "已审阅", exported: "已导出", applied: "已投递", archived: "已归档" } as const;

export function ResumeLibraryPage() {
  const [versions, setVersions] = useState<ResumeVersionRecord[]>([]);
  const [templates, setTemplates] = useState<ResumeTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
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

  return <section className="data-page resume-library-page">
    <header className="page-header resume-library-heading">
      <div>
        <nav className="application-breadcrumb" aria-label="页面位置">
          <a href="/app/chat" onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate("/app/chat"); }}><House aria-hidden="true" size={13} />主页</a>
          <ChevronRight aria-hidden="true" size={13} /><span aria-current="page">简历档案</span>
        </nav>
        <h1 tabIndex={-1}>简历中心</h1>
        <p>插件里的通用简历会同步到这里；每个岗位的定制版本独立保存、可追溯。</p>
      </div>
      <div className="resume-library-metrics"><span><strong>{templates.length}</strong> 个插件模板</span><span><strong>{versions.length}</strong> 个岗位版本</span></div>
    </header>

    {error && <div className="data-error" role="alert">{error}</div>}
    {loading ? <div className="resume-library-skeleton" role="status"><span className="sr-only">正在同步简历版本…</span>{[0, 1].map((groupIndex) => <section className="resume-library-skeleton__group" key={groupIndex} aria-hidden="true"><header className="resume-library-skeleton__header"><span className="skel resume-library-skeleton__badge" /><div className="resume-library-skeleton__heading"><span className="skel resume-library-skeleton__title" /><span className="skel resume-library-skeleton__subtitle" /></div></header><div className="resume-library-skeleton__grid">{[0, 1, 2].map((cardIndex) => <div className="resume-library-skeleton__card" key={cardIndex}><span className="skel resume-library-skeleton__pill" /><span className="skel resume-library-skeleton__line" /><span className="skel resume-library-skeleton__line resume-library-skeleton__line--short" /></div>)}</div></section>)}</div>
    : !versions.length && !templates.length ? <div className="resume-library-empty"><span><FileText size={28} /></span><h2>还没有同步到简历</h2><p>在插件中打开“简历管理”，点击同步后，通用模板会显示在这里；岗位定制版本也会集中保存。</p><button className="secondary-button" onClick={() => navigate("/app/applications")}>查看投递管理</button></div>
    : <div className="resume-library-sections">
      <section className="resume-template-section">
        <header className="resume-section-heading"><span><FileText size={18} /></span><div><strong>插件简历模板</strong><small>来自已连接浏览器插件的通用简历；原始文件仍保存在你的设备中。</small></div></header>
        {templates.length ? <div className="resume-template-grid">{templates.map((template) => <article className="resume-template-card" key={template.id}><span className="resume-template-card__tag">已同步</span><strong>{template.name}</strong><span>{template.profile.targetRole || "通用求职简历"}</span><small><Clock3 size={13} />{new Date(template.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · 在插件中编辑</small></article>)}</div> : <p className="resume-section-empty">暂未收到插件模板。请在插件中完成登录后点击同步。</p>}
      </section>
      <section className="resume-tailored-section">
        <header className="resume-section-heading"><span><FileCheck2 size={18} /></span><div><strong>岗位定制简历</strong><small>每份定制简历独立对应一个岗位，删除不会影响插件中的通用模板。</small></div></header>
        {!versions.length ? <p className="resume-section-empty">还没有岗位定制版本。可以从投递管理中为具体岗位创建。</p> : <div className="resume-source-groups">{groups.map(([sourceName, items]) => <section className="resume-source-group" key={sourceName}><header><span><FileCheck2 size={18} /></span><div><strong>{sourceName}</strong><small>{items.length} 个岗位定制版本</small></div></header><div className="resume-version-grid">{items.map((item) => { const { version } = item; return <article className="resume-version-card" key={version.id}><button className="resume-version-card__open" type="button" onClick={() => navigate(`/app/resumes/tailor/${encodeURIComponent(version.tailorTaskId)}`)}><span className="resume-version-status"><PencilLine aria-hidden="true" size={13} />{STATUS_LABELS[version.status]}</span><strong>{version.position}</strong><span>{version.company}</span><small><Clock3 size={13} />{new Date(version.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></button><button className="resume-version-card__delete" type="button" onClick={() => void removeVersion(item)} aria-label={`删除 ${version.company} ${version.position} 的定制简历`} title="删除定制简历"><Trash2 aria-hidden="true" size={15} /></button></article>; })}</div></section>)}</div>}
      </section>
    </div>}
  </section>;
}
