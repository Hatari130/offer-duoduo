import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ApplicationSyncItem } from "@offerflow/contracts";
import {
  CLOSED_STAGE_REASONS,
  CLOSED_STAGE_REASON_LABELS,
  inferRecruitmentType,
  INTERVIEW_ROUNDS,
  INTERVIEW_ROUND_LABELS,
  RECRUITMENT_TYPES,
  RECRUITMENT_TYPE_LABELS,
  SELECTABLE_STAGES,
  selectableStage,
  STAGE_LABELS,
  type ApplicationStage,
  type ClosedStageReason,
  type InterviewRound,
  type JobApplication,
  type RecruitmentType
} from "@offerflow/domain";
import {
  ArrowUpDown,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  Columns3,
  Download,
  FileText,
  House,
  ListFilter,
  MapPin,
  MessageCircleQuestion,
  Plus,
  Search,
  Send,
  Star,
  Table2,
  UsersRound,
  X
} from "lucide-react";
import { api } from "../app/api";
import { createUuid } from "../app/id";
import { navigate, startUiTransition } from "../app/router";
import { InterviewRecordsDialog } from "../features/applications/InterviewRecordsDialog";
import { downloadApplicationExport } from "../features/applications/applicationExcelExport";

type ViewMode = "table" | "board";
type SortKey = "recruitmentType" | "stage" | "appliedAt";
type SortDirection = "asc" | "desc";

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "manual";
  }
}

function appliedAtLabel(value?: string): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function stageTone(stage: ApplicationStage): string {
  if (stage === "offer") return "success";
  if (stage === "closed") return "muted";
  if (stage === "interview") return "interview";
  if (stage === "assessment") return "assessment";
  if (stage === "applied") return "applied";
  return "interested";
}

function selectedStageLabel(
  stage: ApplicationStage,
  closedReason?: ClosedStageReason,
  interviewRound?: InterviewRound
): string {
  if (stage === "closed" && closedReason) return `${STAGE_LABELS.closed}-${CLOSED_STAGE_REASON_LABELS[closedReason]}`;
  if (stage === "interview" && interviewRound) return `${STAGE_LABELS.interview}-${INTERVIEW_ROUND_LABELS[interviewRound]}`;
  return STAGE_LABELS[stage];
}

function applicationStageLabel(application: JobApplication): string {
  return selectedStageLabel(selectableStage(application.stage), application.closedReason, application.interviewRound);
}

function applicationRecruitmentType(application: JobApplication): RecruitmentType | undefined {
  return application.recruitmentType || inferRecruitmentType(
    application.position,
    application.jobType,
    application.summary,
    application.rawExcerpt
  );
}

