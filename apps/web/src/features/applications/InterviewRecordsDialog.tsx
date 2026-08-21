import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  Clock3,
  FileAudio,
  FileText,
  LoaderCircle,
  MessageCircleQuestion,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent
} from "react";
import { MAX_INTERVIEW_AUDIO_BYTES, type ApplicationSyncItem } from "@offerflow/contracts";
import type { InterviewRecord } from "@offerflow/domain";
import { api } from "../../app/api";

type InputMode = "audio" | "transcript";
type DialogPanel = "create" | "record";
const MAX_TRANSCRIPT_FILE_BYTES = 900 * 1024;

const STATUS_LABELS: Record<string, string> = {
  queued: "等待处理",
  uploaded: "等待处理",
  pending: "等待处理",
  transcribing: "正在转写",
  analyzing: "正在提取问答",
  processing: "正在解析",
  ready: "已完成",
  completed: "已完成",
  failed: "处理失败"
};

function isReady(record: InterviewRecord): boolean {
  return record.status === "ready";
}

function isFailed(record: InterviewRecord): boolean {
  return record.status === "failed";
}

function isProcessing(record: InterviewRecord): boolean {
  return !isReady(record) && !isFailed(record);
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] || "正在处理";
}

function sourceLabel(sourceType: string): string {
  return /transcript|text/i.test(sourceType) ? "文字稿" : "录音";
}

function formatRecordDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function recordTitle(record: InterviewRecord, company: string): string {
  return record.title?.trim() || `${company} 面试记录`;
}

