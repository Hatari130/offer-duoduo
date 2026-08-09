// TailorApp — JD × Resume 对靶审阅
//
// Three states drive the UI:
//
//   1. `pending-empty`     — no job context yet. Render the intake shell with
//      hero copy, three intake tabs (capture guidance / pick existing job /
//      manual entry), a profile completeness card, and a compact archive.
//
//   2. `jd-ready`         — context captured, awaiting the first tailored
//      resume. Render the review grid: left panel shows the captured JD
//      as ready-to-review cards; right panel shows a clear "waiting to
//      generate" CTA with the same primary/secondary actions promoted.
//
//   3. `jd-bundled`       — JD cross-mapped against a generated resume.
//      Same grid, but the right panel hosts the editable iframe and the
//      archive strip stays pinned at the bottom of the page.
//
// The state machine keeps `pending`/`bundle` derived properties so the
// review grid only re-renders when the actual inputs change.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  KeyRound,
  ListChecks,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X
} from "lucide-react";
import {
  dropTailoredPdf,
  dropTailoredResume,
  EMPTY_PROFILE,
  getTailoredResume,
  loadJobs,
  loadActiveResumeId,
  loadProfile,
  loadResumeLibrary,
  loadSettings,
  loadTailoredPdf,
  loadTailoredResumes,
  saveTailoredPdf,
  saveTailoredResume,
  SETTINGS_KEY,
  type StoredResume,
  type TailoredPdfSnapshot
} from "@/infrastructure/storage/storage";
import { extractResumePdfLayout, type ResumePdfLayout } from "@/features/profile/resumeParser";
import { buildResumeHtml } from "@/features/tailor/buildResumeHtml";
import { buildSourcePdfReferenceHtml } from "@/features/tailor/buildSourcePdfReferenceHtml";
import {
  buildLocalFallback,
  ensureJobKey,
  tailorResumeWithDeepSeek
} from "@/features/tailor/tailor";
import {
  normalizeTailorContext,
  type TailoredResumeBundle,
  type TailorContext
} from "@/features/tailor/types";
import type {
  JobApplication,
  OfferFlowSettings,
  PersonalProfile
} from "@/shared/types";

type PendingSnapshot = TailorContext;

interface UrlPayload {
  jobKey: string;
  context: PendingSnapshot;
}

const PARAM_CONTEXT = "context";
const PARAM_AUTO = "auto";

type GenerationStage = "idle" | "reading" | "matching" | "rewriting" | "checking" | "ready" | "error";

const GENERATION_STAGES: Array<{ id: Exclude<GenerationStage, "idle" | "ready" | "error">; label: string; detail: string }> = [
  { id: "reading", label: "读取职位描述", detail: "正在整理岗位职责和任职要求" },
  { id: "matching", label: "匹配你的经历", detail: "正在寻找可以支撑 JD 的真实经历" },
  { id: "rewriting", label: "改写简历重点", detail: "只调整表达，不修改事实信息" },
  { id: "checking", label: "检查定制结果", detail: "正在检查映射关系和内容完整性" }
];

interface IntakeTab {
  id: "capture" | "existing" | "manual";
  label: string;
  hint: string;
}

const INTAKE_TABS: IntakeTab[] = [
  { id: "capture", label: "从招聘页一键抓取", hint: "推荐 · 准确率最高" },
  { id: "existing", label: "从已有岗位选择", hint: "复用已保存的 JD" },
  { id: "manual", label: "手动填写 JD", hint: "粘贴或敲字即用" }
];

