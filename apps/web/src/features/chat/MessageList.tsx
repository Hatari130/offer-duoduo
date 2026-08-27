import { useEffect, useId, useRef, useState } from "react";
import type { ChatContextKind, ChatMessage, KnowledgeCitation } from "@offerflow/domain";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Waypoints,
  X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const lastAssistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ block: "end", behavior: reducedMotion ? "auto" : "smooth" });
  }, [messages]);

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
              <div className="assistant-avatar" aria-hidden="true"><Waypoints size={16} /></div>
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

              {message.status === "error" && (
                <p className="message-generation-state is-error">回答没有生成完成。检查网络后再生成一版。</p>
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
    </div>
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
    <span className="thinking-indicator" aria-label="正在生成回答">
      <i /><i /><i />
    </span>
  );
}