export function InterviewRecordsDialog({
  item,
  onClose
}: {
  item: ApplicationSyncItem;
  onClose: () => void;
}) {
  const { application } = item;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const methodButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptFileRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement>();
  const closeTimerRef = useRef<number>();
  const closingRef = useRef(false);
  const closeCompletedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const fileInputId = useId();
  const transcriptId = useId();
  const transcriptFileId = useId();
  const titleId = useId();
  const consentId = useId();
  const consentErrorId = useId();

  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string>();
  const [panel, setPanel] = useState<DialogPanel>("create");
  const [inputMode, setInputMode] = useState<InputMode>("audio");
  const [title, setTitle] = useState("");
  const [audioFile, setAudioFile] = useState<File>();
  const [audioConsent, setAudioConsent] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptFileName, setTranscriptFileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [closing, setClosing] = useState(false);

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
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(finishClose, 220);
  }, [finishClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    methodButtonRef.current?.focus();

    return () => {
      if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  const loadRecords = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const result = await api.interviews.list(application.id);
      const nextRecords = [...result.records].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
      setRecords(nextRecords);
      setSelectedRecordId((current) => {
        if (current && nextRecords.some((record) => record.id === current)) return current;
        return nextRecords[0]?.id;
      });
    } catch (requestError) {
      setLoadError(requestError instanceof Error ? requestError.message : "无法读取面试记录");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [application.id]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const hasProcessingRecord = records.some(isProcessing);
  useEffect(() => {
    if (!hasProcessingRecord) return;
    const interval = window.setInterval(() => void loadRecords(true), 3000);
    return () => window.clearInterval(interval);
  }, [hasProcessingRecord, loadRecords]);

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId),
    [records, selectedRecordId]
  );
  const showConsentError = inputMode === "audio"
    && !audioConsent
    && formError.includes("录音相关方授权");

  const openRecord = (recordId: string) => {
    setSelectedRecordId(recordId);
    setPanel("record");
  };

  const openCreate = () => {
    setPanel("create");
    setFormError("");
    window.setTimeout(() => methodButtonRef.current?.focus(), 0);
  };

  const changeInputMode = (mode: InputMode) => {
    setInputMode(mode);
    setFormError("");
    window.setTimeout(() => {
      if (mode === "audio") fileInputRef.current?.focus();
      else transcriptRef.current?.focus();
    }, 0);
  };

  const readTranscriptFile = async (file?: File) => {
    if (!file) return;
    setFormError("");
    if (file.size > MAX_TRANSCRIPT_FILE_BYTES) {
      setTranscriptFileName("");
      setFormError("文字稿文件不能超过 900 KB；较长内容可以分次导入");
      transcriptFileRef.current?.focus();
      return;
    }
    try {
      const content = (await file.text()).replace(/^\uFEFF/, "");
      if (!content.trim()) {
        setFormError("这份文字稿文件没有可读取的内容");
        transcriptFileRef.current?.focus();
        return;
      }
      setTranscript(content);
      setTranscriptFileName(file.name);
      setAnnouncement(`已读取文字稿 ${file.name}`);
      transcriptRef.current?.focus();
    } catch {
      setTranscriptFileName("");
      setFormError("无法读取这份文字稿，请检查文件格式后重试");
      transcriptFileRef.current?.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    if (inputMode === "audio" && !audioFile) {
      setFormError("请选择一段面试录音");
      fileInputRef.current?.focus();
      return;
    }
    if (inputMode === "audio" && audioFile && audioFile.size > MAX_INTERVIEW_AUDIO_BYTES) {
      setFormError("录音文件不能超过 50 MB");
      fileInputRef.current?.focus();
      return;
    }
    if (inputMode === "audio" && !audioConsent) {
      setFormError("请确认已获得录音相关方授权，并同意使用第三方语音转写服务");
      document.getElementById(consentId)?.focus();
      return;
    }
    if (inputMode === "transcript" && !transcript.trim()) {
      setFormError("请粘贴或输入面试文字稿");
      transcriptRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const cleanTitle = title.trim() || undefined;
      const result = inputMode === "audio"
        ? await api.interviews.uploadAudio(application.id, audioFile!, { title: cleanTitle })
        : await api.interviews.createFromTranscript(application.id, {
            title: cleanTitle,
            transcript: transcript.trim()
          });
      setRecords((current) => [
        result.record,
        ...current.filter((record) => record.id !== result.record.id)
      ]);
      setSelectedRecordId(result.record.id);
      setPanel("record");
      setTitle("");
      setAudioFile(undefined);
      setAudioConsent(false);
      setTranscript("");
      setTranscriptFileName("");
      setAnnouncement(
        isReady(result.record)
          ? "面试问答已经生成"
          : "记录已提交，OfferFlow 正在解析面试问答"
      );
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "无法提交面试记录");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clickedOutside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (clickedOutside) requestClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`interview-records-dialog${closing ? " is-closing" : ""}`}
      aria-labelledby="interview-records-title"
      aria-describedby="interview-records-description"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        requestClose();
      }}
      onMouseDown={handleBackdropClick}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === "transform") {
          finishClose();
        }
      }}
    >
      <div className="interview-dialog-shell">
        <header className="interview-dialog-header">
          <div>
            <span className="page-kicker"><AudioLines aria-hidden="true" size={13} />面试记录</span>
            <h2 id="interview-records-title">面试问答记录</h2>
            <p id="interview-records-description">{application.company} · {application.position}</p>
          </div>
          <button className="interview-dialog-close" type="button" aria-label="关闭面试问答记录" onClick={requestClose}>
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div className="interview-dialog-body">
          <aside className="interview-record-sidebar" aria-label="面试记录列表">
            <div className="interview-record-sidebar-heading">
              <div><span>记录</span><strong>{records.length}</strong></div>
              <button type="button" onClick={openCreate} aria-pressed={panel === "create"}>
                <Plus aria-hidden="true" size={14} />新记录
              </button>
            </div>

            {loading ? (
              <div className="interview-list-state" role="status"><LoaderCircle className="spin" aria-hidden="true" size={19} />正在读取记录…</div>
            ) : loadError ? (
              <div className="interview-list-state interview-list-state--error">
                <AlertCircle aria-hidden="true" size={19} />
                <span>{loadError}</span>
                <button type="button" onClick={() => void loadRecords()}><RefreshCw aria-hidden="true" size={13} />重试</button>
              </div>
            ) : records.length ? (
              <div className="interview-record-list">
                {records.map((record) => (
                  <button
                    className="interview-record-list-item"
                    type="button"
                    key={record.id}
                    aria-pressed={panel === "record" && record.id === selectedRecordId}
                    onClick={() => openRecord(record.id)}
                  >
                    <span className={`interview-source-icon interview-source-icon--${sourceLabel(record.sourceType) === "录音" ? "audio" : "text"}`}>
                      {sourceLabel(record.sourceType) === "录音" ? <FileAudio aria-hidden="true" size={15} /> : <FileText aria-hidden="true" size={15} />}
                    </span>
                    <span className="interview-record-list-copy">
                      <strong>{recordTitle(record, application.company)}</strong>
                      <small>{formatRecordDate(record.createdAt)} · {sourceLabel(record.sourceType)}</small>
                      <em className={`interview-status interview-status--${isReady(record) ? "ready" : isFailed(record) ? "failed" : "processing"}`}>
                        {isProcessing(record) && <span className="interview-status-dot" aria-hidden="true" />}
                        {statusLabel(record.status)}
                        {isReady(record) && ` · ${record.qaPairs.length} 问`}
                      </em>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="interview-list-state interview-list-state--empty"><AudioLines aria-hidden="true" size={22} /><span>还没有面试记录</span><small>上传第一段录音或文字稿</small></div>
            )}
          </aside>

          <main className="interview-record-main">
            {panel === "create" ? (
              <form className="interview-upload-form" onSubmit={submit} noValidate>
                <div className="interview-panel-heading">
                  <span><Upload aria-hidden="true" size={17} /></span>
                  <div><h3>添加面试记录</h3><p>选择录音或文字稿，自动整理为提问与回答。</p></div>
                </div>

                <label className="interview-field" htmlFor={titleId}>
                  <span>记录标题 <small>选填</small></span>
                  <input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：产品一面 · 业务负责人" />
                </label>

                <div className="interview-input-methods" role="group" aria-label="选择记录上传方式">
                  <button
                    ref={methodButtonRef}
                    type="button"
                    aria-pressed={inputMode === "audio"}
                    onClick={() => changeInputMode("audio")}
                  >
                    <FileAudio aria-hidden="true" size={16} /><span><strong>上传录音</strong><small>自动转写并提取问答</small></span>
                  </button>
                  <button type="button" aria-pressed={inputMode === "transcript"} onClick={() => changeInputMode("transcript")}>
                    <FileText aria-hidden="true" size={16} /><span><strong>上传文字稿</strong><small>直接解析已有文本</small></span>
                  </button>
                </div>

                {inputMode === "audio" ? (
                  <>
                    <div className={`interview-audio-drop ${audioFile ? "interview-audio-drop--selected" : ""}`}>
                      <input
                        ref={fileInputRef}
                        id={fileInputId}
                        type="file"
                        accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.aac,.flac"
                        aria-describedby={`${fileInputId}-hint`}
                        onChange={(event) => setAudioFile(event.target.files?.[0])}
                      />
                      <span className="interview-audio-drop-icon" aria-hidden="true">{audioFile ? <CheckCircle2 size={24} /> : <AudioLines size={24} />}</span>
                      <label htmlFor={fileInputId}>{audioFile ? audioFile.name : "选择一段面试录音"}</label>
                      <small id={`${fileInputId}-hint`}>{audioFile ? `${(audioFile.size / 1024 / 1024).toFixed(1)} MB · 点击可重新选择` : "支持 MP3、M4A、WAV、WebM 等格式，单个文件不超过 50 MB"}</small>
                    </div>
                    <div className="interview-privacy-notice">
                      <span><AlertCircle aria-hidden="true" size={16} /></span>
                      <div><strong>免费第三方转写（实验性）</strong><p>当前音频会发送至第三方 ASR 服务进行转写；文字稿不会经过语音服务。</p></div>
                    </div>
                    <label className="interview-consent" htmlFor={consentId}>
                      <input
                        id={consentId}
                        type="checkbox"
                        checked={audioConsent}
                        aria-invalid={showConsentError || undefined}
                        aria-describedby={showConsentError ? consentErrorId : undefined}
                        onChange={(event) => {
                          setAudioConsent(event.target.checked);
                          if (event.target.checked) setFormError("");
                        }}
                      />
                      <span>我确认已获得录音相关方授权，并同意将音频发送至第三方语音转写服务。</span>
                    </label>
                    {showConsentError && <span className="sr-only" id={consentErrorId}>{formError}</span>}
                  </>
                ) : (
                  <div className="interview-field interview-transcript-field">
                    <span className="interview-transcript-label-row">
                      <label htmlFor={transcriptId}>面试文字稿</label>
                      <span className="interview-transcript-import">
                        <input
                          ref={transcriptFileRef}
                          id={transcriptFileId}
                          type="file"
                          accept=".txt,.md,.srt,.vtt,text/plain,text/markdown,text/vtt"
                          aria-describedby={`${transcriptFileId}-hint`}
                          onChange={(event) => {
                            void readTranscriptFile(event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                        <label htmlFor={transcriptFileId}><Upload aria-hidden="true" size={13} />上传文字稿文件</label>
                      </span>
                    </span>
                    <span className="interview-transcript-file-hint" id={`${transcriptFileId}-hint`}>
                      {transcriptFileName ? `已读取：${transcriptFileName}` : "支持 TXT、Markdown、SRT、VTT（最大 900 KB），也可以直接粘贴"}
                    </span>
                    <textarea
                      ref={transcriptRef}
                      id={transcriptId}
                      value={transcript}
                      onChange={(event) => setTranscript(event.target.value)}
                      rows={10}
                      placeholder={"面试官：请先做一下自我介绍。\n候选人：您好，我最近主要负责……"}
                    />
                    <small>{transcript.trim().length.toLocaleString("zh-CN")} 字</small>
                  </div>
                )}

                <div className="interview-knowledge-note">
                  <Sparkles aria-hidden="true" size={15} />
                  <span><strong>自动加入你的求职知识上下文</strong><small>解析后的问答仅对你可见，可用于后续复盘、简历优化和模拟面试。</small></span>
                </div>

                <div className="interview-form-error" role={formError ? "alert" : undefined}>{formError}</div>
                <footer className="interview-upload-actions">
                  <button className="secondary-button" type="button" onClick={requestClose}>取消</button>
                  <button className="primary-button" type="submit" disabled={submitting}>
                    {submitting ? <LoaderCircle className="spin" aria-hidden="true" size={16} /> : <Sparkles aria-hidden="true" size={16} />}
                    {submitting ? "正在提交…" : inputMode === "audio" ? "上传并解析" : "生成面试问答"}
                  </button>
                </footer>
              </form>
            ) : selectedRecord ? (
              <InterviewRecordPreview record={selectedRecord} onRefresh={() => void loadRecords(true)} />
            ) : (
              <div className="interview-preview-empty"><MessageCircleQuestion aria-hidden="true" size={28} /><h3>选择一条面试记录</h3><p>这里会展示从录音或文字稿中整理出的提问和回答。</p></div>
            )}
          </main>
        </div>

        <div className="sr-only" role="status">{announcement}</div>
      </div>
    </dialog>
  );
}

function InterviewRecordPreview({
  record,
  onRefresh
}: {
  record: InterviewRecord;
  onRefresh: () => void;
}) {
  const pairs = [...record.qaPairs].sort((left, right) => left.order - right.order);

  return (
    <section className="interview-record-preview" aria-labelledby={`interview-preview-${record.id}`} aria-busy={isProcessing(record)}>
      <header className="interview-preview-heading">
        <div>
          <span className={`interview-status interview-status--${isReady(record) ? "ready" : isFailed(record) ? "failed" : "processing"}`}>
            {isProcessing(record) && <span className="interview-status-dot" aria-hidden="true" />}
            {statusLabel(record.status)}
          </span>
          <h3 id={`interview-preview-${record.id}`}>{record.title || "面试问答记录"}</h3>
          <p>{formatRecordDate(record.createdAt)} · 来源：{sourceLabel(record.sourceType)}</p>
        </div>
        {isProcessing(record) && <button type="button" onClick={onRefresh}><RefreshCw aria-hidden="true" size={14} />刷新状态</button>}
      </header>

      {isProcessing(record) ? (
        <div className="interview-processing-card" role="status">
          <span className="interview-processing-orbit"><AudioLines aria-hidden="true" size={22} /></span>
          <div><strong>正在把这次面试整理成问答</strong><p>你可以关闭弹窗，处理会在后台继续。完成后重新打开即可查看。</p></div>
          <ol aria-label="处理进度">
            <li className="is-complete"><CheckCircle2 aria-hidden="true" size={15} />录音已接收</li>
            <li className={record.sourceType === "transcript" ? "is-complete" : "is-current"}><Clock3 aria-hidden="true" size={15} />语音转文字</li>
            <li className={record.sourceType === "transcript" ? "is-current" : ""}><MessageCircleQuestion aria-hidden="true" size={15} />提取面试问答</li>
          </ol>
        </div>
      ) : isFailed(record) ? (
        <div className="interview-failed-card" role="alert"><AlertCircle aria-hidden="true" size={22} /><div><strong>这条记录暂时无法解析</strong><p>{record.error || "请确认录音或文字稿内容后重新提交。"}</p></div></div>
      ) : pairs.length ? (
        <ol className="interview-qa-list">
          {pairs.map((pair, index) => (
            <li className="interview-qa-card" key={pair.id}>
              <div className="interview-question-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <span className="interview-qa-label">面试提问</span>
                <h4>{pair.question}</h4>
                <span className="interview-qa-label interview-qa-label--answer">你的回答</span>
                <p>{pair.answer}</p>
                {pair.evidence && <blockquote><span>原文依据</span>{pair.evidence}</blockquote>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="interview-preview-empty"><MessageCircleQuestion aria-hidden="true" size={28} /><h3>暂未识别出完整问答</h3><p>文字稿会保留在下方，你也可以换一份更完整的内容重新解析。</p></div>
      )}

      {record.transcript && (
        <details className="interview-transcript-details">
          <summary><FileText aria-hidden="true" size={15} />查看完整文字稿</summary>
          <pre>{record.transcript}</pre>
        </details>
      )}
    </section>
  );
}
