import { useEffect, useId, useRef, useState } from "react";
import type {
  ChatAgentExpertNote,
  ChatAgentRewrite,
  ChatAgentRun,
  ChatContextKind,
  ChatMessage,
  ChatOpportunityResults,
  ChatRunAgent,
  KnowledgeCitation,
  OpportunityStatus,
  RecruitmentOpportunity
} from "@offerflow/domain";
import {
  ArrowDown,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  FileText,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  ThumbsDown,
  ThumbsUp,
  X
} from "lucide-react";
import { Markdown } from "./Markdown";
import { ExpertAvatar } from "../agents/skillMeta";
import { CompanionAvatar } from "./CompanionAvatar";
import type { ChatPendingMode } from "./pendingMode";

interface MessageListProps {
  messages: ChatMessage[];
  pendingMode?: ChatPendingMode;
  copiedMessageId?: string;
  onCopy: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onFeedback: (message: ChatMessage, feedback: "positive" | "negative") => void;
  onFollowUp: (prompt: string) => void;
  onOpenWorkspace: (kind: ChatContextKind) => void;
  /** Team names for the byline of agent turns. */
  teamNames?: Partial<Record<ChatRunAgent, string>>;
}

const followUps = [
  "把结论整理成今天可以完成的行动清单",
  "指出当前还缺少哪些关键信息",
  "基于我选中的材料给出可直接使用的修改稿"
] as const;

const pendingStages = {
  opportunities: [
    {
      label: "理解条件",
      headline: "小鲤正在理解你的筛选条件",
      support: "方向、城市和更新时间会一起带入检索"
    },
    {
      label: "查岗位库",
      headline: "小鲤正在查找可投岗位",
      support: "正在从 JobKoI 岗位库筛选真实机会"
    },
    {
      label: "核对链接",
      headline: "小鲤正在核对链接和截止时间",
      support: "很快给你整理成最多 5 张岗位卡片"
    }
  ],
  answer: [
    {
      label: "理解问题",
      headline: "小鲤正在读你的问题",
      support: "先把目标和现状理清楚"
    },
    {
      label: "整理信息",
      headline: "小鲤正在整理回答",
      support: "正在结合本轮材料与对话上下文"
    },
    {
      label: "形成回答",
      headline: "小鲤正在把下一步说清楚",
      support: "让建议更容易直接开始"
    }
  ]
} as const;

function webSourceUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function MessageList({
  messages,
  pendingMode,
  copiedMessageId,
  onCopy,
  onRetry,
  onFeedback,
  onFollowUp,
  onOpenWorkspace,
  teamNames = {}
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [pendingStage, setPendingStage] = useState(0);
  const pinnedRef = useRef(true);
  const lastAssistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;
  const pendingCopy = pendingMode ? pendingStages[pendingMode][pendingStage] : undefined;

  useEffect(() => {
    setPendingStage(0);
    if (!pendingMode) return;
    const searchingTimer = window.setTimeout(() => setPendingStage(1), 900);
    const verifyingTimer = window.setTimeout(() => setPendingStage(2), 5_500);
    return () => {
      window.clearTimeout(searchingTimer);
      window.clearTimeout(verifyingTimer);
    };
  }, [pendingMode]);

  const getScrollContainer = () =>
    (endRef.current?.closest(".thread-scroll") as HTMLElement | null) ?? null;

  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;
    const updatePin = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      const pinned = distance < 96;
      if (pinnedRef.current !== pinned) {
        pinnedRef.current = pinned;
        setPinnedToBottom(pinned);
      }
    };
    container.addEventListener("scroll", updatePin, { passive: true });
    updatePin();
    return () => container.removeEventListener("scroll", updatePin);
  }, []);

  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;
    const last = messages[messages.length - 1];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (last?.role === "user" && !pinnedRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
      return;
    }
    if (pinnedRef.current) container.scrollTop = container.scrollHeight;
  }, [messages, pendingMode, pendingStage]);

  const jumpToBottom = () => {
    const container = getScrollContainer();
    if (!container) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ top: container.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  };

  const contextFor = (index: number) => {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (messages[cursor].role === "user") return messages[cursor].context || [];
    }
    return [];
  };

  return (
    <div className="message-list" aria-live="polite" aria-relevant="additions text">
      <span className="sr-only" role="status" aria-atomic="true">{pendingCopy?.headline || ""}</span>
      {messages.map((message, index) => {
        const messageContext = contextFor(index);
        const workspaceKinds = [...new Set(messageContext.map((item) => item.kind))];
        return (
          <article
            className={`message message--${message.role}${message.id === lastAssistantId ? " is-latest" : ""}`}
            key={message.id}
            aria-busy={message.status === "streaming"}
          >
            {message.role === "assistant" && (
              <CompanionAvatar className="assistant-avatar" size="small" />
            )}
            <div className="message-body">
              {message.role === "assistant" && message.agentRun && (
                <div className="message-author">
                  <strong>小鲤</strong>
                  {teamNames[message.agentRun.agent] && <span>{teamNames[message.agentRun.agent]}</span>}
                </div>
              )}
              {message.attachments.length > 0 && (
                <div className="message-attachments" aria-label="本轮上传资料">
                  {message.attachments.map((attachment) => <span key={attachment.id}><FileText aria-hidden="true" size={13} />{attachment.name}</span>)}
                </div>
              )}
              {message.context && message.context.length > 0 && (
                <div className="message-context" aria-label="本轮参考资料">
                  <span>参考</span>
                  {message.context.map((item) => <span key={`${item.kind}:${item.id}`}>{item.label}</span>)}
                </div>
              )}
              {message.agentRun && message.agentRun.steps.length > 0 && (
                <AgentProcess run={message.agentRun} working={message.status === "streaming"} />
              )}

              {message.agentRun?.notes && message.agentRun.notes.length > 0 && (
                <ExpertNotes notes={message.agentRun.notes} />
              )}

              <div className="message-copy">
                {message.content ? (
                  message.role === "assistant" ? (
                    <Markdown externalLinks>{message.content}</Markdown>
                  ) : message.content
                ) : message.status === "streaming" ? <ThinkingIndicator /> : null}
              </div>

              {message.opportunityResults && (
                <OpportunityResultCards results={message.opportunityResults} />
              )}

              {message.agentRun && message.agentRun.rewrites.length > 0 && (
                <RewriteCards
                  rewrites={message.agentRun.rewrites}
                  onAdjust={message.id === lastAssistantId && message.status === "complete" ? onFollowUp : undefined}
                />
              )}

              {message.status === "error" && (
                <p className="message-generation-state is-error">小鲤这次没生成完整。检查网络后再试一次。</p>
              )}
              {message.status === "stopped" && (
                <p className="message-generation-state">已停止生成，你可以保留当前内容或再生成一版。</p>
              )}

              {message.citations.length > 0 && <CitationList citations={message.citations} />}

              {message.role === "assistant" && message.status !== "streaming" && (
                <div className="message-actions" aria-label="回答操作">
                  {message.content && (
                    <button
                      type="button"
                      onClick={() => onCopy(message)}
                      aria-label={copiedMessageId === message.id ? "已复制" : "复制回答"}
                      title={copiedMessageId === message.id ? "已复制" : "复制回答"}
                    >
                      {copiedMessageId === message.id ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
                    </button>
                  )}
                  <button type="button" onClick={() => onRetry(message)} aria-label="再生成一版" title="再生成一版">
                    <RefreshCw aria-hidden="true" size={15} />
                  </button>
                  {message.status === "complete" && (
                    <>
                      <button
                        type="button"
                        aria-pressed={message.feedback === "positive"}
                        aria-label="有帮助"
                        title="有帮助"
                        onClick={() => onFeedback(message, "positive")}
                      >
                        <ThumbsUp aria-hidden="true" size={15} />
                      </button>
                      <button
                        type="button"
                        aria-pressed={message.feedback === "negative"}
                        aria-label="没帮助"
                        title="没帮助"
                        onClick={() => onFeedback(message, "negative")}
                      >
                        <ThumbsDown aria-hidden="true" size={15} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {message.id === lastAssistantId && message.status === "complete" && !message.agentRun && (
                <section className="answer-next-steps" aria-label="继续推进">
                  <span>继续推进</span>
                  <div>
                    {followUps.map((prompt) => <button type="button" key={prompt} onClick={() => onFollowUp(prompt)}>{prompt}</button>)}
                  </div>
                  {workspaceKinds.length > 0 && (
                    <div className="answer-workspace-actions">
                      {workspaceKinds.includes("resume") && (
                        <button type="button" onClick={() => onOpenWorkspace("resume")}>打开简历模板 <ArrowUpRight aria-hidden="true" size={13} /></button>
                      )}
                      {workspaceKinds.some((kind) => kind === "application" || kind === "interview") && (
                        <button type="button" onClick={() => onOpenWorkspace("application")}>打开投递管理 <ArrowUpRight aria-hidden="true" size={13} /></button>
                      )}
                    </div>
                  )}
                </section>
              )}
            </div>
          </article>
        );
      })}
      {pendingMode && pendingCopy && (
        <article className="message message--assistant message--pending" aria-hidden="true">
          <CompanionAvatar className="assistant-avatar" size="small" decorative />
          <div className="message-body">
            <div className="assistant-progress" data-mode={pendingMode}>
              <header>
                <span className="assistant-progress__icon"><Search size={16} strokeWidth={2} /></span>
                <div>
                  <strong>{pendingCopy.headline}</strong>
                  <span>{pendingCopy.support}</span>
                </div>
              </header>
              <ol>
                {pendingStages[pendingMode].map((stage, index) => (
                  <li
                    key={stage.label}
                    data-state={index < pendingStage ? "complete" : index === pendingStage ? "current" : "upcoming"}
                  >
                    <i>{index < pendingStage ? "✓" : index + 1}</i>
                    <span>{stage.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </article>
      )}
      <div ref={endRef} />
      {!pinnedToBottom && messages.length > 0 && (
        <button type="button" className="scroll-bottom-fab" onClick={jumpToBottom}>
          <ArrowDown aria-hidden="true" size={14} />回到底部
        </button>
      )}
    </div>
  );
}

const opportunityStatusLabel: Record<OpportunityStatus, string> = {
  upcoming: "即将开放",
  open: "正在招聘",
  closing: "即将截止",
  closed: "已截止",
  ongoing: "长期招聘"
};

function displayOpportunityTitle(opportunity: RecruitmentOpportunity): string {
  const genericTitle = opportunity.title === "校园招聘" || /20\d{2}\s*届/.test(opportunity.title);
  return genericTitle && opportunity.roleTags.length
    ? opportunity.roleTags.slice(0, 2).join(" / ")
    : opportunity.title;
}

function displayDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[2])} 月 ${Number(match[3])} 日` : value;
}

function OpportunityResultCards({ results }: { results: ChatOpportunityResults }) {
  const titleId = useId();
  const items = results.items.slice(0, 5);
  if (!items.length) return null;

  return (
    <section className="opportunity-results" aria-labelledby={titleId}>
      <header className="opportunity-results__header">
        <div>
          <span>JOBKOI 岗位库</span>
          <h3 id={titleId}>匹配岗位</h3>
        </div>
        <p>展示 {items.length} 条，共 {results.total} 条</p>
      </header>
      <ul className="opportunity-results__grid">
        {items.map((opportunity) => {
          const applyUrl = webSourceUrl(opportunity.officialUrl);
          const status = opportunity.status || "ongoing";
          const deadline = displayDate(opportunity.deadline);
          return (
            <li key={opportunity.id}>
              <article className="opportunity-card">
                <div className="opportunity-card__company">
                  <span aria-hidden="true"><Building2 size={15} /></span>
                  <strong>{opportunity.company}</strong>
                  <i data-status={status}>{opportunityStatusLabel[status]}</i>
                </div>
                <h4>{displayOpportunityTitle(opportunity)}</h4>
                <div className="opportunity-card__meta">
                  {opportunity.cities.length > 0 && (
                    <span><MapPin aria-hidden="true" size={14} />{opportunity.cities.slice(0, 2).join("、")}</span>
                  )}
                  {deadline && (
                    <span><CalendarClock aria-hidden="true" size={14} />{deadline}截止</span>
                  )}
                </div>
                <div className="opportunity-card__tags" aria-label="招聘批次与届别">
                  {opportunity.batch && <span>{opportunity.batch}</span>}
                  {opportunity.graduationYears.slice(0, 2).map((year) => <span key={year}>{year}</span>)}
                </div>
                {applyUrl && (
                  <a href={applyUrl} target="_blank" rel="noreferrer">
                    前往投递
                    <ArrowUpRight aria-hidden="true" size={15} />
                    <span className="sr-only">（在新标签页打开 {opportunity.company} 的招聘页面）</span>
                  </a>
                )}
              </article>
            </li>
          );
        })}
      </ul>
      {(results.sourceUpdatedAt || results.fetchedAt) && (
        <p className="opportunity-results__freshness">
          岗位库更新于 {displayDate(results.sourceUpdatedAt || results.fetchedAt)}，投递前请以招聘官网为准
        </p>
      )}
    </section>
  );
}

function CitationList({ citations }: { citations: KnowledgeCitation[] }) {
  const [selected, setSelected] = useState<KnowledgeCitation>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const sourceUrl = webSourceUrl(selected?.url);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  return (
    <>
      <section className="citation-list" aria-label="回答参考资料">
        <span>回答依据</span>
        <div>
          {citations.map((citation, index) => (
            <button type="button" key={citation.id} onClick={() => setSelected(citation)}>
              <i>{index + 1}</i><span>{citation.title}</span>
            </button>
          ))}
        </div>
      </section>
      <dialog
        ref={dialogRef}
        className="citation-dialog"
        aria-labelledby={titleId}
        onClose={() => setSelected(undefined)}
        onCancel={() => setSelected(undefined)}
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      >
        {selected && (
          <div>
            <header>
              <div><span>回答依据</span><h2 id={titleId}>{selected.title}</h2></div>
              <button type="button" aria-label="关闭回答依据" onClick={() => dialogRef.current?.close()}><X aria-hidden="true" size={17} /></button>
            </header>
            <blockquote>{selected.excerpt}</blockquote>
            <footer>
              <code>{selected.sourceId}</code>
              {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">打开原始来源 <ArrowUpRight aria-hidden="true" size={14} /></a>}
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}

function ThinkingIndicator() {
  return (
    <span className="thinking-indicator" aria-label="小鲤正在整理回答">
      <i /><i /><i />
    </span>
  );
}

/** What the team did this turn: open with the current step while working, folded once done. */
function AgentProcess({ run, working }: { run: ChatAgentRun; working: boolean }) {
  const current = run.steps.at(-1);
  return (
    <details className="agent-process" open={working || undefined}>
      <summary>
        {working
          ? <span className="agent-process__pulse" aria-hidden="true" />
          : <Check aria-hidden="true" size={13} />}
        <span>{working ? current?.label ?? "开始工作" : `完成 ${run.steps.length} 步`}</span>
        <ChevronDown aria-hidden="true" size={14} className="agent-process__chevron" />
      </summary>
      <ol aria-label="小鲤这一轮做了什么">
        {run.steps.map((step) => (
          <li key={step.id} className={step.status === "rejected" ? "is-rejected" : undefined}>
            {step.status === "rejected"
              ? <RotateCcw aria-hidden="true" size={12} />
              : <Check aria-hidden="true" size={12} />}
            <span>{step.label}</span>
            {step.detail && <small>{step.detail}</small>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function ExpertNotes({ notes }: { notes: ChatAgentExpertNote[] }) {
  return (
    <section className="expert-notes" aria-label="专家意见">
      {notes.map((note) => <ExpertNoteCard key={note.id} note={note} />)}
    </section>
  );
}

function ExpertNoteCard({ note }: { note: ChatAgentExpertNote }) {
  const [expanded, setExpanded] = useState(false);
  const long = note.content.length > 140;
  return (
    <article className={`expert-note${long && !expanded ? " is-clamped" : ""}`}>
      <header>
        <ExpertAvatar expert={{ id: note.expertId, name: note.expertName, category: note.expertId.startsWith("custom:") ? "custom" : "resume" }} />
        <strong>{note.expertName}</strong>
        <small>{note.expertRole}</small>
      </header>
      <div className="expert-note__body">
        <Markdown>{note.content}</Markdown>
      </div>
      {long && (
        <button type="button" className="expert-note__toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起" : "展开全文"}
        </button>
      )}
    </article>
  );
}

// The three most common follow-ups in real resume conversations ("太长", "太 AI", "换一个").
const REWRITE_ADJUSTMENTS = ["再短一点", "去掉 AI 味", "换个说法"] as const;

function RewriteCards({ rewrites, onAdjust }: { rewrites: ChatAgentRewrite[]; onAdjust?: (prompt: string) => void }) {
  const [copied, setCopied] = useState<string>();
  const copy = async (rewrite: ChatAgentRewrite) => {
    await navigator.clipboard.writeText(rewrite.after);
    setCopied(rewrite.entryId);
    window.setTimeout(() => setCopied((current) => current === rewrite.entryId ? undefined : current), 1600);
  };
  return (
    <section className="rewrite-cards" aria-label={`改写结果 ${rewrites.length} 条`}>
      {rewrites.map((rewrite) => {
        // Lines that do not appear verbatim in the original are the ones the coach changed or added.
        const original = new Set(rewrite.before.split("\n").map((line) => line.trim()));
        const changedLines = new Set(rewrite.after.split("\n").flatMap((line, index) => original.has(line.trim()) ? [] : [index]));
        return (
        <article key={rewrite.entryId} className="rewrite-card">
          <header>
            <strong>{rewrite.title}</strong>
            <button type="button" onClick={() => void copy(rewrite)}>
              {copied === rewrite.entryId ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
              {copied === rewrite.entryId ? "已复制" : "复制改后"}
            </button>
          </header>
          <div className="rewrite-diff">
            <div className="rewrite-before"><span>改前</span><p>{rewrite.before}</p></div>
            <div className="rewrite-after">
              <span>改后</span>
              <p className={changedLines.size < rewrite.after.split("\n").length ? "has-kept-lines" : undefined}>
                {rewrite.after.split("\n").map((line, index) => (
                  <span key={index} className={changedLines.has(index) ? "is-changed" : undefined}>{line}</span>
                ))}
              </p>
            </div>
          </div>
          {rewrite.reason && <p className="rewrite-reason">{rewrite.reason}</p>}
          {onAdjust && (
            <div className="rewrite-adjust" aria-label={`调整「${rewrite.title}」`}>
              {REWRITE_ADJUSTMENTS.map((adjustment) => (
                <button type="button" key={adjustment} onClick={() => onAdjust(`把「${rewrite.title}」${adjustment}`)}>
                  {adjustment}
                </button>
              ))}
            </div>
          )}
        </article>
        );
      })}
    </section>
  );
}