export function ApplicationsPage() {
  const [items, setItems] = useState<ApplicationSyncItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | ApplicationStage>("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>();
  const [view, setView] = useState<ViewMode>("table");
  const [exporting, setExporting] = useState(false);
  const [expandedEmptyStages, setExpandedEmptyStages] = useState<Set<ApplicationStage>>(() => new Set());
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; item: ApplicationSyncItem }>();
  const [interviewDialog, setInterviewDialog] = useState<ApplicationSyncItem>();

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const load = useCallback((options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    setError("");
    api.applications
      .list()
      .then((result) => setItems(result.applications))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "无法载入投递记录"))
      .finally(() => {
        if (!options.silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => load({ silent: true }), 5000);
    const refreshOnFocus = () => load({ silent: true });
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter(({ application }) => {
      const recruitmentType = applicationRecruitmentType(application);
      const matchQuery = !normalized || `${application.company} ${application.position} ${application.city || ""} ${recruitmentType ? RECRUITMENT_TYPE_LABELS[recruitmentType] : ""} ${application.summary || ""} ${application.rawExcerpt || ""}`.toLowerCase().includes(normalized);
      return matchQuery && (stage === "all" || selectableStage(application.stage) === stage);
    }).sort((left, right) => {
      const closedDifference = Number(selectableStage(left.application.stage) === "closed") - Number(selectableStage(right.application.stage) === "closed");
      if (closedDifference) return closedDifference;

      if (sort) {
        const leftApplication = left.application;
        const rightApplication = right.application;
        let comparison = 0;
        if (sort.key === "recruitmentType") {
          comparison = (applicationRecruitmentType(leftApplication) ? RECRUITMENT_TYPE_LABELS[applicationRecruitmentType(leftApplication)!] : "未识别")
            .localeCompare(applicationRecruitmentType(rightApplication) ? RECRUITMENT_TYPE_LABELS[applicationRecruitmentType(rightApplication)!] : "未识别", "zh-CN");
        } else if (sort.key === "stage") {
          comparison = SELECTABLE_STAGES.indexOf(selectableStage(leftApplication.stage)) - SELECTABLE_STAGES.indexOf(selectableStage(rightApplication.stage));
        } else {
          const leftTime = leftApplication.appliedAt ? Date.parse(leftApplication.appliedAt) : Number.NaN;
          const rightTime = rightApplication.appliedAt ? Date.parse(rightApplication.appliedAt) : Number.NaN;
          if (Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return 1;
          if (!Number.isNaN(leftTime) && Number.isNaN(rightTime)) return -1;
          comparison = leftTime - rightTime;
        }
        if (comparison) return sort.direction === "asc" ? comparison : -comparison;
      }

      return right.application.updatedAt.localeCompare(left.application.updatedAt);
    });
  }, [items, query, sort, stage]);

  const toggleSort = (key: SortKey) => {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "appliedAt" ? "desc" : "asc" });
  };

  const saveItem = (item: ApplicationSyncItem) => {
    setItems((current) => {
      const exists = current.some((entry) => entry.application.id === item.application.id);
      return exists
        ? current.map((entry) => entry.application.id === item.application.id ? item : entry)
        : [item, ...current];
    });
    setStatus("投递记录已保存");
  };

  const mutate = async (item: ApplicationSyncItem, application: JobApplication) => {
    setError("");
    try {
      const result = await api.applications.update(application.id, {
        application,
        expectedRevision: item.revision
      });
      saveItem(result.item);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新失败，请重试");
    }
  };

  const changeStage = (item: ApplicationSyncItem, nextStage: ApplicationStage) => {
    const currentStage = selectableStage(item.application.stage);
    if (currentStage === nextStage) return;
    const now = new Date().toISOString();
    void mutate(item, {
      ...item.application,
      stage: nextStage,
      closedReason: nextStage === "closed" ? item.application.closedReason : undefined,
      interviewRound: nextStage === "interview" ? item.application.interviewRound : undefined,
      updatedAt: now,
      events: [
        ...item.application.events,
        {
          id: createUuid(),
          type: "stage_changed",
          title: `${applicationStageLabel(item.application)} → ${selectedStageLabel(nextStage, item.application.closedReason, item.application.interviewRound)}`,
          occurredAt: now
        }
      ]
    });
  };

  const changeClosedReason = (item: ApplicationSyncItem, closedReason: ClosedStageReason | undefined) => {
    if (item.application.closedReason === closedReason && selectableStage(item.application.stage) === "closed") return;
    const now = new Date().toISOString();
    void mutate(item, {
      ...item.application,
      stage: "closed",
      closedReason,
      interviewRound: undefined,
      updatedAt: now,
      events: [
        ...item.application.events,
        {
          id: createUuid(),
          type: "stage_changed",
          title: `结束原因更新为：${closedReason ? CLOSED_STAGE_REASON_LABELS[closedReason] : "未标注"}`,
          occurredAt: now
        }
      ]
    });
  };

  const changeInterviewRound = (item: ApplicationSyncItem, interviewRound: InterviewRound | undefined) => {
    if (item.application.interviewRound === interviewRound && selectableStage(item.application.stage) === "interview") return;
    const now = new Date().toISOString();
    void mutate(item, {
      ...item.application,
      stage: "interview",
      closedReason: undefined,
      interviewRound,
      updatedAt: now,
      events: [
        ...item.application.events,
        {
          id: createUuid(),
          type: "stage_changed",
          title: `面试轮次更新为：${interviewRound ? INTERVIEW_ROUND_LABELS[interviewRound] : "未标注"}`,
          occurredAt: now
        }
      ]
    });
  };

  const changeRecruitmentType = (item: ApplicationSyncItem, recruitmentType: RecruitmentType | undefined) => {
    if (item.application.recruitmentType === recruitmentType) return;
    void mutate(item, {
      ...item.application,
      recruitmentType,
      updatedAt: new Date().toISOString()
    });
  };

  const selectView = (nextView: ViewMode) => {
    if (view === nextView) return;
    startUiTransition(() => setView(nextView), "application-view");
  };

  const exportApplications = () => {
    if (!filtered.length || exporting) return;
    setExporting(true);
    window.requestAnimationFrame(() => {
      try {
        downloadApplicationExport(filtered);
        setStatus(`已导出 ${filtered.length} 条投递记录。`);
      } catch {
        setError("暂时无法生成 Excel 文件，请重试。");
      } finally {
        setExporting(false);
      }
    });
  };

  const toggleEmptyStage = (stageKey: ApplicationStage) => {
    setExpandedEmptyStages((current) => {
      const next = new Set(current);
      if (next.has(stageKey)) next.delete(stageKey);
      else next.add(stageKey);
      return next;
    });
  };

  const activeCount = items.filter((item) => !["closed", "offer"].includes(item.application.stage)).length;
  const interviewCount = items.filter((item) => item.application.stage === "interview").length;
  const offerCount = items.filter((item) => item.application.stage === "offer").length;

  return (
    <section className="data-page applications-page">
      <header className="page-header application-heading">
        <div className="application-heading-copy">
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
            <span aria-current="page">投递工作台</span>
          </nav>
          <h1 tabIndex={-1}>个人投递管理</h1>
        </div>
        <div className="application-metrics" aria-label="投递概览">
          <div className="metric-card metric-card--active"><span className="metric-icon"><Send aria-hidden="true" size={22} /></span><span><small>推进中</small><strong>{activeCount}</strong></span></div>
          <div className="metric-card metric-card--interview"><span className="metric-icon"><UsersRound aria-hidden="true" size={22} /></span><span><small>面试阶段</small><strong>{interviewCount}</strong></span></div>
          <div className="metric-card metric-card--offer"><span className="metric-icon"><BadgeCheck aria-hidden="true" size={22} /></span><span><small>收到 Offer</small><strong>{offerCount}</strong></span></div>
        </div>
        <button className="primary-button" type="button" onClick={() => setDialog({ mode: "create" })}>
          <Plus aria-hidden="true" size={17} />添加投递
        </button>
      </header>

      <div className="data-toolbar application-toolbar" data-view={view}>
        <label className="search-control">
          <span className="sr-only">搜索投递记录</span>
          <Search aria-hidden="true" size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位、城市或 JD" />
        </label>
        <label className="select-control">
          <ListFilter aria-hidden="true" size={16} />
          <span className="sr-only">按投递阶段筛选</span>
          <select value={stage} onChange={(event) => setStage(event.target.value as typeof stage)}>
            <option value="all">全部阶段</option>
            {SELECTABLE_STAGES.map((value) => <option value={value} key={value}>{STAGE_LABELS[value]}</option>)}
          </select>
        </label>
        <button
          className="application-export-button"
          type="button"
          aria-label={`导出当前筛选的 ${filtered.length} 条投递记录为 Excel`}
          disabled={loading || filtered.length === 0 || exporting}
          title={filtered.length === 0 ? "当前筛选没有可导出的投递记录" : "导出当前筛选结果"}
          onClick={exportApplications}
        >
          <Download aria-hidden="true" size={16} />{exporting ? "正在生成" : "导出 Excel"}
        </button>
        <div className="view-switch" aria-label="显示方式">
          <button type="button" aria-pressed={view === "table"} onClick={() => selectView("table")}><Table2 aria-hidden="true" size={16} />表格</button>
          <button type="button" aria-pressed={view === "board"} onClick={() => selectView("board")}><Columns3 aria-hidden="true" size={16} />看板</button>
        </div>
      </div>

      <div className="page-announcer" role={error ? "alert" : "status"}>{error || status}</div>

      <div className="application-view-content" data-view={view}>
        {loading ? (
        <div className="data-loading" role="status"><span className="loading-orbit" />正在同步投递记录…</div>
      ) : items.length === 0 ? (
        <div className="application-empty">
          <div className="empty-stack" aria-hidden="true"><i /><i /><span><BriefcaseBusiness size={27} /></span></div>
          <span className="page-kicker">第一条投递</span>
          <h2>从第一条投递开始建立节奏</h2>
          <p>你可以在这里手动添加，也可以在浏览器插件抓取岗位后自动同步。</p>
          <button className="primary-button" type="button" onClick={() => setDialog({ mode: "create" })}><Plus aria-hidden="true" size={17} />添加第一条投递</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="filter-empty"><Search aria-hidden="true" size={22} /><h2>没有匹配的投递记录</h2><p>调整关键词或阶段筛选。</p><button type="button" onClick={() => { setQuery(""); setStage("all"); }}>清除筛选</button></div>
      ) : view === "table" ? (
        <div className="application-table-wrap">
          <table className="data-table application-table">
            <caption className="sr-only">个人投递记录</caption>
            <thead><tr><th>公司与岗位</th><th aria-sort={sort?.key === "recruitmentType" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button className="table-sort" type="button" onClick={() => toggleSort("recruitmentType")}>岗位类型<ArrowUpDown aria-hidden="true" size={13} /></button></th><th aria-sort={sort?.key === "stage" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button className="table-sort" type="button" onClick={() => toggleSort("stage")}>当前阶段<ArrowUpDown aria-hidden="true" size={13} /></button></th><th aria-sort={sort?.key === "appliedAt" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button className="table-sort" type="button" onClick={() => toggleSort("appliedAt")}>投递时间<ArrowUpDown aria-hidden="true" size={13} /></button></th><th>地点</th><th>岗位 JD</th><th>面试问答记录</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>
              {filtered.map((item) => {
                const application = item.application;
                return (
                  <tr key={application.id} className={selectableStage(application.stage) === "closed" ? "application-row--closed" : undefined}>
                    <td data-label="公司与岗位"><div className="application-identity"><button className="application-title" type="button" onClick={() => setDialog({ mode: "edit", item })}><strong>{application.company}</strong><span>{application.position}</span>{application.tailoredResumeName && <small>已关联定制简历</small>}</button></div></td>
                    <td data-label="岗位类型"><select className="application-tag application-tag--recruitment application-tag--select" aria-label={`更新 ${application.company} ${application.position} 的岗位类型`} value={applicationRecruitmentType(application) || ""} onChange={(event) => changeRecruitmentType(item, (event.target.value || undefined) as RecruitmentType | undefined)}><option value="">未识别</option>{RECRUITMENT_TYPES.map((value) => <option value={value} key={value}>{RECRUITMENT_TYPE_LABELS[value]}</option>)}</select></td>
                    <td data-label="当前阶段"><div className="stage-cell"><select className={`application-tag application-tag--stage application-tag--select application-tag--${stageTone(selectableStage(application.stage))}`} aria-label={`更新 ${application.company} ${application.position} 的阶段`} value={selectableStage(application.stage)} onChange={(event) => changeStage(item, event.target.value as ApplicationStage)}>{SELECTABLE_STAGES.map((value) => <option value={value} key={value}>{value === "closed" ? selectedStageLabel(value, application.closedReason) : value === "interview" ? selectedStageLabel(value, undefined, application.interviewRound) : STAGE_LABELS[value]}</option>)}</select>{selectableStage(application.stage) === "interview" && !application.interviewRound && <select className="application-tag application-tag--select application-tag--secondary" aria-label={`更新 ${application.company} ${application.position} 的面试轮次`} value="" onChange={(event) => changeInterviewRound(item, event.target.value as InterviewRound)}><option value="">选择面试轮次</option>{INTERVIEW_ROUNDS.map((round) => <option value={round} key={round}>{INTERVIEW_ROUND_LABELS[round]}</option>)}</select>}{selectableStage(application.stage) === "closed" && !application.closedReason && <select className="application-tag application-tag--select application-tag--secondary" aria-label={`更新 ${application.company} ${application.position} 的结束原因`} value="" onChange={(event) => changeClosedReason(item, event.target.value as ClosedStageReason)}><option value="">选择结束原因</option>{CLOSED_STAGE_REASONS.map((reason) => <option value={reason} key={reason}>{CLOSED_STAGE_REASON_LABELS[reason]}</option>)}</select>}</div></td>
                    <td data-label="投递时间"><span className="cell-icon"><CalendarClock aria-hidden="true" size={14} />{appliedAtLabel(application.appliedAt)}</span></td>
                    <td data-label="地点"><span className="cell-icon"><MapPin aria-hidden="true" size={14} />{application.city || "未填写"}</span></td>
                    <td data-label="岗位 JD"><button className={`application-jd-entry ${application.rawExcerpt?.trim() ? "has-content" : ""}`} type="button" aria-label={`${application.rawExcerpt?.trim() ? "查看" : "为"} ${application.company} ${application.position} ${application.rawExcerpt?.trim() ? "的岗位 JD" : "添加岗位 JD"}`} onClick={() => setDialog({ mode: "edit", item })}><FileText aria-hidden="true" size={15} /><span>{application.rawExcerpt?.trim() ? "查看 JD" : "添加 JD"}</span></button></td>
                    <td data-label="面试记录"><button className="interview-record-entry" type="button" aria-label={`为 ${application.company} ${application.position} 添加面试问答记录`} onClick={() => setInterviewDialog(item)}><Plus aria-hidden="true" size={15} /><span>添加</span></button></td>
                    <td data-label="快捷操作"><div className="row-actions"><button type="button" aria-label={application.isFavorite ? "取消收藏" : "收藏投递"} onClick={() => void mutate(item, { ...application, isFavorite: !application.isFavorite, updatedAt: new Date().toISOString() })}><Star aria-hidden="true" size={17} fill={application.isFavorite ? "currentColor" : "none"} /></button>{application.tailorTaskId && <button type="button" aria-label={`打开 ${application.company} 的定制简历`} onClick={() => navigate(`/app/resumes/tailor/${encodeURIComponent(application.tailorTaskId!)}`)}><FileText aria-hidden="true" size={17} /></button>}{application.sourceUrl && application.sourceHost !== "manual" && <a href={application.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${application.position} 来源页面`}><ArrowUpRight aria-hidden="true" size={17} /></a>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="mobile-stage-tabs" aria-label="按阶段查看看板">
            <button type="button" aria-pressed={stage === "all"} onClick={() => setStage("all")}>全部</button>
            {SELECTABLE_STAGES.map((stageKey) => (
              <button type="button" key={stageKey} aria-pressed={stage === stageKey} onClick={() => setStage(stageKey)}>
                {STAGE_LABELS[stageKey]}
              </button>
            ))}
          </div>
          <div className="application-board">
          {SELECTABLE_STAGES.filter((stageKey) => stage === "all" || stageKey === stage).map((stageKey) => {
            const stageItems = filtered.filter((item) => selectableStage(item.application.stage) === stageKey);
            const isEmptyStage = stageItems.length === 0;
            const isCollapsed = isEmptyStage && !expandedEmptyStages.has(stageKey);
            return (
              <section className={`board-column ${isCollapsed ? "board-column--collapsed" : ""}`} data-stage={stageKey} key={stageKey}>
                {isEmptyStage ? <button className="board-column-header board-column-header--toggle" type="button" aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? "展开" : "收起"}${STAGE_LABELS[stageKey]}阶段`} onClick={() => toggleEmptyStage(stageKey)}><span>{STAGE_LABELS[stageKey]}</span><strong>{stageItems.length}</strong></button> : <header><span>{STAGE_LABELS[stageKey]}</span><strong>{stageItems.length}</strong></header>}
                <div>
                  {stageItems.map((item) => (
                    <article className={`board-card ${selectableStage(item.application.stage) === "closed" ? "board-card--closed" : ""}`} key={item.application.id}>
                      <button className="board-card-main" type="button" onClick={() => setDialog({ mode: "edit", item })}>
                        <span>{item.application.company}</span><strong>{item.application.position}</strong><em>{applicationRecruitmentType(item.application) ? RECRUITMENT_TYPE_LABELS[applicationRecruitmentType(item.application)!] : "类型未识别"}</em>{["closed", "interview"].includes(selectableStage(item.application.stage)) && <b className="board-stage-label">{applicationStageLabel(item.application)}</b>}<small><MapPin aria-hidden="true" size={12} />{item.application.city || "地点未填写"}</small>
                      </button>
                      <div className="board-card-actions">
                        <button className={`board-jd-entry ${item.application.rawExcerpt?.trim() ? "has-content" : ""}`} type="button" aria-label={`${item.application.rawExcerpt?.trim() ? "查看" : "为"} ${item.application.company} ${item.application.position} ${item.application.rawExcerpt?.trim() ? "的岗位 JD" : "添加岗位 JD"}`} onClick={() => setDialog({ mode: "edit", item })}><FileText aria-hidden="true" size={14} /><span>{item.application.rawExcerpt?.trim() ? "查看 JD" : "添加 JD"}</span></button>
                        <button className="board-interview-entry" type="button" aria-label={`为 ${item.application.company} ${item.application.position} 添加面试问答记录`} onClick={() => setInterviewDialog(item)}><MessageCircleQuestion aria-hidden="true" size={14} /><span>面试记录</span></button>
                      </div>
                    </article>
                  ))}
                  {!stageItems.length && <span className="board-empty">暂无记录</span>}
                </div>
              </section>
            );
          })}
          </div>
        </>
        )}
      </div>

      {dialog && (
        <ApplicationDialog
          item={dialog.mode === "edit" ? dialog.item : undefined}
          onClose={() => setDialog(undefined)}
          onSaved={saveItem}
          onDeleted={(id) => { setItems((current) => current.filter((item) => item.application.id !== id)); setStatus("投递记录已删除"); }}
          onError={setError}
        />
      )}
      {interviewDialog && (
        <InterviewRecordsDialog
          item={interviewDialog}
          onClose={() => setInterviewDialog(undefined)}
        />
      )}
    </section>
  );
}

function ApplicationDialog({
  item,
  onClose,
  onSaved,
  onDeleted,
  onError
}: {
  item?: ApplicationSyncItem;
  onClose: () => void;
  onSaved: (item: ApplicationSyncItem) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [company, setCompany] = useState(item?.application.company || "");
  const [position, setPosition] = useState(item?.application.position || "");
  const [city, setCity] = useState(item?.application.city || "");
  const [recruitmentType, setRecruitmentType] = useState<RecruitmentType | "">(
    item ? applicationRecruitmentType(item.application) || "" : ""
  );
  const [stage, setStage] = useState<ApplicationStage>(selectableStage(item?.application.stage));
  const [closedReason, setClosedReason] = useState<ClosedStageReason | "">(item?.application.closedReason || "");
  const [interviewRound, setInterviewRound] = useState<InterviewRound | "">(item?.application.interviewRound || "");
  const [appliedAt, setAppliedAt] = useState(
    item?.application.appliedAt?.slice(0, 16).replace(" ", "T") || ""
  );
  const [jobDescription, setJobDescription] = useState(item?.application.rawExcerpt || "");
  const [sourceUrl, setSourceUrl] = useState(item?.application.sourceHost === "manual" ? "" : item?.application.sourceUrl || "");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dialogPhase, setDialogPhase] = useState<"opening" | "open" | "closing">("opening");
  const companyRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number>();
  const dialogPhaseRef = useRef(dialogPhase);
  const closeCompletedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const finishClose = useCallback(() => {
    if (closeCompletedRef.current) return;
    closeCompletedRef.current = true;
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    onCloseRef.current();
  }, []);

  const requestClose = useCallback(() => {
    if (dialogPhaseRef.current === "closing") return;
    dialogPhaseRef.current = "closing";
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    setDialogPhase("closing");
    closeTimerRef.current = window.setTimeout(finishClose, 220);
  }, [finishClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (dialogPhaseRef.current !== "opening") return;
      dialogPhaseRef.current = "open";
      setDialogPhase("open");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (companyRef.current ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter((element) => !element.hidden);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else document.querySelector<HTMLElement>("#main-content h1")?.focus();
    };
  }, [requestClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!company.trim() || !position.trim()) {
      setFormError("请填写公司和岗位名称");
      companyRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const providedSourceUrl = sourceUrl.trim();
      const url = providedSourceUrl || "offerflow://manual";
      const application: JobApplication = item
        ? {
            ...item.application,
            company: company.trim(),
            position: position.trim(),
            city: city.trim() || undefined,
            recruitmentType: recruitmentType || undefined,
            stage,
            closedReason: stage === "closed" ? closedReason || undefined : undefined,
            interviewRound: stage === "interview" ? interviewRound || undefined : undefined,
            appliedAt: appliedAt ? appliedAt.replace("T", " ").slice(0, 16) : undefined,
            rawExcerpt: jobDescription.trim() || undefined,
            sourceUrl: url,
            sourceHost: providedSourceUrl ? sourceHost(url) : "manual",
            updatedAt: now,
            events: [
              ...item.application.events,
              { id: createUuid(), type: "updated", title: "在 Web 端更新投递信息", occurredAt: now }
            ]
          }
        : {
            id: createUuid(),
            company: company.trim(),
            position: position.trim(),
            city: city.trim() || undefined,
            recruitmentType: recruitmentType || undefined,
            stage,
            closedReason: stage === "closed" ? closedReason || undefined : undefined,
            interviewRound: stage === "interview" ? interviewRound || undefined : undefined,
            appliedAt: appliedAt ? appliedAt.replace("T", " ").slice(0, 16) : undefined,
            rawExcerpt: jobDescription.trim() || undefined,
            sourceUrl: url,
            sourceHost: providedSourceUrl ? sourceHost(url) : "manual",
            responsibilities: [],
            requirements: [],
            createdAt: now,
            updatedAt: now,
            events: [{ id: createUuid(), type: "created", title: "创建投递记录", occurredAt: now }]
          };

      const result = item
        ? await api.applications.update(application.id, { application, expectedRevision: item.revision })
        : await api.applications.create({ application });
      onSaved(result.item);
      requestClose();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "无法保存投递记录";
      setFormError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await api.applications.remove(item.application.id, item.revision);
      onDeleted(item.application.id);
      requestClose();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "无法删除投递记录";
      setFormError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`application-dialog-backdrop is-${dialogPhase}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className="application-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-dialog-title"
        tabIndex={-1}
        onTransitionEnd={(event) => {
          if (dialogPhase === "closing" && event.target === event.currentTarget && event.propertyName === "transform") {
            finishClose();
          }
        }}
      >
      <form onSubmit={submit} noValidate>
        <header><div><span className="page-kicker">{item ? "编辑投递" : "新建投递"}</span><h2 id="application-dialog-title">{item ? "更新投递信息" : "添加一条投递"}</h2></div><button type="button" aria-label="关闭" onClick={requestClose}><X aria-hidden="true" size={19} /></button></header>
        <div className="dialog-fields">
          <label><span>公司</span><input ref={companyRef} value={company} onChange={(event) => setCompany(event.target.value)} autoComplete="organization" placeholder="例如：字节跳动" /></label>
          <label><span>岗位</span><input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="例如：产品经理" /></label>
          <label><span>岗位类型</span><select value={recruitmentType} onChange={(event) => setRecruitmentType(event.target.value as RecruitmentType | "")}><option value="">未识别 / 待选择</option>{RECRUITMENT_TYPES.map((value) => <option value={value} key={value}>{RECRUITMENT_TYPE_LABELS[value]}</option>)}</select></label>
          <label><span>城市</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="例如：上海" /></label>
          <label><span>当前阶段</span><select value={stage} onChange={(event) => { const nextStage = event.target.value as ApplicationStage; setStage(nextStage); if (nextStage !== "closed") setClosedReason(""); if (nextStage !== "interview") setInterviewRound(""); }}>{SELECTABLE_STAGES.map((value) => <option value={value} key={value}>{value === "closed" ? selectedStageLabel(value, closedReason || undefined) : value === "interview" ? selectedStageLabel(value, undefined, interviewRound || undefined) : STAGE_LABELS[value]}</option>)}</select>{item?.application.externalStage && <small className="dialog-note">网站进度：{item.application.externalStage}</small>}</label>
          {stage === "interview" && <label><span>面试轮次</span><select value={interviewRound} onChange={(event) => setInterviewRound(event.target.value as InterviewRound | "")}><option value="">选择面试轮次</option>{INTERVIEW_ROUNDS.map((round) => <option value={round} key={round}>{INTERVIEW_ROUND_LABELS[round]}</option>)}</select></label>}
          {stage === "closed" && <label><span>结束原因</span><select value={closedReason} onChange={(event) => setClosedReason(event.target.value as ClosedStageReason | "")}><option value="">选择结束原因</option>{CLOSED_STAGE_REASONS.map((reason) => <option value={reason} key={reason}>{CLOSED_STAGE_REASON_LABELS[reason]}</option>)}</select></label>}
          <label><span>投递时间</span><input type="datetime-local" value={appliedAt} onChange={(event) => setAppliedAt(event.target.value)} /></label>
          <label className="field-wide"><span>岗位 JD</span><textarea aria-describedby="application-jd-note" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="粘贴岗位职责、任职要求、加分项等完整 JD" /><small className="dialog-note dialog-note--wide" id="application-jd-note">插件同步的岗位 JD 会自动显示在这里，也可以手动补充或修改。</small></label>
          <label className="field-wide"><span>岗位来源链接</span><input type="url" inputMode="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://careers.example.com/job/123" /></label>
        </div>
        <div className="dialog-error" role={formError ? "alert" : undefined}>{formError}</div>
        <footer>{item ? <button className="danger-button" type="button" onClick={() => {
          if (!confirmingDelete) {
            setConfirmingDelete(true);
            return;
          }
          void remove();
        }} disabled={busy}>{busy ? "正在删除…" : confirmingDelete ? "确认删除？" : "删除投递"}</button> : <span />}<div><button className="secondary-button" type="button" onClick={requestClose}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存投递"}</button></div></footer>
      </form>
      </div>
    </div>
  );
}
