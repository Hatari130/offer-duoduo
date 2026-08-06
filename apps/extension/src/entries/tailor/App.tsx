import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  FileText,
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
  getTailoredResume,
  loadProfile,
  loadSettings,
  loadTailoredPdf,
  loadTailoredResumes,
  saveTailoredPdf,
  saveTailoredResume,
  type TailoredPdfSnapshot
} from "@/infrastructure/storage/storage";
import {
  buildLocalFallback,
  ensureJobKey,
  tailorResumeWithDeepSeek
} from "@/features/tailor/tailor";
import { buildResumeHtml } from "@/features/tailor/buildResumeHtml";
import type {
  JdAnalysis,
  TailoredResumeBundle,
  TailorContext
} from "@/features/tailor/types";
import type {
  OfferFlowSettings,
  PersonalProfile
} from "@/shared/types";

interface PendingSnapshot extends TailorContext {}

interface UrlPayload {
  jobKey: string;
  context: PendingSnapshot;
}

const PARAM_CONTEXT = "context";

const EMPTY_PROFILE: PersonalProfile = {
  fullName: "",
  gender: "",
  phone: "",
  email: "",
  nationality: "",
  idType: "",
  idNumber: "",
  birthDate: "",
  graduationDate: "",
  currentCity: "",
  nativePlace: "",
  studentSource: "",
  currentResidence: "",
  height: "",
  weight: "",
  recruitmentType: "",
  graduateStatus: "",
  wechat: "",
  qq: "",
  politicalStatus: "",
  maritalStatus: "",
  healthStatus: "",
  specialty: "",
  workYears: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  countryRegion: "",
  address: "",
  targetRole: "",
  targetCities: "",
  earliestStartDate: "",
  expectedSalary: "",
  referralCode: "",
  portfolioUrl: "",
  githubUrl: "",
  education: [],
  experiences: [],
  projects: [],
  campusExperiences: [],
  awards: [],
  languages: [],
  computerSkills: [],
  qualifications: [],
  familyMembers: [],
  publications: [],
  patents: [],
  works: [],
  competitions: [],
  hobbies: "",
  selfIntroduction: "",
  strengths: "",
  careerPlan: ""
};