export default function TailorApp() {
  const [profile, setProfile] = useState<PersonalProfile>({ ...EMPTY_PROFILE });
  const [settings, setSettings] = useState<OfferFlowSettings>({});
  const [bundle, setBundle] = useState<TailoredResumeBundle | undefined>();
  const [allEntries, setAllEntries] = useState<Record<string, { savedAt: string; notes: string[] }>>({});
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [pending, setPending] = useState<PendingSnapshot | undefined>();
  const [busy, setBusy] = useState(false);
  const [generationStage, setGenerationStage] = useState<GenerationStage>("idle");
  const [autoGenerateMode, setAutoGenerateMode] = useState<"deepseek" | "local">();
  const [pdfSnapshot, setPdfSnapshot] = useState<TailoredPdfSnapshot | undefined>();
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [intakeTab, setIntakeTab] = useState<IntakeTab["id"]>("capture");
  const [manualDraft, setManualDraft] = useState<ManualDraft>(() => emptyManualDraft());
  const [pickedJobId, setPickedJobId] = useState<string>("");
  const [profileStatusOpen, setProfileStatusOpen] = useState(false);
  const [sourceResume, setSourceResume] = useState<StoredResume | undefined>();
  const [sourceLayout, setSourceLayout] = useState<ResumePdfLayout | undefined>();
  const [sourceLayoutState, setSourceLayoutState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [sourceLayoutError, setSourceLayoutError] = useState("");

  useEffect(() => {
    (async () => {
      const [storedProfile, storedSettings, storedJobs, storedEntries, resumeLibrary, activeResumeId] = await Promise.all([
        loadProfile(),
        loadSettings(),
        loadJobs(),
        loadTailoredResumes(),
        loadResumeLibrary(),
        loadActiveResumeId()
      ]);
      const activeResume = resumeLibrary.find((resume) => resume.id === activeResumeId) || resumeLibrary[0];
      setProfile(activeResume?.profile || storedProfile);
      setSettings(storedSettings);
      setJobs(storedJobs);
      setAllEntries(
        Object.fromEntries(
          Object.entries(storedEntries).map(([key, entry]) => [
            key,
            { savedAt: entry.savedAt, notes: entry.notes }
          ])
        )
      );
      const params = new URLSearchParams(location.search);
      const encoded = params.get(PARAM_CONTEXT);
      const shouldAutoGenerate = params.get(PARAM_AUTO) === "1";
      const initialPayload = encoded ? decodeContext(encoded) : undefined;
      if (initialPayload) {
        const inner = initialPayload.context;
        const jobKey = inner.jobKey || ensureJobKey(inner);
        const sourceResumeId = inner.sourceResumeId || activeResume?.id;
        const context: PendingSnapshot = normalizeTailorContext({ ...inner, jobKey, sourceResumeId });
        setPending(context);
        setSourceResume(resumeLibrary.find((resume) => resume.id === sourceResumeId));
        const stored = await getTailoredResume(jobKey);
        if (stored) {
          setBundle(stored);
          setStatus(`已载入历史定制（${formatRelative(stored.generatedAt)}）`);
        } else if (shouldAutoGenerate) {
          setAutoGenerateMode(storedSettings.deepseekApiKey?.trim() ? "deepseek" : "local");
        }
        const pdf = await loadTailoredPdf(jobKey);
        setPdfSnapshot(pdf);
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    const handleSettingsChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") return;
      const nextSettings = changes[SETTINGS_KEY]?.newValue as OfferFlowSettings | undefined;
      if (nextSettings) {
        setSettings(nextSettings);
        if (nextSettings.deepseekApiKey?.trim()) {
          setError("");
          setStatus("DeepSeek 已配置，可以开始改写简历");
        }
      }
    };
    chrome.storage.onChanged.addListener(handleSettingsChange);
    return () => chrome.storage.onChanged.removeListener(handleSettingsChange);
  }, []);

  useEffect(() => {
    const sourcePdf = sourceResume?.sourcePdf;
    if (!sourcePdf) {
      setSourceLayout(undefined);
      setSourceLayoutState("idle");
      setSourceLayoutError("");
      return;
    }
    let cancelled = false;
    setSourceLayoutState("loading");
    setSourceLayoutError("");
    void extractResumePdfLayout(base64ToUint8Array(sourcePdf.base64).buffer)
      .then((layout) => {
        if (cancelled) return;
        if (!layout.pages.length || layout.pages.some((page) => !page.imageDataUrl)) {
          throw new Error("原 PDF 页面渲染不完整，无法生成版式预览");
        }
        setSourceLayout(layout);
        setSourceLayoutState("ready");
      })
      .catch((caught) => {
        if (cancelled) return;
        setSourceLayout(undefined);
        setSourceLayoutState("error");
        const message = caught instanceof Error ? caught.message : "未知 PDF 读取错误";
        setSourceLayoutError(message);
        console.error("[OfferFlow] 原 PDF 版式读取失败", caught);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceResume?.id, sourceResume?.sourcePdf?.base64]);

  const storedJobs = useMemo(() => Object.entries(allEntries), [allEntries]);
  const previewHtml = useMemo(() => {
    if (!bundle) return "";
    const sourcePage = sourceLayout?.pages[0];
    return buildResumeHtml({
      resume: bundle.resume,
      jd: bundle.jd,
      showJdSidebar: false,
      variant: "source-aligned",
      sourceProfile: sourceResume?.profile,
      accentColor: "#202421",
      pageSize: sourcePage && sourcePage.widthPt / sourcePage.heightPt > 0.74 ? "letter" : "a4"
    });
  }, [bundle, sourceLayout, sourceResume?.profile]);
  const sourcePreviewHtml = useMemo(
    () => sourceLayout ? buildSourcePdfReferenceHtml(sourceLayout) : "",
    [sourceLayout]
  );

  const phase: "pending-empty" | "jd-ready" | "jd-bundled" = !pending
    ? "pending-empty"
    : bundle
      ? "jd-bundled"
      : "jd-ready";

  const generate = async (mode: "deepseek" | "local") => {
    if (!pending) return;
    setBusy(true);
    setError("");
    setGenerationStage("reading");
    const stageTimers = [
      window.setTimeout(() => setGenerationStage("matching"), 650),
      window.setTimeout(() => setGenerationStage("rewriting"), 1400)
    ];
    try {
      const [resumeLibrary, activeResumeId] = await Promise.all([
        loadResumeLibrary(),
        loadActiveResumeId()
      ]);
      const requestedSource = pending.sourceResumeId
        ? resumeLibrary.find((resume) => resume.id === pending.sourceResumeId)
        : undefined;
      if (pending.sourceResumeId && !requestedSource) {
        throw new Error("这份定制记录绑定的原 PDF 已不存在，请从简历库重新选择母版");
      }
      const currentSource = requestedSource
        || resumeLibrary.find((resume) => resume.id === activeResumeId)
        || resumeLibrary[0];
      if (!currentSource?.sourcePdf) {
        throw new Error("当前简历没有原始 PDF 母版，请返回简历库重新导入 PDF 后再生成");
      }
      setSourceResume(currentSource);
      const generationContext = pending.sourceResumeId === currentSource.id
        ? pending
        : { ...pending, sourceResumeId: currentSource.id };
      if (generationContext !== pending) setPending(generationContext);
      let next: TailoredResumeBundle;
      if (mode === "deepseek") {
        if (!settings.deepseekApiKey) {
          throw new Error("未配置 DeepSeek API Key，请先在设置中填写");
        }
        next = await tailorResumeWithDeepSeek(currentSource.profile, generationContext, settings);
      } else {
        next = buildLocalFallback(currentSource.profile, generationContext);
      }
      setGenerationStage("checking");
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      setBundle(next);
      await saveTailoredResume({
        jobKey: next.context.jobKey,
        bundle: next,
        savedAt: new Date().toISOString(),
        notes: next.notes
      });
      setAllEntries((previous) => ({
        ...previous,
        [next.context.jobKey]: { savedAt: new Date().toISOString(), notes: next.notes }
      }));
      setGenerationStage("ready");
      setStatus(mode === "deepseek" ? "DeepSeek 已生成定制简历" : "本地已生成定制简历");
    } catch (caught) {
      setGenerationStage("error");
      setError(caught instanceof Error ? caught.message : "生成失败");
    } finally {
      stageTimers.forEach((timer) => window.clearTimeout(timer));
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!autoGenerateMode || !pending || bundle || busy) return;
    const mode = autoGenerateMode;
    setAutoGenerateMode(undefined);
    void generate(mode);
  }, [autoGenerateMode, pending, bundle, busy, settings.deepseekApiKey]);

  const downloadHtml = () => {
    if (!previewHtml) return;
    const filename = `${bundle?.context.company || "简历"}-${bundle?.context.position || "tailored"}`
      .replace(/[\\/:*?"<>|]/g, "-");
    const url = URL.createObjectURL(new Blob([previewHtml], { type: "text/html;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `${filename}.html` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openInNewTab = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const deleteEntry = async (jobKey: string) => {
    if (!confirm("删除这条定制记录？已保存的 PDF 也会一并删除。")) return;
    await dropTailoredResume(jobKey);
    await dropTailoredPdf(jobKey);
    setAllEntries((previous) => {
      const next = { ...previous };
      delete next[jobKey];
      return next;
    });
    if (bundle?.context.jobKey === jobKey) {
      setBundle(undefined);
      setPending(undefined);
      setPdfSnapshot(undefined);
      setGenerationStage("idle");
    }
    setStatus("已删除定制记录");
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!pending) {
      setError("请先选择要投递的岗位，再上传 PDF 简历。");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("仅支持 PDF 格式");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("PDF 不能超过 8MB（chrome.storage.local 单条建议 < 8MB）");
      return;
    }
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const snapshot: TailoredPdfSnapshot = {
        jobKey: pending.jobKey,
        fileName: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        base64
      };
      await saveTailoredPdf(pending.jobKey, snapshot);
      setPdfSnapshot(snapshot);
      setStatus(`已保存 PDF · ${file.name}（${formatSize(file.size)}）`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const downloadStoredPdf = () => {
    if (!pdfSnapshot) return;
    const bytes = base64ToUint8Array(pdfSnapshot.base64);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: pdfSnapshot.fileName });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const startFromExistingJob = (job: JobApplication) => {
    const context: PendingSnapshot = jobToTailorContext(job);
    const next = { ...context, jobKey: ensureJobKey(context) };
    setBundle(undefined);
    setPending(next);
    setGenerationStage("idle");
    setError("");
    setStatus(`已载入岗位：${next.company} · ${next.position}`);
  };

  const startFromManualDraft = () => {
    if (!manualDraft.position.trim()) {
      setError("请先填写岗位名称");
      return;
    }
    const company = manualDraft.company.trim() || "手动填写";
    const context: PendingSnapshot = {
      jobKey: "",
      company,
      position: manualDraft.position.trim(),
      city: manualDraft.city.trim() || undefined,
      summary: manualDraft.summary.trim() || undefined,
      responsibilities: splitLines(manualDraft.responsibilities),
      requirements: splitLines(manualDraft.requirements),
      sourceUrl: ""
    };
    const next = { ...context, jobKey: ensureJobKey(context) };
    setBundle(undefined);
    setPending(next);
    setGenerationStage("idle");
    setError("");
    setStatus(`已填入岗位：${next.company} · ${next.position}`);
  };

  const openCaptureTab = () => {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      setError("当前环境无法打开招聘页签");
      return;
    }
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (tab?.id && tab.url?.startsWith("http")) {
          setStatus("打开 OfferFlow 浮窗 → 点「为这个岗位定制简历」");
        } else {
          setError("请先打开一个招聘网页，再从这里开始定制");
        }
      })
      .catch(() => undefined);
  };

  const openDashboard = () => {
    const url =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("dashboard.html")
        : new URL("dashboard.html", window.location.href).href;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openSettings = () => {
    const url =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("dashboard.html?view=settings")
        : new URL("dashboard.html?view=settings", window.location.href).href;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url }).catch(() => {
        window.open(url, "_blank", "noopener,noreferrer");
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openResumeManager = () => {
    const url =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("resume.html")
        : new URL("resume.html", window.location.href).href;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const hasApiKey = Boolean(settings.deepseekApiKey?.trim());

  return (
    <div className="review-shell">
      <Toolbar
        phase={phase}
        pending={pending}
        bundle={bundle}
        busy={busy}
        generationStage={generationStage}
        hasApiKey={hasApiKey}
        onGenerate={generate}
        onOpenSettings={openSettings}
        onOpenInNewTab={openInNewTab}
        onDownloadHtml={downloadHtml}
        onClose={() => window.close()}
      />
      {(error || status) && (
        <div className="review-shell" style={{ padding: "10px 18px 0" }}>
          <div className={`review-status ${error ? "review-status-error" : "review-status-ok"}`}
               style={{ flex: "none" }}>
            {error ? (
              <>
                <AlertTriangle size={12} /> {error}
              </>
            ) : (
              <>
                <Check size={12} /> {status}
              </>
            )}
          </div>
        </div>
      )}

      {phase === "pending-empty" && (
        <EmptyShell
          profile={profile}
          jobs={jobs}
          storedJobs={storedJobs}
          intakeTab={intakeTab}
          setIntakeTab={setIntakeTab}
          manualDraft={manualDraft}
          setManualDraft={setManualDraft}
          pickedJobId={pickedJobId}
          setPickedJobId={setPickedJobId}
          profileStatusOpen={profileStatusOpen}
          setProfileStatusOpen={setProfileStatusOpen}
          onStartFromExistingJob={startFromExistingJob}
          onStartFromManualDraft={startFromManualDraft}
          onOpenCaptureTab={openCaptureTab}
          onOpenResumeManager={openResumeManager}
          onOpenDashboard={openDashboard}
          onDeleteEntry={deleteEntry}
        />
      )}

      {(phase === "jd-ready" || phase === "jd-bundled") && pending && (
        <ReviewGrid
          phase={phase}
          pending={pending}
          bundle={bundle}
          previewHtml={previewHtml}
          sourcePreviewHtml={sourcePreviewHtml}
          sourceLayoutState={sourceLayoutState}
          sourceLayoutError={sourceLayoutError}
          sourcePdfName={sourceResume?.sourcePdf?.fileName}
          sourceCharacterCount={sourceLayout?.characterCount}
          pdfSnapshot={pdfSnapshot}
          busy={busy}
          generationStage={generationStage}
          hasApiKey={hasApiKey}
          onGenerate={generate}
          onOpenInNewTab={openInNewTab}
          onDownloadHtml={downloadHtml}
          onPdfUpload={handlePdfUpload}
          onDownloadStoredPdf={downloadStoredPdf}
          onRemovePdf={async () => {
            await dropTailoredPdf(pending.jobKey);
            setPdfSnapshot(undefined);
            setStatus("已删除保存的 PDF");
          }}
        />
      )}

      {phase !== "pending-empty" && storedJobs.length > 0 && (
        <ArchiveStrip storedJobs={storedJobs} onLoad={async (jobKey) => {
          const stored = await getTailoredResume(jobKey);
          if (stored) {
            setBundle(stored);
            setPending(stored.context);
            const [pdf, resumeLibrary, activeResumeId] = await Promise.all([
              loadTailoredPdf(jobKey),
              loadResumeLibrary(),
              loadActiveResumeId()
            ]);
            setPdfSnapshot(pdf);
            const storedSource = stored.context.sourceResumeId
              ? resumeLibrary.find((resume) => resume.id === stored.context.sourceResumeId)
              : resumeLibrary.find((resume) => resume.id === activeResumeId);
            setSourceResume(storedSource);
            setStatus(`已载入历史定制：${stored.context.company} · ${stored.context.position}`);
          }
        }} onDelete={deleteEntry} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Toolbar — primary / secondary actions grouped by phase.
// ─────────────────────────────────────────────────────────────────────────────────

function Toolbar({
  phase,
  pending,
  bundle,
  busy,
  generationStage,
  hasApiKey,
  onOpenSettings,
  onGenerate,
  onOpenInNewTab,
  onDownloadHtml,
  onClose
}: {
  phase: "pending-empty" | "jd-ready" | "jd-bundled";
  pending?: PendingSnapshot;
  bundle?: TailoredResumeBundle;
  busy: boolean;
  generationStage: GenerationStage;
  hasApiKey: boolean;
  onOpenSettings: () => void;
  onGenerate: (mode: "deepseek" | "local") => void;
  onOpenInNewTab: () => void;
  onDownloadHtml: () => void;
  onClose: () => void;
}) {
  const jobLabel = pending ? `${pending.company} · ${pending.position}` : "未传入岗位上下文";
  const jobLabelClass = pending ? "toolbar-job is-set" : "toolbar-job";
  const activeStage = GENERATION_STAGES.find((item) => item.id === generationStage);
  return (
    <header className="review-toolbar">
      <div className="toolbar-title">
        <strong>JD × 简历对靶审阅</strong>
        <span className={jobLabelClass}>{jobLabel}</span>
      </div>
      <div className="toolbar-actions">
        {busy && (
          <div className="generation-toolbar-status" aria-live="polite">
            <RefreshCw className="spin" size={14} />
            <span>
              <strong>正在生成定制简历</strong>
              <small>{activeStage?.label || "正在处理"}</small>
            </span>
          </div>
        )}
        {phase === "pending-empty" && (
          <button type="button" className="ghost" onClick={onClose}>
            <X size={14} /> 关闭
          </button>
        )}
        {(phase === "jd-ready" || phase === "jd-bundled") && (
          <>
            <div className="primary-stack">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => hasApiKey ? onGenerate("deepseek") : onOpenSettings()}
                title={hasApiKey ? "用 DeepSeek 改写简历" : "先在设置中填写 DeepSeek API Key"}
              >
                {busy ? <RefreshCw className="spin" size={14} /> : <Sparkles size={14} />}
                {hasApiKey ? "DeepSeek 改写" : "配置 DeepSeek"}
              </button>
              {!hasApiKey && <span className="btn-hint is-status"><KeyRound size={12} /> 未配置 API Key</span>}
            </div>
            <div className="action-cluster">
              <button
                type="button"
                disabled={busy}
                onClick={() => onGenerate("local")}
                title="无需 API Key，按本地关键词匹配生成"
              >
                <Wand2 size={14} /> 本地兜底
              </button>
            </div>
            {bundle && (
              <div className="action-cluster">
                <button type="button" onClick={onOpenInNewTab}>
                  <ExternalLink size={14} /> 新标签
                </button>
                <button type="button" onClick={onDownloadHtml}>
                  <Download size={14} /> 保存 HTML
                </button>
              </div>
            )}
            <button type="button" className="ghost" onClick={onClose}>
              <X size={14} /> 关闭
            </button>
          </>
        )}
      </div>
      <div className="review-status">
        {phase === "pending-empty" &&
          "先把岗位上下文传进来，才能开始定制。下面三个入口任选其一。"}
        {phase === "jd-ready" &&
          (hasApiKey
            ? "已抓到岗位。点「DeepSeek 改写」一键产出定制版，没有 API Key 可用「本地兜底」。"
            : "已抓到岗位。先在设置里填 DeepSeek API Key，或先用「本地兜底」预览结构。")}
        {phase === "jd-bundled" &&
          "点左侧 JD 卡片可高亮右侧简历对应 bullet；打 PDF 前记得先点「保存 HTML」。"}
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Empty shell — intake & archive
// ─────────────────────────────────────────────────────────────────────────────────

interface ManualDraft {
  company: string;
  position: string;
  city: string;
  summary: string;
  responsibilities: string;
  requirements: string;
}

function emptyManualDraft(): ManualDraft {
  return {
    company: "",
    position: "",
    city: "",
    summary: "",
    responsibilities: "",
    requirements: ""
  };
}

function EmptyShell({
  profile,
  jobs,
  storedJobs,
  intakeTab,
  setIntakeTab,
  manualDraft,
  setManualDraft,
  pickedJobId,
  setPickedJobId,
  profileStatusOpen,
  setProfileStatusOpen,
  onStartFromExistingJob,
  onStartFromManualDraft,
  onOpenCaptureTab,
  onOpenResumeManager,
  onOpenDashboard,
  onDeleteEntry
}: {
  profile: PersonalProfile;
  jobs: JobApplication[];
  storedJobs: [string, { savedAt: string; notes: string[] }][];
  intakeTab: IntakeTab["id"];
  setIntakeTab: (id: IntakeTab["id"]) => void;
  manualDraft: ManualDraft;
  setManualDraft: (next: ManualDraft) => void;
  pickedJobId: string;
  setPickedJobId: (id: string) => void;
  profileStatusOpen: boolean;
  setProfileStatusOpen: (open: boolean) => void;
  onStartFromExistingJob: (job: JobApplication) => void;
  onStartFromManualDraft: () => void;
  onOpenCaptureTab: () => void;
  onOpenResumeManager: () => void;
  onOpenDashboard: () => void;
  onDeleteEntry: (jobKey: string) => void;
}) {
  const hasProfile = Boolean(
    profile.fullName || profile.phone || profile.email || profile.education.length || profile.experiences.length
  );
  return (
    <div className="empty-shell">
      <div className="empty-hero">
        <div className="hero-glyph">
          <Sparkles size={26} />
        </div>
        <div>
          <h1>先把岗位传进来</h1>
          <p>
            「对靶审阅」需要一份具体的 JD 才能定制。下面三种方式都能进入下一步：让 OfferFlow 浮窗抓当前页面、从已保存的岗位里挑一个，或当场手填一份。
          </p>
        </div>
      </div>

      <section className="intake-tabs" aria-label="传入岗位的三种方式">
        <header>
          {INTAKE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={intakeTab === tab.id ? "active" : ""}
              onClick={() => setIntakeTab(tab.id)}
            >
              {tab.label}
              <small style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>{tab.hint}</small>
            </button>
          ))}
        </header>
        <div className="intake-pane">
          {intakeTab === "capture" && (
            <CapturePane onOpenCaptureTab={onOpenCaptureTab} onOpenDashboard={onOpenDashboard} />
          )}
          {intakeTab === "existing" && (
            <ExistingJobsPane
              jobs={jobs}
              pickedJobId={pickedJobId}
              setPickedJobId={setPickedJobId}
              onPick={onStartFromExistingJob}
            />
          )}
          {intakeTab === "manual" && (
            <ManualDraftPane
              draft={manualDraft}
              setDraft={setManualDraft}
              onSubmit={onStartFromManualDraft}
            />
          )}
        </div>
      </section>

      <ProfileStatusCard
        profile={profile}
        hasProfile={hasProfile}
        open={profileStatusOpen}
        setOpen={setProfileStatusOpen}
        onOpenResumeManager={onOpenResumeManager}
      />

      {storedJobs.length > 0 && (
        <ArchiveList
          title="历史定制"
          subtitle={`${storedJobs.length} 个版本 · 仅本机`}
          storedJobs={storedJobs}
          onLoad={async (jobKey) => {
            const stored = await import("@/infrastructure/storage/storage").then((m) =>
              m.getTailoredResume(jobKey)
            );
            if (stored) {
              window.location.href = `tailor.html?context=${encodeContext({
                jobKey,
                context: stored.context
              })}`;
            }
          }}
          onDelete={onDeleteEntry}
        />
      )}
    </div>
  );
}

function CapturePane({
  onOpenCaptureTab,
  onOpenDashboard
}: {
  onOpenCaptureTab: () => void;
  onOpenDashboard: () => void;
}) {
  return (
    <>
      <h2>从招聘页一键抓取</h2>
      <p className="pane-lead">先打开任意招聘网页，让 OfferFlow 浮窗识别岗位，然后回到这里。</p>
      <div className="capture-guide">
        <div className="capture-step">
          <span className="step-mark">1</span>
          <strong>打开招聘网页</strong>
          <span>把 OfferFlow 扩展固定到工具栏，并在招聘详情页面停留几秒。</span>
        </div>
        <div className="capture-step">
          <span className="step-mark">2</span>
          <strong>浮窗里点「为这个岗位定制简历」</strong>
          <span>OfferFlow 会自动抓岗位信息，并把上下文传到这个页面。</span>
        </div>
        <div className="capture-step">
          <span className="step-mark">3</span>
          <strong>DeepSeek 改写 → 导出 PDF</strong>
          <span>首次进入后，配置 API Key → 生成定制 → 打印为 PDF。</span>
        </div>
      </div>
      <div className="manual-form" style={{ marginTop: 18 }}>
        <div className="manual-actions" style={{ gridColumn: "1 / -1", marginTop: 0 }}>
          <span className="lead">提示：首次使用建议先把 API Key 配置好，避免定制完才发现要走设置流程。</span>
          <span className="actions">
            <button type="button" onClick={onOpenCaptureTab}>
              <ListChecks size={14} /> 提醒浮窗已就绪
            </button>
            <button type="button" className="primary" onClick={onOpenDashboard}>
              <FolderOpen size={14} /> 打开工作台
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

function ExistingJobsPane({
  jobs,
  pickedJobId,
  setPickedJobId,
  onPick
}: {
  jobs: JobApplication[];
  pickedJobId: string;
  setPickedJobId: (id: string) => void;
  onPick: (job: JobApplication) => void;
}) {
  const eligible = useMemo(() => {
    return jobs
      .filter((job) => job.position)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [jobs]);
  return (
    <>
      <h2>从已有岗位选择</h2>
      <p className="pane-lead">直接复用 OfferFlow 已经保存的岗位信息。岗位里的 JD 摘要、职责、要求都会被一并带入。</p>
      {eligible.length === 0 ? (
        <div className="jobs-picker-list">
          <div className="empty-hint">OfferFlow 目前还没有岗位记录。请先用「从招聘页一键抓取」或「手动填写 JD」。</div>
        </div>
      ) : (
        <>
          <div className="jobs-picker-list">
            {eligible.map((job) => {
              const isSelected = job.id === pickedJobId;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setPickedJobId(job.id)}
                  disabled={isSelected}
                  aria-pressed={isSelected}
                >
                  <span>
                    <strong>{job.position}</strong>
                    <small>
                      {job.company}
                      {job.city ? ` · ${job.city}` : ""}
                      {job.deadline ? ` · 截止 ${job.deadline}` : ""}
                    </small>
                  </span>
                  <span className="job-meta">
                    <span>{formatRelative(job.updatedAt)}</span>
                    {isSelected && <Check size={13} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="manual-form" style={{ marginTop: 18 }}>
            <div className="manual-actions" style={{ gridColumn: "1 / -1", marginTop: 0 }}>
              <span className="lead">
                {pickedJobId
                  ? "选中的岗位会作为这一次的定制上下文"
                  : "先在上面挑一个岗位，再点「使用此岗位」"}
              </span>
              <span className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!pickedJobId}
                  onClick={() => {
                    const job = eligible.find((item) => item.id === pickedJobId);
                    if (job) onPick(job);
                  }}
                >
                  <ArrowRight size={14} /> 使用此岗位
                </button>
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ManualDraftPane({
  draft,
  setDraft,
  onSubmit
}: {
  draft: ManualDraft;
  setDraft: (next: ManualDraft) => void;
  onSubmit: () => void;
}) {
  const canSubmit = Boolean(draft.position.trim());
  return (
    <>
      <h2>手动填写 JD</h2>
      <p className="pane-lead">没有合适的页面或岗位在手？把 JD 关键信息粘进下面，至少岗位名必填。</p>
      <div className="manual-form">
        <label>
          <span>岗位名称 *</span>
          <input
            type="text"
            value={draft.position}
            onChange={(event) => setDraft({ ...draft, position: event.target.value })}
            placeholder="例如：算法工程师 · 推荐方向"
          />
        </label>
        <label>
          <span>公司</span>
          <input
            type="text"
            value={draft.company}
            onChange={(event) => setDraft({ ...draft, company: event.target.value })}
            placeholder="例如：字节跳动"
          />
        </label>
        <label>
          <span>城市</span>
          <input
            type="text"
            value={draft.city}
            onChange={(event) => setDraft({ ...draft, city: event.target.value })}
            placeholder="例如：北京"
          />
        </label>
        <label>
          <span>岗位摘要</span>
          <input
            type="text"
            value={draft.summary}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            placeholder="一句话概括 JD 的方向"
          />
        </label>
        <label className="full">
          <span>工作职责（每行一条）</span>
          <textarea
            rows={4}
            value={draft.responsibilities}
            onChange={(event) => setDraft({ ...draft, responsibilities: event.target.value })}
            placeholder={"负责推荐系统核心算法迭代\n建设 AB 实验平台\n协同上下游工程团队落地模型"}
          />
        </label>
        <label className="full">
          <span>岗位要求（每行一条）</span>
          <textarea
            rows={4}
            value={draft.requirements}
            onChange={(event) => setDraft({ ...draft, requirements: event.target.value })}
            placeholder={"硕士及以上 / 机器学习方向\n熟悉 TensorFlow / PyTorch\n有大规模分布式训练经验优先"}
          />
        </label>
        <div className="manual-actions">
          <span className="lead">提交后会按本地规则生成一版，后续可以再切到 DeepSeek 改写。</span>
          <span className="actions">
            <button
              type="button"
              className="primary"
              disabled={!canSubmit}
              onClick={onSubmit}
            >
              <Wand2 size={14} /> 开始定制
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

function ProfileStatusCard({
  profile,
  hasProfile,
  open,
  setOpen,
  onOpenResumeManager
}: {
  profile: PersonalProfile;
  hasProfile: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
  onOpenResumeManager: () => void;
}) {
  return (
    <section className="profile-status" aria-label="个人资料状态">
      <div className="ps-mark">
        <BriefcaseBusiness size={18} />
      </div>
      <div className="ps-copy">
        <strong>{hasProfile ? "个人资料已就绪" : "首次使用 · 还没有个人资料"}</strong>
        <small>
          {hasProfile
            ? `${profile.fullName || "未填姓名"} · ${profile.education.length} 段教育 · ${profile.experiences.length} 段经历 · ${profile.projects.length} 个项目`
            : "先在简历中心录入姓名、学历、经历和项目，定制出来的简历才会有素材。"}
        </small>
      </div>
      <button type="button" onClick={() => setOpen(!open)}>
        {open ? (
          <>
            <ChevronUp size={14} /> 收起
          </>
        ) : (
          <>
            <ChevronDown size={14} /> {hasProfile ? "查看字段" : "补全资料"}
          </>
        )}
      </button>
      {open && <ProfileFields profile={profile} onOpenResumeManager={onOpenResumeManager} />}
    </section>
  );
}

function ProfileFields({
  profile,
  onOpenResumeManager
}: {
  profile: PersonalProfile;
  onOpenResumeManager: () => void;
}) {
  const rows: Array<[string, string | number]> = [
    ["姓名", profile.fullName || "—"],
    ["电话", profile.phone || "—"],
    ["邮箱", profile.email || "—"],
    ["现居地", profile.currentCity || "—"],
    ["意向岗位", profile.targetRole || "—"],
    ["教育段数", `${profile.education.length} 段`],
    ["实习 / 工作", `${profile.experiences.length} 段`],
    ["项目经历", `${profile.projects.length} 段`]
  ];
  return (
    <div
      style={{
        flexBasis: "100%",
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px dashed var(--line)",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "8px 16px"
      }}
    >
      {rows.map(([label, value]) => (
        <div key={label} style={{ fontSize: 12.5 }}>
          <div style={{ color: "var(--muted)" }}>{label}</div>
          <div style={{ color: "var(--ink)", marginTop: 2 }}>{value}</div>
        </div>
      ))}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onOpenResumeManager}
          style={{
            border: "1px solid var(--blue)",
            color: "var(--blue)",
            background: "#fff",
            borderRadius: 8,
            padding: "6px 12px",
            font: "inherit",
            fontSize: 12.5,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5
          }}
        >
          <FileText size={13} /> 打开简历中心
        </button>
      </div>
    </div>
  );
}

function ArchiveList({
  title,
  subtitle,
  storedJobs,
  onLoad,
  onDelete
}: {
  title: string;
  subtitle: string;
  storedJobs: [string, { savedAt: string; notes: string[] }][];
  onLoad: (jobKey: string) => void;
  onDelete: (jobKey: string) => void;
}) {
  return (
    <section className="intake-archive" aria-label={title}>
      <header>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </header>
      <ul>
        {storedJobs.map(([key, entry]) => (
          <li key={key}>
            <span className="meta">
              <strong>{key.replace(/^tailor_/, "")}</strong>
              <small>保存于 {formatRelative(entry.savedAt)}</small>
            </span>
            <span className="row-actions">
              <button type="button" onClick={() => onLoad(key)}>
                <ArrowRight size={13} /> 载入
              </button>
              <button type="button" className="danger" onClick={() => onDelete(key)}>
                <Trash2 size={13} /> 删除
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Review grid — JD panel + resume panel (and pending CTA when no bundle yet)
// ─────────────────────────────────────────────────────────────────────────────────

function ReviewGrid({
  phase,
  pending,
  bundle,
  previewHtml,
  sourcePreviewHtml,
  sourceLayoutState,
  sourceLayoutError,
  sourcePdfName,
  sourceCharacterCount,
  pdfSnapshot,
  busy,
  generationStage,
  hasApiKey,
  onGenerate,
  onOpenInNewTab,
  onDownloadHtml,
  onPdfUpload,
  onDownloadStoredPdf,
  onRemovePdf
}: {
  phase: "jd-ready" | "jd-bundled";
  pending: PendingSnapshot;
  bundle?: TailoredResumeBundle;
  previewHtml: string;
  sourcePreviewHtml: string;
  sourceLayoutState: "idle" | "loading" | "ready" | "error";
  sourceLayoutError: string;
  sourcePdfName?: string;
  sourceCharacterCount?: number;
  pdfSnapshot?: TailoredPdfSnapshot;
  busy: boolean;
  generationStage: GenerationStage;
  hasApiKey: boolean;
  onGenerate: (mode: "deepseek" | "local") => void;
  onOpenInNewTab: () => void;
  onDownloadHtml: () => void;
  onPdfUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadStoredPdf: () => void;
  onRemovePdf: () => Promise<void>;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewMode, setPreviewMode] = useState<"editable" | "source">("editable");
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const activePreviewHtml = previewMode === "source" ? sourcePreviewHtml : previewHtml;
  useEffect(() => {
    setPreviewLoaded(false);
  }, [activePreviewHtml]);

  useEffect(() => {
    if (previewMode === "source" && !sourcePreviewHtml) setPreviewMode("editable");
  }, [previewMode, sourcePreviewHtml]);

  const handlePreviewLoad = () => {
    setPreviewLoaded(true);
  };
  const rawJobDescription = pending.rawExcerpt?.trim() || [
    pending.summary,
    pending.responsibilities.length ? `岗位职责\n${pending.responsibilities.join("\n")}` : "",
    pending.requirements.length ? `任职要求\n${pending.requirements.join("\n")}` : ""
  ].filter(Boolean).join("\n\n");

  return (
    <div className="review-grid">
      {bundle && previewHtml && (
        <TailorResultBanner
          bundle={bundle}
          sourcePdfName={sourcePdfName}
          sourceCharacterCount={sourceCharacterCount}
          onOpenPreview={onOpenInNewTab}
          onDownloadHtml={onDownloadHtml}
        />
      )}
      <section className="panel jd-panel" aria-label="原始职位描述">
        <div className="panel-head">
          <strong>{pending.position || "职位描述 / JD"}</strong>
          <small>
            {pending.company || "未填写公司"} · {pending.city || "未填写城市"} · {extractHost(pending.sourceUrl) || "手动传入"}
          </small>
        </div>
        <div className="jd-scroll">
          <div className="jd-original-meta">
            <div><small>公司</small><strong>{pending.company || "未填写公司"}</strong></div>
            <div><small>岗位</small><strong>{pending.position || "未填写岗位"}</strong></div>
            {pending.city && <div><small>地点</small><strong>{pending.city}</strong></div>}
          </div>
          <article className="jd-original-copy">
            <h2>岗位 JD</h2>
            <div>{rawJobDescription || "未读取到岗位原文，请回到招聘页面重新识别。"}</div>
          </article>
        </div>
      </section>

      <section className="panel resume-panel" aria-label="可编辑简历与映射标注">
        <div className="panel-head">
          <div className="resume-panel-title">
            <strong>{previewMode === "editable" ? "流式编辑简历" : "原 PDF 对照"}</strong>
            {bundle && (
              <div className="preview-mode-switch" aria-label="简历预览模式">
                <button
                  type="button"
                  className={previewMode === "editable" ? "active" : ""}
                  onClick={() => setPreviewMode("editable")}
                >
                  流式编辑
                </button>
                <button
                  type="button"
                  className={previewMode === "source" ? "active" : ""}
                  disabled={!sourcePreviewHtml}
                  onClick={() => setPreviewMode("source")}
                >
                  原 PDF 对照
                </button>
              </div>
            )}
          </div>
          <small>
            {bundle ? (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <span className={`bundle-badge ${bundle.jd.source === "fallback" ? "local" : ""}`}>
                  {bundle.jd.source === "deepseek" ? "DeepSeek 定制" : "本地兜底"}
                </span>
                <span>生成于 {new Date(bundle.generatedAt).toLocaleString("zh-CN")}</span>
              </span>
            ) : (
              "尚未生成定制简历"
            )}
          </small>
        </div>
        <div className="resume-scroll">
          {busy && generationStage !== "idle" && generationStage !== "error" ? (
            <GenerationProgress stage={generationStage} pending={pending} />
          ) : activePreviewHtml && bundle ? (
            <div className={`resume-stage ${previewLoaded ? "is-loaded" : "is-loading"}`}>
              <iframe
                ref={iframeRef}
                title="定制简历预览"
                className="resume-iframe"
                srcDoc={activePreviewHtml}
                sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
                onLoad={handlePreviewLoad}
              />
              {!previewLoaded && (
                <div className="resume-preview-loading" aria-live="polite">
                  <RefreshCw className="spin" size={18} />
                  <span>正在打开简历预览…</span>
                </div>
              )}
            </div>
          ) : bundle && sourceLayoutState === "loading" ? (
            <div className="resume-preview-loading" aria-live="polite">
              <RefreshCw className="spin" size={18} />
              <span>正在按原 PDF 版式生成预览…</span>
            </div>
          ) : bundle && sourceLayoutState === "error" ? (
            <div className="resume-empty-state">
              <AlertTriangle size={20} />
              <strong>原 PDF 版式读取失败</strong>
              <span>{sourceLayoutError || "请回到简历库重新导入原始 PDF，再重新生成这份定制简历。"}</span>
            </div>
          ) : bundle && sourceLayoutState === "idle" ? (
            <div className="resume-empty-state">
              <AlertTriangle size={20} />
              <strong>缺少原 PDF 母版</strong>
              <span>这份定制不会使用重排模板。请回到简历库导入原始 PDF 后再生成。</span>
            </div>
          ) : generationStage !== "idle" && generationStage !== "error" ? (
            <GenerationProgress stage={generationStage} pending={pending} />
          ) : (
            <ResumePendingCta
              busy={busy}
              hasApiKey={hasApiKey}
              onGenerate={onGenerate}
              onOpenInNewTab={onOpenInNewTab}
              onDownloadHtml={onDownloadHtml}
            />
          )}
        </div>
        <div className="resume-foot">
          <PdfManager
            pending={pending}
            pdfSnapshot={pdfSnapshot}
            busy={busy}
            hasBundle={Boolean(bundle)}
            onOpenPreview={onOpenInNewTab}
            onUpload={onPdfUpload}
            onDownload={onDownloadStoredPdf}
            onRemove={async () => {
              await onRemovePdf();
            }}
          />
        </div>
      </section>
    </div>
  );
}

function TailorResultBanner({
  bundle,
  sourcePdfName,
  sourceCharacterCount,
  onOpenPreview,
  onDownloadHtml
}: {
  bundle: TailoredResumeBundle;
  sourcePdfName?: string;
  sourceCharacterCount?: number;
  onOpenPreview: () => void;
  onDownloadHtml: () => void;
}) {
  return (
    <section className="tailor-result-banner" aria-live="polite">
      <div className="tailor-result-copy">
        <span className="tailor-result-mark"><Check size={18} /></span>
        <div>
          <strong>流式定制简历已生成</strong>
          <small>{bundle.context.company || "当前岗位"} · {bundle.context.position} · 可整段编辑并自动重排</small>
        </div>
      </div>
      <div className="tailor-result-stats">
        <span title={sourcePdfName}>
          {sourcePdfName || "原 PDF"} · {sourceCharacterCount || 0} 字 · 原版仅用于对照
        </span>
      </div>
      <div className="tailor-result-actions">
        <button type="button" className="primary" onClick={onOpenPreview}>
          <ExternalLink size={14} /> 打开预览并保存 PDF
        </button>
        <button type="button" onClick={onDownloadHtml}>
          <Download size={14} /> 下载 HTML
        </button>
      </div>
    </section>
  );
}

function GenerationProgress({ stage, pending }: { stage: GenerationStage; pending: PendingSnapshot }) {
  const currentIndex = GENERATION_STAGES.findIndex((item) => item.id === stage);
  const active = GENERATION_STAGES[currentIndex] || GENERATION_STAGES[0];
  return (
    <div className="generation-progress" aria-live="polite">
      <div className="generation-progress-mark"><Sparkles size={22} /></div>
      <h2>正在生成岗位定制简历</h2>
      <p>{pending.company || "当前公司"} · {pending.position || "目标岗位"}</p>
      <div className="generation-steps">
        {GENERATION_STAGES.map((item, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "active" : "pending";
          return (
            <div className={`generation-step ${state}`} key={item.id}>
              <span>{state === "complete" ? <Check size={12} /> : index + 1}</span>
              <strong>{item.label}</strong>
            </div>
          );
        })}
      </div>
      <div className="generation-progress-detail">
        <RefreshCw className="spin" size={14} />
        <span>{active.detail}</span>
      </div>
    </div>
  );
}

function ResumePendingCta({
  busy,
  hasApiKey,
  onGenerate,
  onOpenInNewTab,
  onDownloadHtml
}: {
  busy: boolean;
  hasApiKey: boolean;
  onGenerate: (mode: "deepseek" | "local") => void;
  onOpenInNewTab: () => void;
  onDownloadHtml: () => void;
}) {
  return (
    <div className="resume-pending">
      <div className="pending-glyph">
        <FileText size={22} />
      </div>
      <h2>等待生成第一版定制简历</h2>
      <p>
        {hasApiKey
          ? "已检测到 DeepSeek 配置，点下方按钮即可基于左侧 JD 改写你的简历。"
          : "尚未配置 DeepSeek API Key。先点「本地兜底」看结构，再去设置里填 Key 用 DeepSeek。"}{" "}
        后续编辑、再生成、打印 PDF 都在同一页面。
      </p>
      <div className="pending-actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !hasApiKey}
          onClick={() => onGenerate("deepseek")}
        >
          {busy ? <RefreshCw className="spin" size={14} /> : <Sparkles size={14} />}
          DeepSeek 改写
        </button>
        <button type="button" disabled={busy} onClick={() => onGenerate("local")}>
          <Wand2 size={14} /> 本地兜底
        </button>
        <button type="button" onClick={onOpenInNewTab}>
          <ExternalLink size={14} /> 新标签预览
        </button>
        <button type="button" onClick={onDownloadHtml}>
          <Download size={14} /> 保存 HTML
        </button>
      </div>
    </div>
  );
}

function PdfManager({
  pending,
  pdfSnapshot,
  busy,
  hasBundle,
  onOpenPreview,
  onUpload,
  onDownload,
  onRemove
}: {
  pending: PendingSnapshot | undefined;
  pdfSnapshot: TailoredPdfSnapshot | undefined;
  busy: boolean;
  hasBundle: boolean;
  onOpenPreview: () => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
  onRemove: () => Promise<void>;
}) {
  return (
    <div className="pdf-manager">
      <div className="pdf-manager-copy">
        <strong>投递 PDF（可选）</strong>
        <small>
          {pdfSnapshot
            ? `已保存：${pdfSnapshot.fileName} · ${formatSize(pdfSnapshot.size)}`
            : pending && hasBundle
              ? "原 PDF 母版已用于定制版式；打开预览可保存最终投递 PDF。"
            : pending
                ? "当前简历库中的原 PDF 会作为定制母版；生成后可在这里保存投递稿。"
              : "先选定岗位，再生成基于原 PDF 版式的投递稿。"}
        </small>
      </div>
      <div className="pdf-manager-actions">
        {hasBundle && !pdfSnapshot && (
          <button type="button" className="pdf-preview-action" onClick={onOpenPreview}>
            <ExternalLink size={14} /> 打开预览并保存 PDF
          </button>
        )}
        <label className={`pdf-upload ${!pending || busy || !hasBundle ? "is-disabled" : ""}`}>
          <input
            type="file"
            accept="application/pdf"
            onChange={onUpload}
            disabled={!pending || busy || !hasBundle}
          />
          <Upload size={14} />
          <span>{pdfSnapshot ? "替换 PDF" : hasBundle ? "上传自定义 PDF" : "上传 PDF"}</span>
        </label>
        {pdfSnapshot && (
          <>
            <button type="button" onClick={onDownload}>
              <FileText size={14} /> 下载已保存 PDF
            </button>
            <button type="button" className="pdf-remove" onClick={() => void onRemove()}>
              <Trash2 size={14} /> 删除
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Archive strip + helpers
// ─────────────────────────────────────────────────────────────────────────────────

function ArchiveStrip({
  storedJobs,
  onLoad,
  onDelete
}: {
  storedJobs: [string, { savedAt: string; notes: string[] }][];
  onLoad: (jobKey: string) => void;
  onDelete: (jobKey: string) => void;
}) {
  if (!storedJobs.length) return null;
  return (
    <section className="review-archive" aria-label="历史定制">
      <header>
        <strong>历史定制</strong>
        <small>{storedJobs.length} 个版本 · 全部仅本机</small>
      </header>
      <ul>
        {storedJobs.map(([key, entry]) => (
          <li key={key}>
            <span className="meta">
              <strong>{key.replace(/^tailor_/, "")}</strong>
              <small>保存于 {formatRelative(entry.savedAt)}</small>
            </span>
            <span className="row-actions">
              <button type="button" onClick={() => onLoad(key)}>
                <ArrowRight size={13} /> 载入
              </button>
              <button type="button" className="danger" onClick={() => onDelete(key)}>
                <Trash2 size={13} /> 删除
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function jobToTailorContext(job: JobApplication): PendingSnapshot {
  return normalizeTailorContext({
    jobKey: "",
    company: job.company || "未填公司",
    position: job.position || "未填岗位",
    city: job.city,
    jobType: job.jobType,
    deadline: job.deadline,
    summary: job.summary,
    responsibilities: job.responsibilities || [],
    requirements: job.requirements || [],
    rawExcerpt: job.rawExcerpt,
    sourceUrl: job.sourceUrl
  });
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-•·●]+/, "").trim())
    .filter(Boolean);
}

function extractHost(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function decodeContext(payload: string): UrlPayload {
  const parseJson = (value: string): UrlPayload | undefined => {
    const parsed = JSON.parse(value) as Partial<UrlPayload> & Partial<PendingSnapshot>;
    if (parsed.context) {
      return {
        jobKey: parsed.jobKey || parsed.context.jobKey || "",
        context: parsed.context
      };
    }
    if (typeof parsed.position === "string") {
      const context = parsed as PendingSnapshot;
      return {
        jobKey: context.jobKey || "",
        context
      };
    }
    return undefined;
  };

  try {
    const direct = parseJson(decodeURIComponent(payload));
    if (direct) return direct;
  } catch {
    // Fall through to the original Base64 payload format used by history links.
  }

  try {
    const decoded = decodeUtf8Base64(decodeURIComponent(payload));
    const parsed = parseJson(decoded);
    if (parsed) return parsed;
  } catch {
    // Report a stable user-facing error below.
  }

  throw new Error("岗位上下文解析失败");
}

function decodeUtf8Base64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeContext(payload: UrlPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
    );
  }
  return encodeURIComponent(btoa(binary));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRelative(value?: string) {
  if (!value) return "刚刚";
  const target = new Date(value).getTime();
  const now = Date.now();
  const diff = Math.round((now - target) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.round(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.round(diff / 3600)} 小时前`;
  return new Date(value).toLocaleString("zh-CN");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(offset, Math.min(offset + chunk, bytes.length)))
    );
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
