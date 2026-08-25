import { useEffect, useRef } from "react";
import type { ChatMessage } from "@offerflow/domain";
import { Check, Copy, RefreshCw, Waypoints } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageListProps {
  messages: ChatMessage[];
  copiedMessageId?: string;
  onCopy: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
}

export function MessageList({ messages, copiedMessageId, onCopy, onRetry }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  return (
    <div className="message-list" aria-live="polite" aria-relevant="additions text">
      {messages.map((message) => (
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
              <div className="message-attachments">
                {message.attachments.map((attachment) => <span key={attachment.id}>{attachment.name}</span>)}
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
            {message.citations.length > 0 && (
              <section className="citation-list" aria-label="回答参考资料">
                <span>参考资料</span>
                <div>
                  {message.citations.map((citation, index) => (
                    citation.url ? (
                      <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer">
                        <i>{index + 1}</i><span>{citation.title}</span>
                      </a>
                    ) : (
                      <span className="citation-card" key={citation.id} title={citation.excerpt}>
                        <i>{index + 1}</i><span>{citation.title}</span>
                      </span>
                    )
                  ))}
                </div>
              </section>
            )}
            {message.role === "assistant" && message.status !== "streaming" && message.content && (
              <div className="message-actions" aria-label="回答操作">
                <button type="button" onClick={() => onCopy(message)}>
                  {copiedMessageId === message.id ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
                  {copiedMessageId === message.id ? "已复制" : "复制"}
                </button>
                <button type="button" onClick={() => onRetry(message)}>
                  <RefreshCw aria-hidden="true" size={14} />重新生成
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <span className="thinking-indicator" aria-label="正在生成回答">
      <i /><i /><i />
    </span>
  );
}
