import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ApplicationSyncItem } from "@offerflow/contracts";
import {
  STAGES,
  STAGE_LABELS,
  type ApplicationStage,
  type JobApplication
} from "@offerflow/domain";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  Columns3,
  ListFilter,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Star,
  Table2,
  X
} from "lucide-react";
import { api } from "../app/api";

type ViewMode = "table" | "board";

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "manual";
  }
}

function dateLabel(value?: string): string {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
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
  if (stage === "interview" || stage === "assessment") return "active";
  return "default";
}

export function ApplicationsPage() {
  const [items, setItems] = useState<ApplicationSyncItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | ApplicationStage>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; item: ApplicationSyncItem }>();

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
      const matchQuery = !normalized || `${application.company} ${application.position} ${application.city || ""}`.toLowerCase().includes(normalized);
      return matchQuery && (stage === "all" || application.stage === stage);
    });
  }, [items, query, stage]);

  const saveItem = (item: ApplicationSyncItem) => {
    setItems((current) => {
      const exists = current.some((entry) => entry.application.id === item.application.id);
      return exists
        ? current.map((entry) => entry.application.id === item.application.id ? item : entry)
        : [item, ...current];
    });
    setDialog(undefined);
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
    if (item.application.stage === nextStage) return;
    const now = new Date().toISOString();
    void mutate(item, {
      ...item.application,
      stage: nextStage,
      updatedAt: now,
      events: [
        ...item.application.events,
        {
          id: crypto.randomUUID(),
          type: "stage_changed",
          title: `${STAGE_LABELS[item.application.stage]} → ${STAGE_LABELS[nextStage]}`,
          occurredAt: now
        }
      ]
    });
  };

  const activeCount = items.filter((item) => !["closed", "offer"].includes(item.application.stage)).length;
  const interviewCount = items.filter((item) => item.application.stage === "interview").length;
  const offerCount = items.filter((item) => item.application.stage === "offer").length;

  return (
    <section className="data-page applications-page">
      <header className="page-header application-heading">
        <div>
          <span className="page-kicker"><BriefcaseBusiness aria-hidden="true" size={14} />APPLICATION DESK</span>
          <h1 tabIndex={-1}>个人投递管理</h1>
          <p>把每一次投递变成清晰的下一步，而不是散落在标签页里的记忆。</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setDialog({ mode: "create" })}>
          <Plus aria-hidden="true" size={17} />添加投递
        </button>
      </header>

      <div className="application-metrics" aria-label="投递概览">
        <div><span>推进中</span><strong>{activeCount}</strong><small>持续跟进的流程</small></div>
        <div><span>面试阶段</span><strong>{interviewCount}</strong><small>需要准备与复盘</small></div>
        <div className="metric-featured"><span>收到 Offer</span><strong>{offerCount}</strong><small>阶段成果</small></div>
      </div>

      <div className="data-toolbar application-toolbar">
        <label className="search-control">
          <span className="sr-only">搜索投递记录</span>
          <Search aria-hidden="true" size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位或城市" />
        </label>
        <label className="select-control">
          <ListFilter aria-hidden="true" size={16} />
          <span className="sr-only">按投递阶段筛选</span>
          <select value={stage} onChange={(event) => setStage(event.target.value as typeof stage)}>
            <option value="all">全部阶段</option>
            {STAGES.map((value) => <option value={value} key={value}>{STAGE_LABELS[value]}</option>)}
          </select>
        </label>
        <div className="view-switch" aria-label="显示方式">
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 aria-hidden="true" size={16} />表格</button>
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}><Columns3 aria-hidden="true" size={16} />看板</button>
        </div>
      </div>

      <div className="page-announcer" role={error ? "alert" : "status"}>{error || status}</div>

      {loading ? (
        <div className="data-loading" role="status"><span className="loading-orbit" />正在同步投递记录…</div>
      ) : items.length === 0 ? (
        <div className="application-empty">
          <div className="empty-stack" aria-hidden="true"><i /><i /><span><BriefcaseBusiness size={27} /></span></div>
          <span className="page-kicker">YOUR FIRST APPLICATION</span>
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
            <thead><tr><th>公司与岗位</th><th>当前阶段</th><th>投递时间</th><th>地点</th><th>截止 / 下一步</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>
              {filtered.map((item) => {
                const application = item.application;
                return (
                  <tr key={application.id}>
                    <td><button className="application-title" type="button" onClick={() => setDialog({ mode: "edit", item })}><strong>{application.company}</strong><span>{application.position}</span></button></td>
                    <td><div className="stage-cell"><select className={`stage-select stage-select--${stageTone(application.stage)}`} aria-label={`更新 ${application.company} ${application.position} 的阶段`} value={application.stage} onChange={(event) => changeStage(item, event.target.value as ApplicationStage)}>{STAGES.map((value) => <option value={value} key={value}>{STAGE_LABELS[value]}</option>)}</select>{application.externalStage && <small className="external-stage">网站进度：{application.externalStage}</small>}</div></td>
                    <td><span className="cell-icon"><CalendarClock aria-hidden="true" size={14} />{appliedAtLabel(application.appliedAt)}</span></td>
                    <td><span className="cell-icon"><MapPin aria-hidden="true" size={14} />{application.city || "未填写"}</span></td>
                    <td><div className="next-action-cell"><span><CalendarClock aria-hidden="true" size={14} />{dateLabel(application.deadline)}</span><small>{application.nextAction || "补充下一步行动"}</small></div></td>
                    <td><div className="row-actions"><button type="button" aria-label={application.isFavorite ? "取消收藏" : "收藏投递"} onClick={() => void mutate(item, { ...application, isFavorite: !application.isFavorite, updatedAt: new Date().toISOString() })}><Star aria-hidden="true" size={17} fill={application.isFavorite ? "currentColor" : "none"} /></button>{application.sourceUrl && application.sourceHost !== "manual" && <a href={application.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${application.position} 来源页面`}><ArrowUpRight aria-hidden="true" size={17} /></a>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="application-board">
          {STAGES.map((stageKey) => {
            const stageItems = filtered.filter((item) => item.application.stage === stageKey);
            return (
              <section className="board-column" key={stageKey}>
                <header><span>{STAGE_LABELS[stageKey]}</span><strong>{stageItems.length}</strong></header>
                <div>
                  {stageItems.map((item) => (
                    <button className="board-card" type="button" key={item.application.id} onClick={() => setDialog({ mode: "edit", item })}>
                      <span>{item.application.company}</span><strong>{item.application.position}</strong><small><MapPin aria-hidden="true" size={12} />{item.application.city || "地点未填写"}</small>
                    </button>
                  ))}
                  {!stageItems.length && <span className="board-empty">暂无记录</span>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {dialog && (
        <ApplicationDialog
          item={dialog.mode === "edit" ? dialog.item : undefined}
          onClose={() => setDialog(undefined)}
          onSaved={saveItem}
          onDeleted={(id) => { setItems((current) => current.filter((item) => item.application.id !== id)); setDialog(undefined); setStatus("投递记录已删除"); }}
          onError={setError}
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
  const [stage, setStage] = useState<ApplicationStage>(item?.application.stage || "to_apply");
  const [deadline, setDeadline] = useState(item?.application.deadline?.slice(0, 10) || "");
  const [appliedAt, setAppliedAt] = useState(
    item?.application.appliedAt?.slice(0, 16).replace(" ", "T") || ""
  );
  const [nextAction, setNextAction] = useState(item?.application.nextAction || "");
  const [sourceUrl, setSourceUrl] = useState(item?.application.sourceHost === "manual" ? "" : item?.application.sourceUrl || "");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const companyRef = useRef<HTMLInputElement>(null);

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
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!company.trim() || !position.trim()) {
      setFormError("请填写公司和岗位名称");
      companyRef.current?.focus();
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const providedSourceUrl = sourceUrl.trim();
    const url = providedSourceUrl || "offerflow://manual";
    const application: JobApplication = item
      ? {
          ...item.application,
          company: company.trim(),
          position: position.trim(),
          city: city.trim() || undefined,
          stage,
          appliedAt: appliedAt ? appliedAt.replace("T", " ").slice(0, 16) : undefined,
          deadline: deadline || undefined,
          nextAction: nextAction.trim() || undefined,
          sourceUrl: url,
          sourceHost: providedSourceUrl ? sourceHost(url) : "manual",
          updatedAt: now,
          events: [
            ...item.application.events,
            { id: crypto.randomUUID(), type: "updated", title: "在 Web 端更新投递信息", occurredAt: now }
          ]
        }
      : {
          id: crypto.randomUUID(),
          company: company.trim(),
          position: position.trim(),
          city: city.trim() || undefined,
          stage,
          appliedAt: appliedAt ? appliedAt.replace("T", " ").slice(0, 16) : undefined,
          deadline: deadline || undefined,
          nextAction: nextAction.trim() || undefined,
          sourceUrl: url,
          sourceHost: providedSourceUrl ? sourceHost(url) : "manual",
          responsibilities: [],
          requirements: [],
          createdAt: now,
          updatedAt: now,
          events: [{ id: crypto.randomUUID(), type: "created", title: "创建投递记录", occurredAt: now }]
        };

    try {
      const result = item
        ? await api.applications.update(application.id, { application, expectedRevision: item.revision })
        : await api.applications.create({ application });
      onSaved(result.item);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "无法保存投递记录";
      setFormError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item || !window.confirm(`删除「${item.application.company} · ${item.application.position}」？此操作会同步到其他设备。`)) return;
    setBusy(true);
    try {
      await api.applications.remove(item.application.id, item.revision);
      onDeleted(item.application.id);
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
      className="application-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="application-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-dialog-title"
        tabIndex={-1}
      >
      <form onSubmit={submit} noValidate>
        <header><div><span className="page-kicker">{item ? "EDIT APPLICATION" : "NEW APPLICATION"}</span><h2 id="application-dialog-title">{item ? "更新投递信息" : "添加一条投递"}</h2></div><button type="button" aria-label="关闭" onClick={onClose}><X aria-hidden="true" size={19} /></button></header>
        <div className="dialog-fields">
          <label><span>公司</span><input ref={companyRef} value={company} onChange={(event) => setCompany(event.target.value)} autoComplete="organization" placeholder="例如：字节跳动" /></label>
          <label><span>岗位</span><input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="例如：产品经理" /></label>
          <label><span>城市</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="例如：上海" /></label>
          <label><span>当前阶段</span><select value={stage} onChange={(event) => setStage(event.target.value as ApplicationStage)}>{STAGES.map((value) => <option value={value} key={value}>{STAGE_LABELS[value]}</option>)}</select>{item?.application.externalStage && <small className="dialog-note">网站进度：{item.application.externalStage}</small>}</label>
          <label><span>投递时间</span><input type="datetime-local" value={appliedAt} onChange={(event) => setAppliedAt(event.target.value)} /></label>
          <label><span>截止时间</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
          <label><span>下一步行动</span><input value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="例如：周三前完成笔试" /></label>
          <label className="field-wide"><span>岗位来源链接</span><input type="url" inputMode="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://careers.example.com/job/123" /></label>
        </div>
        <div className="dialog-error" role={formError ? "alert" : undefined}>{formError}</div>
        <footer>{item ? <button className="danger-button" type="button" onClick={() => void remove()} disabled={busy}>删除投递</button> : <span />}<div><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存投递"}</button></div></footer>
      </form>
      </div>
    </div>
  );
}
