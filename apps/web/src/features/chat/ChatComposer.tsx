import { useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import type { ChatAttachment } from "@offerflow/domain";
import { ArrowUp, FileText, Paperclip, Square, X } from "lucide-react";
import { createUuid } from "../../app/id";

interface ChatComposerProps {
  value: string;
  attachments: ChatAttachment[];
  streaming: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onAttachmentsChange: (attachments: ChatAttachment[]) => void;
  onAttachmentRequest?: () => boolean;
  onAttachmentError?: (message: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

function fitTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight);
  const availableHeight = Number.isFinite(maxHeight) ? maxHeight : textarea.scrollHeight;
  textarea.style.height = `${Math.min(textarea.scrollHeight, availableHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > availableHeight ? "auto" : "hidden";
}

export function ChatComposer({
  value,
  attachments,
  streaming,
  autoFocus,
  onChange,
  onAttachmentsChange,
  onAttachmentRequest,
  onAttachmentError,
  onSubmit,
  onStop
}: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (textareaRef.current) fitTextarea(textareaRef.current);
  }, [value]);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].slice(0, 2 - attachments.length);
    event.target.value = "";
    const invalid = files.find((file) => !/\.(?:txt|md)$/i.test(file.name) || file.size > 200_000);
    if (invalid) {
      onAttachmentError?.("请选择不超过 200 KB 的 TXT 或 Markdown 文件。");
      return;
    }
    const next = await Promise.all(files.map(async (file) => ({
      id: createUuid(),
      name: file.name,
      mimeType: /\.md$/i.test(file.name) ? "text/markdown" : "text/plain",
      size: file.size,
      content: await file.text()
    })));
    onAttachmentError?.("");
    onAttachmentsChange([...attachments, ...next]);
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
        ref={textareaRef}
        id="career-question"
        autoFocus={autoFocus}
        rows={1}
        value={value}
        onChange={(event) => {
          fitTextarea(event.target);
          onChange(event.target.value);
        }}
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
            accept=".txt,.md,text/plain,text/markdown"
            onChange={(event) => void addFiles(event)}
          />
          <button
            className="composer-icon-button"
            type="button"
            aria-label="添加 TXT 或 Markdown 资料"
            title="添加 TXT 或 Markdown 资料（每份不超过 200 KB）"
            onClick={() => {
              if (onAttachmentRequest && !onAttachmentRequest()) return;
              fileRef.current?.click();
            }}
            disabled={attachments.length >= 2}
          >
            <Paperclip aria-hidden="true" size={18} strokeWidth={1.7} />
          </button>
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
