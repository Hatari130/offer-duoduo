import { useEffect, useMemo, useState } from "react";
import type { ResumeVersionRecord } from "@offerflow/contracts";
import { ChevronRight, Clock3, FileCheck2, FileText, House, PencilLine } from "lucide-react";
import { api } from "../app/api";
import { navigate } from "../app/router";

const STATUS_LABELS = {
  draft: "编辑中",
  reviewed: "已审阅",
  exported: "已导出",
  applied: "已投递",
  archived: "已归档"
} as const;

export function ResumeLibraryPage() {
  const [versions, setVersions] = useState<ResumeVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.resumes.listVersions()
      .then((result) => setVersions(result.versions))
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

  return (
    <section className="data-page resume-library-page">
      <header className="page-header resume-library-heading">
        <div>
          <nav className="application-breadcrumb" aria-label="页面位置">
            <a
              href="/app/chat"
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigate("/app/chat");
              }}
            ><House aria-hidden="true" size={13} />主页</a>
            <ChevronRight aria-hidden="true" size={13} />
            <span aria-current="page">简历档案</span>
          </nav>
          <h1 tabIndex={-1}>简历中心</h1>
          <p>母版保持稳定，每个岗位拥有独立、可追溯的定制版本。</p>
        </div>
        <div className="resume-library-metrics"><span><strong>{groups.length}</strong> 个母版来源</span><span><strong>{versions.length}</strong> 个岗位版本</span></div>
      </header>

      {error && <div className="data-error" role="alert">{error}</div>}
      {loading ? (
        <div className="resume-library-skeleton" role="status">
          <span className="sr-only">正在同步简历版本…</span>
          {[0, 1].map((groupIndex) => (
            <section className="resume-library-skeleton__group" key={groupIndex} aria-hidden="true">
              <header className="resume-library-skeleton__header">
                <span className="skel resume-library-skeleton__badge" />
                <div className="resume-library-skeleton__heading">
                  <span className="skel resume-library-skeleton__title" />
                  <span className="skel resume-library-skeleton__subtitle" />
                </div>
              </header>
              <div className="resume-library-skeleton__grid">
                {[0, 1, 2].map((cardIndex) => (
                  <div className="resume-library-skeleton__card" key={cardIndex}>
                    <span className="skel resume-library-skeleton__pill" />
                    <span className="skel resume-library-skeleton__line" />
                    <span className="skel resume-library-skeleton__line resume-library-skeleton__line--short" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : !versions.length ? (
        <div className="resume-library-empty"><span><FileText size={28} /></span><h2>还没有岗位定制版本</h2><p>在招聘页面点击“为这个岗位定制简历”，生成的版本会集中保存在这里。</p><button className="secondary-button" onClick={() => navigate("/app/applications")}>查看投递管理</button></div>
      ) : (
        <div className="resume-source-groups">
          {groups.map(([sourceName, items]) => (
            <section className="resume-source-group" key={sourceName}>
              <header><span><FileCheck2 size={18} /></span><div><strong>{sourceName}</strong><small>{items.length} 个岗位定制版本</small></div></header>
              <div className="resume-version-grid">
                {items.map(({ version }) => (
                  <button className="resume-version-card" type="button" key={version.id} onClick={() => navigate(`/app/resumes/tailor/${encodeURIComponent(version.tailorTaskId)}`)}>
                    <span className="resume-version-status"><PencilLine aria-hidden="true" size={13} />{STATUS_LABELS[version.status]}</span>
                    <strong>{version.position}</strong>
                    <span>{version.company}</span>
                    <small><Clock3 size={13} />{new Date(version.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
