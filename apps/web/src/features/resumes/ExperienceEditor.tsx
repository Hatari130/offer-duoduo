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
  const title = item.organization || `经历 ${index + 1}`;
  const update = (key: keyof ProfileExperience, value: string | boolean) => onChange({ ...item, [key]: value });

  return <section className={`resume-experience-card ${isExpanded ? "is-expanded" : ""} ${error ? "has-error" : ""}`} aria-label={title}>
    <header className="resume-experience-card-header">
      <button className="resume-experience-disclosure" type="button" onClick={onToggle} aria-expanded={isExpanded} aria-controls={`${id}-body`}>
        <span><strong>{title}</strong><small>{[item.startDate, item.isCurrent ? "至今" : item.endDate].filter(Boolean).join(" — ") || "填写公司、职位与日期"}</small></span>
      </button>
      <div className="resume-experience-actions">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`上移${title}`} title="上移"><ArrowUp size={17} aria-hidden="true" /></button>
        <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`下移${title}`} title="下移"><ArrowDown size={17} aria-hidden="true" /></button>
        <button type="button" onClick={onDelete} aria-label={`删除${title}`} title="删除"><Trash2 size={16} aria-hidden="true" /></button>
        <button type="button" onClick={onToggle} aria-label={isExpanded ? `收起${title}` : `展开${title}`} aria-expanded={isExpanded} aria-controls={`${id}-body`} title={isExpanded ? "收起" : "展开"}>{isExpanded ? <ChevronUp size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}</button>
      </div>
    </header>
    {isExpanded && <div id={`${id}-body`} className="resume-experience-form">
      <label className="resume-experience-field" htmlFor={`${id}-company`}><span>公司</span><input id={`${id}-company`} value={item.organization} onChange={event => update("organization", event.target.value)} placeholder="公司或组织名称" /></label>
      <label className="resume-experience-field" htmlFor={`${id}-position`}><span>职位</span><input id={`${id}-position`} value={item.title} onChange={event => update("title", event.target.value)} placeholder="职位名称" /></label>
      <fieldset className="resume-experience-dates">
        <legend>日期</legend>
        <div className="resume-experience-date-row">
          <label><span className="sr-only">开始日期</span><input type={monthInputValue(item.startDate) || !item.startDate ? "month" : "text"} value={monthInputValue(item.startDate) || item.startDate} onChange={event => update("startDate", event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-date-error` : undefined} /></label>
          <span aria-hidden="true">—</span>
          <label><span className="sr-only">结束日期</span><input type={item.isCurrent || monthInputValue(item.endDate) || !item.endDate ? "month" : "text"} disabled={item.isCurrent} value={item.isCurrent ? "" : monthInputValue(item.endDate) || item.endDate} onChange={event => update("endDate", event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-date-error` : undefined} /></label>
        </div>
        {error && <p id={`${id}-date-error`} className="resume-experience-error">{error}</p>}
        <div className="resume-experience-date-options">
          <label><input type="checkbox" checked={Boolean(item.isCurrent)} onChange={event => onChange({ ...item, isCurrent: event.target.checked, endDate: !event.target.checked && item.endDate === "至今" ? "" : item.endDate })} /><span>至今</span></label>
        </div>
      </fieldset>
      <Suspense fallback={<p role="status">正在载入描述编辑器…</p>}><DescriptionEditor blocks={item.contentBlocks} onChange={contentBlocks => onChange({ ...item, contentBlocks, description: serializeResumeContentBlocks(contentBlocks) })} /></Suspense>
      <details className="resume-experience-extra">
        <summary>部门（可选）{item.department ? ` · ${item.department}` : ""}</summary>
        <label className="resume-experience-field" htmlFor={`${id}-department`}><span>部门</span><input id={`${id}-department`} value={item.department || ""} onChange={event => update("department", event.target.value)} /></label>
      </details>
    </div>}
  </section>;
}
