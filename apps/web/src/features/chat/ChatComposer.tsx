import { useRef, type ChangeEvent, type KeyboardEvent } from "react";
import type { ChatAttachment } from "@offerflow/domain";
import { ArrowUp, FileText, Paperclip, Square, X } from "lucide-react";

interface ChatComposerProps {
  value: string;
  attachments: ChatAttachment[];
  streaming: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onAttachmentsChange: (attachments: ChatAttachment[]) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function ChatComposer({
  value,
  attachments,
  streaming,
  autoFocus,
  onChange,
  onAttachmentsChange,
  onSubmit,
  onStop
}: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const next = [...(event.target.files ?? [])].slice(0, 4 - attachments.length).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size
    }));
    onAttachmentsChange([...attachments, ...next]);
    event.target.value = "";
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (value.trim() && !streaming) onSubmit();
    }
  };

  return (
    <div className="composer-shell">
      {attachments.length > 0 && (
        <div className="composer-attachments" aria-label="待发送附件">
          {attachments.map((attachment) => (
            <span className="attachment-chip" key={attachment.id}>
              <FileText aria-hidden="true" size={14} />
              <span>{attachment.name}</span>
              <button
                type="button"
                aria-label={`移除 ${attachment.name}`}
                onClick={() => onAttachmentsChange(attachments.filter((item) => item.id !== attachment.id))}
              >
                <X aria-hidden="true" size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <label className="sr-only" htmlFor="career-question">输入求职问题</label>
      <textarea
        id="career-question"
        autoFocus={autoFocus}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="描述你的目标、经历或正在卡住的问题…"
      />
      <div className="composer-toolbar">
        <div>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,image/*"
            onChange={addFiles}
          />
          <button
            className="composer-icon-button"
            type="button"
            aria-label="添加附件"
            onClick={() => fileRef.current?.click()}
            disabled={attachments.length >= 4}
          >
            <Paperclip aria-hidden="true" size={18} strokeWidth={1.7} />
          </button>
          <span className="composer-hint">Enter 发送 · Shift + Enter 换行</span>
        </div>
        {streaming ? (
          <button className="composer-send is-stop" type="button" onClick={onStop} aria-label="停止生成">
            <Square aria-hidden="true" size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            className="composer-send"
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            aria-label="发送问题"
          >
            <ArrowUp aria-hidden="true" size={19} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}
