import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MonitorUp,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Star,
  KeyRound,
  Target,
  Trash2,
  X
} from "lucide-react";
import {
  DEFAULT_DEEPSEEK_MODEL,
  extractWithDeepSeek,
  testDeepSeekConnection
} from "@/integrations/deepseek/deepseek";
import {
  chooseObsidianDirectory,
  downloadBackup,
  getStoredDirectory,
  syncJobToObsidian
} from "@/integrations/obsidian/obsidian";
import {
  AUTO_SYNC_NOTICE_KEY,
  EMPTY_PROFILE,
  findDuplicate,
  JOBS_KEY,
  loadJobs,
  loadProfile,
  loadSettings,
  PROFILE_KEY,
  saveJobs,
  saveProfile,
  saveSettings
} from "@/infrastructure/storage/storage";
import {
  DEFAULT_OPPORTUNITY_FEED_URL,
  loadOpportunityCache,
  OPPORTUNITY_CACHE_KEY,
  refreshOpportunityFeed
} from "@/features/opportunities/opportunities";
import {
  RECRUITMENT_TYPES,
  RECRUITMENT_TYPE_LABELS,
  STAGES,
  STAGE_LABELS,
  type ApplicationStage,
  type ExtractedJob,
  type JobApplication,
  type RecruitmentType,
  type OfferFlowSettings,
  type OpportunityFeedSnapshot,
  type PersonalProfile,
  type RecruitmentOpportunity
} from "@/shared/types";
import ProfileView from "@/features/profile/ProfileView";
import OpportunityView from "@/features/opportunities/OpportunityView";
import { dueState, formatDeadline } from "./workspaceUtils";

export function JobCard({
  job,
  onStageChange,
  onEdit
}: {
  job: JobApplication;
  onStageChange: (job: JobApplication, stage: ApplicationStage) => void;
  onEdit: (job: JobApplication) => void;
}) {
  const due = dueState(job.deadline);
  return (
    <article className="job-card" onClick={() => onEdit(job)}>
      <div className="card-topline">
        <span className="company-mark">{job.company.slice(0, 1)}</span>
        <span className={`deadline deadline--${due}`}>
          <CalendarClock size={12} />
          {formatDeadline(job.deadline)}
        </span>
      </div>
      <h3>{job.position}</h3>
      <p className="company-line">
        {job.company}
        {job.city ? ` · ${job.city}` : ""}
      </p>
      <div className="next-action">
        <span>下一步</span>
        <strong>{job.nextAction || "待确定"}</strong>
      </div>
      <div className="card-footer">
        <select
          value={job.stage}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            onStageChange(job, event.target.value as ApplicationStage);
          }}
          aria-label="修改投递阶段"
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABELS[stage]}
            </option>
          ))}
        </select>
        {job.obsidianPath ? (
          <span className="sync-state" title="已同步到 Obsidian">
            <Check size={13} /> MD
          </span>
        ) : (
          <span className="sync-state sync-state--muted">未同步</span>
        )}
      </div>
    </article>
  );
}

