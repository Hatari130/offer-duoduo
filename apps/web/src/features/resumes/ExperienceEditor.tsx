import { lazy, Suspense, useId } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { serializeResumeContentBlocks, type ProfileExperience } from "@offerflow/domain";
import { experienceDateError, monthInputValue } from "./descriptionDocument";

const DescriptionEditor = lazy(() => import("./DescriptionEditor"));

export default function ExperienceEditor({ item, index, count, isExpanded, onToggle, onChange, onDelete, onMove }: {
  item: ProfileExperience;
  index: number;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (item: ProfileExperience) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const id = useId();
  const error = experienceDateError(item.startDate, item.endDate, item.isCurrent);
  const name = item.organization || `经历 ${index + 1}`;
  const dateRange = [item.startDate, item.isCurrent ? "至今" : item.endDate].filter(Boolean).join(" - ");
  const update = (key: keyof ProfileExperience, value: string | boolean) => onChange({ ...item, [key]: value });

  return (
    <section className={`resume-entry-card resume-experience-card ${isExpanded ? "is-expanded" : "is-collapsed"} ${error ? "has-error" : ""}`} aria-label={name}>
      <header className="resume-entry-summary-bar resume-experience-summary-bar">
        <button className="resume-experience-summary-main" type="button" onClick={onToggle} aria-expanded={isExpanded} aria-controls={`${id}-body`}>
          <span className="resume-entry-title-row">
            <span className="resume-entry-index-num">{String(index + 1).padStart(2, "0")}</span>
            <strong className="resume-entry-summary-title">{name}</strong>
            {item.title && <span className="resume-entry-badge badge-subtle">{item.title}</span>}
            {isExpanded && <span className="resume-entry-editing-tag">编辑中</span>}
          </span>
          {(item.department || dateRange) && <span className="resume-entry-summary-sub">
            {item.department && <span className="resume-entry-sub-text">{item.department}</span>}
            {item.department && dateRange && <span className="resume-entry-dot-sep">·</span>}
            {dateRange && <span className="resume-entry-date-text">{dateRange}</span>}
          </span>}
        </button>

        <div className="resume-entry-summary-actions">
          <button type="button" className="resume-experience-move-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`上移${name}`} title="上移"><ArrowUp size={16} aria-hidden="true" /></button>
          <button type="button" className="resume-experience-move-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`下移${name}`} title="下移"><ArrowDown size={16} aria-hidden="true" /></button>
          <button type="button" className="resume-entry-toggle-btn" onClick={onToggle} aria-label={isExpanded ? `收起${name}` : `展开${name}`} aria-expanded={isExpanded} aria-controls={`${id}-body`}>
            {isExpanded ? <><ChevronUp size={14} aria-hidden="true" /><span>收起</span></> : <><ChevronDown size={14} aria-hidden="true" /><span>编辑</span></>}
          </button>
          <button type="button" className="resume-entry-delete-btn" onClick={onDelete} aria-label={`删除${name}`} title="删除"><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </header>

      {isExpanded && <div id={`${id}-body`} className="resume-entry-body">
        <div className="resume-doc-card-body resume-experience-doc-body">
          <div className="resume-doc-row resume-doc-row--header">
            <input className="resume-doc-title-input" value={item.organization} onChange={event => update("organization", event.target.value)} placeholder="公司或组织名称" aria-label="公司" />
            <div className="resume-doc-type-pill">
              <input className="resume-doc-degree-input resume-experience-role-input" value={item.title} onChange={event => update("title", event.target.value)} placeholder="职位" aria-label="职位" />
            </div>
          </div>

          <div className="resume-doc-meta-bar resume-experience-meta-bar">
            <div className="resume-doc-meta-item resume-experience-department">
              <span className="resume-doc-meta-label">部门</span>
              <input className="resume-doc-inline-input" value={item.department || ""} onChange={event => update("department", event.target.value)} placeholder="选填" aria-label="部门（可选）" />
            </div>
            <span className="resume-doc-sep" aria-hidden="true">|</span>
            <div className="resume-doc-meta-item resume-doc-meta-dates">
              <label><span className="sr-only">开始日期</span><input className="resume-doc-date-input resume-experience-date-input" type={monthInputValue(item.startDate) || !item.startDate ? "month" : "text"} value={monthInputValue(item.startDate) || item.startDate} onChange={event => update("startDate", event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-date-error` : undefined} /></label>
              <span className="resume-doc-dash" aria-hidden="true">-</span>
              <label><span className="sr-only">结束日期</span><input className="resume-doc-date-input resume-experience-date-input" type={item.isCurrent || monthInputValue(item.endDate) || !item.endDate ? "month" : "text"} disabled={item.isCurrent} value={item.isCurrent ? "" : monthInputValue(item.endDate) || item.endDate} onChange={event => update("endDate", event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-date-error` : undefined} /></label>
            </div>
            <label className="resume-doc-current-toggle"><input type="checkbox" checked={Boolean(item.isCurrent)} onChange={event => onChange({ ...item, isCurrent: event.target.checked, endDate: !event.target.checked && item.endDate === "至今" ? "" : item.endDate })} /><span>至今</span></label>
          </div>
          {error && <p id={`${id}-date-error`} className="resume-experience-error">{error}</p>}

          <Suspense fallback={<p role="status">正在载入描述编辑器…</p>}><DescriptionEditor blocks={item.contentBlocks} onChange={contentBlocks => onChange({ ...item, contentBlocks, description: serializeResumeContentBlocks(contentBlocks) })} /></Suspense>
        </div>
      </div>}
    </section>
  );
}
