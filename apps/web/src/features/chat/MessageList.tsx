import { useEffect, useId, useRef, useState } from "react";
import type {
  ChatContextKind,
  ChatMessage,
  ChatOpportunityResults,
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
  Copy,
  FileText,
  MapPin,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CompanionAvatar } from "./CompanionAvatar";

interface MessageListProps {
  messages: ChatMessage[];
  copiedMessageId?: string;
  onCopy: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onFeedback: (message: ChatMessage, feedback: "positive" | "negative") => void;
  onFollowUp: (prompt: string) => void;
  onOpenWorkspace: (kind: ChatContextKind) => void;
}

const followUps = [
  "把结论整理成今天可以完成的行动清单",
  "指出当前还缺少哪些关键信息",
  "基于我选中的材料给出可直接使用的修改稿"
] as const;

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
  copiedMessageId,
  onCopy,
  onRetry,
  onFeedback,
  onFollowUp,
  onOpenWorkspace
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const pinnedRef = useRef(true);
  const lastAssistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;

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
  }, [messages]);

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
      {messages.map((message, index) => {
        const messageContext = contextFor(index);
        const workspaceKinds = [...new Set(messageContext.map((item) => item.kind))];
        return (
          <article
            className={`message message--${message.role}`}
            key={message.id}
            aria-busy={message.status === "streaming"}
          >
            {message.role === "assistant" && (
              <CompanionAvatar className="assistant-avatar" size="small" />
            )}
            <div className="message-body">
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
              <div className="message-copy">
                {message.content ? (
                  message.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ node: _node, ...props }) => (
                          <a {...props} target="_blank" rel="noreferrer" />
                        )
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : message.content
                ) : message.status === "streaming" ? <ThinkingIndicator /> : null}
              </div>

              {message.opportunityResults && (
                <OpportunityResultCards results={message.opportunityResults} />
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
                    <button type="button" onClick={() => onCopy(message)}>
                      {copiedMessageId === message.id ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
                      {copiedMessageId === message.id ? "已复制" : "复制回答"}
                    </button>
                  )}
                  <button type="button" onClick={() => onRetry(message)}>
                    <RefreshCw aria-hidden="true" size={14} />再生成一版
                  </button>
                  {message.status === "complete" && (
                    <>
                      <span className="message-action-divider" aria-hidden="true" />
                      <button
                        type="button"
                        aria-pressed={message.feedback === "positive"}
                        onClick={() => onFeedback(message, "positive")}
                      >
                        <ThumbsUp aria-hidden="true" size={14} />有帮助
                      </button>
                      <button
                        type="button"
                        aria-pressed={message.feedback === "negative"}
                        onClick={() => onFeedback(message, "negative")}
                      >
                        <ThumbsDown aria-hidden="true" size={14} />没帮助
                      </button>
                    </>
                  )}
                </div>
              )}

              {message.id === lastAssistantId && message.status === "complete" && (
                <section className="answer-next-steps" aria-label="继续推进">
                  <span>继续推进</span>
                  <div>
                    {followUps.map((prompt) => <button type="button" key={prompt} onClick={() => onFollowUp(prompt)}>{prompt}</button>)}
                  </div>
                  {workspaceKinds.length > 0 && (
                    <div className="answer-workspace-actions">
                      {workspaceKinds.includes("resume") && (
                        <button type="button" onClick={() => onOpenWorkspace("resume")}>打开简历中心 <ArrowUpRight aria-hidden="true" size={13} /></button>
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