export function CaptureForm({
  value,
  duplicate,
  onChange,
  onCancel,
  onSave
}: {
  value: ExtractedJob;
  duplicate?: JobApplication;
  onChange: (value: ExtractedJob) => void;
  onCancel: () => void;
  onSave: (mode: "create" | "update") => void;
}) {
  const update = <K extends keyof ExtractedJob>(key: K, next: ExtractedJob[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <section className="capture-view">
      <div className="capture-hero">
        <div className="eyebrow">
          <Sparkles size={14} /> 页面识别完成
        </div>
        <h1>
          {value.company}
          <span>｜</span>
          {value.position}
        </h1>
        <p>
          已从 {value.sourceHost} 提取 · 置信度{" "}
          {Math.round(value.confidence * 100)}%
        </p>
      </div>

      {duplicate && (
        <div className="duplicate-alert">
          <AlertTriangle size={18} />
          <div>
            <strong>发现可能重复的岗位</strong>
            <span>
              {duplicate.company} · {duplicate.position}，当前阶段为
              {STAGE_LABELS[duplicate.stage]}
            </span>
          </div>
        </div>
      )}

      <div className="form-grid">
        <label>
          <span>公司</span>
          <input value={value.company} onChange={(e) => update("company", e.target.value)} />
        </label>
        <label>
          <span>岗位</span>
          <input value={value.position} onChange={(e) => update("position", e.target.value)} />
        </label>
        <label>
          <span>岗位类型</span>
          <select
            value={value.recruitmentType || ""}
            onChange={(event) => update(
              "recruitmentType",
              (event.target.value || undefined) as RecruitmentType | undefined
            )}
          >
            <option value="">未识别 / 待选择</option>
            {RECRUITMENT_TYPES.map((type) => (
              <option key={type} value={type}>{RECRUITMENT_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>城市</span>
          <input
            value={value.city || ""}
            placeholder="未识别"
            onChange={(e) => update("city", e.target.value)}
          />
        </label>
        <label>
          <span>岗位编号</span>
          <input
            value={value.jobId || ""}
            placeholder="未识别"
            onChange={(e) => update("jobId", e.target.value)}
          />
        </label>
        <label>
          <span>截止时间</span>
          <input
            type="date"
            value={value.deadline?.slice(0, 10) || ""}
            onChange={(e) => update("deadline", e.target.value)}
          />
        </label>
        <label>
          <span>投递时间</span>
          <input
            type="date"
            value={value.appliedAt?.slice(0, 10) || ""}
            onChange={(e) => update("appliedAt", e.target.value)}
          />
        </label>
        <label>
          <span>下一步行动</span>
          <input
            value={value.nextAction || ""}
            onChange={(e) => update("nextAction", e.target.value)}
          />
        </label>
      </div>

      <label className="summary-field">
        <span>岗位摘要</span>
        <textarea
          value={value.summary || ""}
          rows={5}
          onChange={(e) => update("summary", e.target.value)}
        />
      </label>

      <div className="capture-actions">
        <button className="button button--ghost" onClick={onCancel}>
          <X size={16} /> 取消
        </button>
        {duplicate && (
          <button className="button button--secondary" onClick={() => onSave("update")}>
            <RefreshCw size={16} /> 更新已有岗位
          </button>
        )}
        <button className="button button--primary" onClick={() => onSave("create")}>
          <Plus size={16} /> {duplicate ? "仍然新建" : "加入 OfferDuoDuo"}
        </button>
      </div>
    </section>
  );
}

export function CandidatePicker({
  candidates,
  jobs,
  onCancel,
  onImport
}: {
  candidates: ExtractedJob[];
  jobs: JobApplication[];
  onCancel: () => void;
  onImport: (candidates: ExtractedJob[]) => void;
}) {
  const [selected, setSelected] = useState(() => new Set(candidates.map((_, index) => index)));

  const toggle = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <section className="capture-view">
      <div className="capture-hero candidate-hero">
        <div className="eyebrow">
          <Sparkles size={14} /> DeepSeek 多岗位识别
        </div>
        <h1>
          检测到 {candidates.length} 条<span>投递记录</span>
        </h1>
        <p>选择需要创建或更新的岗位，重复记录会自动合并。</p>
      </div>

      <div className="candidate-list">
        {candidates.map((candidate, index) => {
          const duplicate = findDuplicate(jobs, {
            company: candidate.company,
            position: candidate.position,
            jobId: candidate.jobId,
            city: candidate.city,
            sourceUrl: candidate.sourceUrl
          });
          return (
            <label
              className={`candidate-row ${selected.has(index) ? "selected" : ""}`}
              key={`${candidate.jobId || candidate.position}-${index}`}
            >
              <input
                type="checkbox"
                checked={selected.has(index)}
                onChange={() => toggle(index)}
              />
              <span className="candidate-check">
                {selected.has(index) && <Check size={14} />}
              </span>
              <span className="candidate-main">
                <strong>{candidate.position}</strong>
                <small>
                  {candidate.company}
                  {candidate.city ? ` · ${candidate.city}` : ""}
                  {candidate.jobId ? ` · ${candidate.jobId}` : ""}
                </small>
              </span>
              <span className={`candidate-mode ${duplicate ? "update" : ""}`}>
                {duplicate ? "更新" : "新建"}
              </span>
            </label>
          );
        })}
      </div>

      <div className="capture-actions">
        <button className="button button--ghost" onClick={onCancel}>
          <X size={16} /> 取消
        </button>
        <button
          className="button button--primary"
          disabled={!selected.size}
          onClick={() =>
            onImport(candidates.filter((_, index) => selected.has(index)))
          }
        >
          <Plus size={16} /> 导入选中的 {selected.size} 条
        </button>
      </div>
    </section>
  );
}

export function EditDrawer({
  job,
  onClose,
  onSave,
  onSync,
  onDelete
}: {
  job: JobApplication;
  onClose: () => void;
  onSave: (job: JobApplication) => void;
  onSync: (job: JobApplication) => void;
  onDelete: (job: JobApplication) => void;
}) {
  const [draft, setDraft] = useState(job);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = <K extends keyof JobApplication>(key: K, value: JobApplication[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span className="eyebrow">岗位维护</span>
            <h2>{draft.position}</h2>
            <p>{draft.company}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </div>

        <div className="drawer-body">
          <label>
            <span>岗位类型</span>
            <select
              value={draft.recruitmentType || ""}
              onChange={(event) => set(
                "recruitmentType",
                (event.target.value || undefined) as RecruitmentType | undefined
              )}
            >
              <option value="">未识别 / 待选择</option>
              {RECRUITMENT_TYPES.map((type) => (
                <option key={type} value={type}>{RECRUITMENT_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>当前阶段</span>
            <select
              value={draft.stage}
              onChange={(event) =>
                set("stage", event.target.value as ApplicationStage)
              }
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>下一步行动</span>
            <input
              value={draft.nextAction || ""}
              onChange={(event) => set("nextAction", event.target.value)}
            />
          </label>
          <label>
            <span>投递时间</span>
            <input
              type="datetime-local"
              value={draft.appliedAt?.slice(0, 16) || ""}
              onChange={(event) => set("appliedAt", event.target.value)}
            />
          </label>
          <label>
            <span>截止时间</span>
            <input
              type="datetime-local"
              value={draft.deadline?.slice(0, 16) || ""}
              onChange={(event) => set("deadline", event.target.value)}
            />
          </label>
          <label>
            <span>岗位摘要</span>
            <textarea
              rows={5}
              value={draft.summary || ""}
              onChange={(event) => set("summary", event.target.value)}
            />
          </label>

          <div className="timeline">
            <div className="section-heading">
              <span>时间线</span>
              <small>{draft.events.length} 条事件</small>
            </div>
            {[...draft.events].reverse().map((event) => (
              <div className="timeline-item" key={event.id}>
                <CircleDot size={14} />
                <div>
                  <strong>{event.title}</strong>
                  <span>{new Date(event.occurredAt).toLocaleString("zh-CN")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {confirmingDelete && (
          <div className="drawer-delete-confirm" role="alertdialog" aria-labelledby="delete-job-title">
            <div>
              <strong id="delete-job-title">确定删除这个岗位？</strong>
              <span>岗位信息和时间线将一并移除，此操作无法撤销。</span>
            </div>
            <button className="button button--ghost" onClick={() => setConfirmingDelete(false)}>
              取消
            </button>
            <button className="button button--danger-solid" onClick={() => onDelete(draft)}>
              确认删除
            </button>
          </div>
        )}

        <div className="drawer-footer">
          <button
            className="button button--danger"
            onClick={() => setConfirmingDelete(true)}
            aria-expanded={confirmingDelete}
          >
            <Trash2 size={16} /> 删除
          </button>
          <button className="button button--secondary" onClick={() => onSync(draft)}>
            <FileText size={16} /> 同步 Markdown
          </button>
          <button className="button button--primary" onClick={() => onSave(draft)}>
            <Check size={16} /> 保存修改
          </button>
        </div>
      </aside>
    </div>
  );
}