export default function TailorApp() {
  const [profile, setProfile] = useState<PersonalProfile>({ ...EMPTY_PROFILE });
  const [settings, setSettings] = useState<OfferFlowSettings>({});
  const [bundle, setBundle] = useState<TailoredResumeBundle | undefined>();
  const [allEntries, setAllEntries] = useState<Record<string, { savedAt: string; notes: string[] }>>({});
  const [pending, setPending] = useState<PendingSnapshot | undefined>();
  const [busy, setBusy] = useState(false);
  const [pdfSnapshot, setPdfSnapshot] = useState<TailoredPdfSnapshot | undefined>();
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [storedProfile, storedSettings] = await Promise.all([loadProfile(), loadSettings()]);
      setProfile(storedProfile);
      setSettings(storedSettings);
      const map = await loadTailoredResumes();
      setAllEntries(
        Object.fromEntries(
          Object.entries(map).map(([key, entry]) => [key, { savedAt: entry.savedAt, notes: entry.notes }])
        )
      );
      const params = new URLSearchParams(location.search);
      const encoded = params.get(PARAM_CONTEXT);
      const initialPayload = encoded ? decodeContext(encoded) : undefined;
      if (initialPayload) {
        const inner = initialPayload.context;
        const jobKey = inner.jobKey || ensureJobKey(inner);
        const context: PendingSnapshot = { ...inner, jobKey };
        setPending(context);
        const stored = await getTailoredResume(jobKey);
        if (stored) {
          setBundle(stored);
          setStatus(`已载入历史定制（${formatRelative(stored.generatedAt)}）`);
        }
        const pdf = await loadTailoredPdf(jobKey);
        setPdfSnapshot(pdf);
      }
    })();
  }, []);

  const storedJobs = useMemo(() => Object.entries(allEntries), [allEntries]);
  const previewHtml = useMemo(() => {
    if (!bundle) return "";
    return buildResumeHtml({ resume: bundle.resume, jd: bundle.jd });
  }, [bundle]);

  const generate = async (mode: "deepseek" | "local") => {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      let next: TailoredResumeBundle;
      if (mode === "deepseek") {
        if (!settings.deepseekApiKey) {
          throw new Error("未配置 DeepSeek API Key，请先在设置中填写");
        }
        next = await tailorResumeWithDeepSeek(profile, pending, settings);
      } else {
        next = buildLocalFallback(profile, pending);
      }
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
      setStatus(mode === "deepseek" ? "DeepSeek 已生成定制简历" : "本地已生成定制简历");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败");
    } finally {
      setBusy(false);
    }
  };

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

  return (
    <div className="review-shell">
      <header className="review-toolbar">
        <div className="toolbar-title">
          <strong>JD × 简历对照审阅</strong>
          <span>
            {pending ? `${pending.company} · ${pending.position}` : "未传入岗位上下文"}
          </span>
        </div>
        <div className="toolbar-actions">
          <button
            type="button"
            className={bundle?.jd.source === "deepseek" ? "primary" : ""}
            disabled={!pending || busy}
            onClick={() => generate("deepseek")}
          >
            {busy ? <RefreshCw className="spin" size={14} /> : <Sparkles size={14} />}
            DeepSeek 改写
          </button>
          <button
            type="button"
            disabled={!pending || busy}
            onClick={() => generate("local")}
          >
            <Wand2 size={14} />
            本地兜底
          </button>
          {bundle && (
            <button type="button" onClick={openInNewTab}>
              <ExternalLink size={14} />
              新标签打开
            </button>
          )}
          {bundle && (
            <button type="button" onClick={downloadHtml}>
              <Download size={14} />
              保存 HTML
            </button>
          )}
          <button type="button" onClick={() => window.close()}>
            <X size={14} />
            关闭
          </button>
        </div>
        <div className="review-status">
          {!pending && "先在招聘页面点击 OfferFlow 浮窗里的「为这个岗位定制简历」即可传入岗位信息。"}
          {pending && !bundle && "点击「DeepSeek 改写」或「本地兜底」生成第一版定制简历。"}
          {pending && bundle && "点击左侧 JD 要求 / 右侧标注，查看对应简历证据。打印前点「保存 HTML」。"}
        </div>
        {(error || status) && (
          <div className={`review-status ${error ? "review-status-error" : "review-status-ok"}`}>
            {error ? <><AlertTriangle size={12} /> {error}</> : <><Check size={12} /> {status}</>}
          </div>
        )}
      </header>

      <div className="review-grid">
        <section className="panel jd-panel" aria-label="职位描述与证据映射">
          <div className="panel-head">
            <strong>职位描述 / JD</strong>
            <small>
              {pending
                ? `${extractHost(pending.sourceUrl) || "招聘页"} · ${pending.city || "未填写城市"}`
                : "未传入岗位"}
            </small>
          </div>
          <div className="jd-scroll">
            {pending ? (
              <>
                <div className="jd-summary">
                  <h2>JD 摘要</h2>
                  <p>{pending.summary || "未提供摘要"}</p>
                  <div className="score-row">
                    <span className="score-pill">
                      <strong>{pending.responsibilities.length}</strong>
                      &nbsp;条工作职责
                    </span>
                    <span className="score-pill">
                      <strong>{pending.requirements.length}</strong>
                      &nbsp;条岗位要求
                    </span>
                    <span className="score-pill">
                      <strong>{bundle ? countMappings(bundle.jd) : 0}</strong>
                      &nbsp;条映射
                    </span>
                    <span className="score-pill">
                      来源：{pending.sourceUrl ? new URL(pending.sourceUrl).hostname : "—"}
                    </span>
                  </div>
                </div>

                <JdCardList
                  category="responsibility"
                  label="工作职责"
                  items={pending.responsibilities}
                  mappings={bundle?.jd}
                />
                <JdCardList
                  category="requirement"
                  label="岗位要求"
                  items={pending.requirements}
                  mappings={bundle?.jd}
                />
                {bundle && bundle.notes.length > 0 && (
                  <div className="jd-summary">
                    <h2>改写要点</h2>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "#42505d", fontSize: 13 }}>
                      {bundle.notes.map((note, index) => (
                        <li key={index}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {bundle && bundle.unsupportedClaims.length > 0 && (
                  <div className="jd-summary" style={{ background: "#fff5f5", borderColor: "#f0c2c2" }}>
                    <h2 style={{ color: "#a33" }}>被砍掉的"无法核实"声明</h2>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "#7a2a2a", fontSize: 13 }}>
                      {bundle.unsupportedClaims.map((claim, index) => (
                        <li key={index}>{claim}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="jd-summary">
                <h2>等待岗位信息</h2>
                <p>先在招聘页面点击 OfferFlow 浮窗里的「为这个岗位定制简历」，把岗位上下文传到这里。</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel resume-panel" aria-label="可编辑简历与映射标注">
          <div className="panel-head">
            <strong>简历 HTML / 可编辑版本</strong>
            <small>
              {bundle
                ? `生成于 ${new Date(bundle.generatedAt).toLocaleString("zh-CN")}`
                : "尚未生成定制简历"}
            </small>
          </div>
          <div className="resume-scroll">
            {previewHtml ? (
              <div className="resume-stage">
                <iframe
                  title="定制简历预览"
                  className="resume-iframe"
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
                />
              </div>
            ) : (
              <div className="jd-summary" style={{ margin: 16 }}>
                <h2>还没有生成简历</h2>
                <p>左侧已经识别出岗位信息。点击右上角「DeepSeek 改写」即可一键产出可编辑、可打印 PDF 的简历。</p>
              </div>
            )}
          </div>
          <div className="resume-foot">
            <PdfManager
              pending={pending}
              pdfSnapshot={pdfSnapshot}
              busy={busy}
              onUpload={handlePdfUpload}
              onDownload={downloadStoredPdf}
              onRemove={async () => {
                if (!pending) return;
                await dropTailoredPdf(pending.jobKey);
                setPdfSnapshot(undefined);
                setStatus("已删除保存的 PDF");
              }}
            />
          </div>
        </section>
      </div>

      {storedJobs.length > 0 && (
        <section className="review-archive" aria-label="历史定制">
          <header>
            <strong>历史定制</strong>
            <small>{storedJobs.length} 个版本 · 全部仅本机</small>
          </header>
          <ul>
            {storedJobs.map(([key, entry]) => (
              <li key={key}>
                <span>
                  <strong>{key.replace(/^tailor_/, "")}</strong>
                  <small>保存于 {formatRelative(entry.savedAt)}</small>
                </span>
                <span>
                  <button
                    type="button"
                    onClick={async () => {
                      const stored = await getTailoredResume(key);
                      if (stored) {
                        setBundle(stored);
                        setPending(stored.context);
                        const pdf = await loadTailoredPdf(key);
                        setPdfSnapshot(pdf);
                        setStatus(`已载入历史定制：${stored.context.company} · ${stored.context.position}`);
                      }
                    }}
                  >
                    <ArrowRight size={13} /> 载入
                  </button>
                  <button type="button" onClick={() => deleteEntry(key)}>
                    <Trash2 size={13} /> 删除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function JdCardList({
  category,
  label,
  items,
  mappings
}: {
  category: "responsibility" | "requirement" | "bonus" | "differentiator" | "keyword";
  label: string;
  items: string[];
  mappings?: JdAnalysis;
}) {
  if (!items?.length) return null;
  return (
    <>
      <div className="jd-section-title">{label}</div>
      <div id={`jd-${category}`}>
        {items.map((item, index) => {
          const mapping = mappings?.mappings?.find(
            (m) => m.text === item && m.category === category
          );
          const mapId = mapping?.map_id || `JD-${category.toUpperCase()}-${index + 1}`;
          const matched = Boolean(mapping);
          return (
            <div
              key={index}
              className="jd-card"
              data-match={matched ? "direct" : "pending"}
              data-map-id={mapId}
            >
              <div className="jd-card-top">
                <span className="jd-id">{mapId}</span>
                <span className={`match-pill ${matched ? "match-direct" : "match-pending"}`}>
                  {matched ? "已映射" : "待补证"}
                </span>
                <span className="importance-pill">{label}</span>
              </div>
              <p>{item}</p>
              {mapping?.resume_ids?.length ? (
                <div className="evidence-row">
                  {mapping.resume_ids.slice(0, 4).map((rid) => (
                    <span key={rid} className="evidence-chip">
                      {rid}
                    </span>
                  ))}
                  {mapping.resume_ids.length > 4 && (
                    <span className="evidence-chip">+{mapping.resume_ids.length - 4}</span>
                  )}
                </div>
              ) : null}
              {mapping?.rationale && <p className="review-note">{mapping.rationale}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PdfManager({
  pending,
  pdfSnapshot,
  busy,
  onUpload,
  onDownload,
  onRemove
}: {
  pending: PendingSnapshot | undefined;
  pdfSnapshot: TailoredPdfSnapshot | undefined;
  busy: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="pdf-manager">
      <div className="pdf-manager-copy">
        <strong>我的 PDF 简历</strong>
        <small>
          {pdfSnapshot
            ? `已保存：${pdfSnapshot.fileName} · ${formatSize(pdfSnapshot.size)}`
            : "上传一份 PDF 作为「一键投递」时的参考稿（≤ 8MB）"}
        </small>
      </div>
      <div className="pdf-manager-actions">
        <label className={`pdf-upload ${!pending || busy ? "is-disabled" : ""}`}>
          <input
            type="file"
            accept="application/pdf"
            onChange={onUpload}
            disabled={!pending || busy}
          />
          <Upload size={14} />
          <span>{pdfSnapshot ? "替换 PDF" : "上传 PDF"}</span>
        </label>
        {pdfSnapshot && (
          <button type="button" onClick={onDownload}>
            <FileText size={14} />
            下载已保存 PDF
          </button>
        )}
        {pdfSnapshot && (
          <button type="button" className="pdf-remove" onClick={onRemove}>
            <Trash2 size={14} />
            删除
          </button>
        )}
      </div>
    </div>
  );
}

function countMappings(jd: JdAnalysis) {
  return jd.mappings.length;
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
  try {
    const decoded = decodeUtf8Base64(decodeURIComponent(payload));
    return JSON.parse(decoded) as UrlPayload;
  } catch (error) {
    throw new Error("岗位上下文解析失败");
  }
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