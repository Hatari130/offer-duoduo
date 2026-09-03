import { useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ChatAttachment } from "@offerflow/domain";
import { ArrowUp, FileText, LoaderCircle, Paperclip, Square, X } from "lucide-react";
import { createUuid } from "../../app/id";
import { extractPdfAttachmentText, MAX_PDF_ATTACHMENT_BYTES } from "./pdfAttachment";

interface ChatComposerProps {
  value: string;
  attachments: ChatAttachment[];
  streaming: boolean;
  autoFocus?: boolean;
  contextSlot?: ReactNode;
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
  contextSlot,
  onChange,
  onAttachmentsChange,
  onAttachmentRequest,
  onAttachmentError,
  onSubmit,
  onStop
}: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [parsing, setParsing] = useState(false);

  useLayoutEffect(() => {
    if (textareaRef.current) fitTextarea(textareaRef.current);
  }, [value]);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].slice(0, 2 - attachments.length);
    event.target.value = "";
    const invalid = files.find((file) =>
      /\.pdf$/i.test(file.name)
        ? file.size > MAX_PDF_ATTACHMENT_BYTES
        : !/\.(?:txt|md)$/i.test(file.name) || file.size > 200_000
    );
    if (invalid) {
      onAttachmentError?.("请选择不超过 200 KB 的 TXT / Markdown，或不超过 8 MB 的 PDF 文件。");
      return;
    }
    setParsing(true);
    try {
      const next = await Promise.all(
        files.map(async (file): Promise<ChatAttachment> => {
          if (/\.pdf$/i.test(file.name)) {
            const content = await extractPdfAttachmentText(await file.arrayBuffer());
            if (!content.trim()) throw new Error("empty-pdf");
            return {
              id: createUuid(),
              name: file.name,
              mimeType: "application/pdf",
              size: file.size,
              content
            };
          }
          return {
            id: createUuid(),
            name: file.name,
            mimeType: /\.md$/i.test(file.name) ? "text/markdown" : "text/plain",
            size: file.size,
            content: await file.text()
          };
        })
      );
      onAttachmentError?.("");
      onAttachmentsChange([...attachments, ...next]);
    } catch {
      onAttachmentError?.("PDF 解析失败，请确认文件完整未加密后重试。");
    } finally {
      setParsing(false);
    }
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
      {contextSlot && <div className="composer-context-strip">{contextSlot}</div>}
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
      <label className="sr-only" htmlFor="career-question">告诉小鲤你想推进什么</label>
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
        placeholder="跟小鲤说说你想推进什么，或哪里卡住了…"
      />
      <div className="composer-toolbar">
        <div>
          <input
            ref={fileRef}
            hidden
            type="file"
            multiple
            accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
            onChange={(event) => void addFiles(event)}
          />
          <button
            className="composer-icon-button"
            type="button"
            aria-label={parsing ? "正在解析附件" : "添加 TXT、Markdown 或 PDF 资料"}
            title={parsing ? "正在解析附件…" : "添加 TXT / Markdown（≤200 KB）或 PDF（≤8 MB）资料"}
            onClick={() => {
              if (onAttachmentRequest && !onAttachmentRequest()) return;
              fileRef.current?.click();
            }}
            disabled={attachments.length >= 2 || parsing}
          >
            {parsing ? (
              <LoaderCircle className="spin" aria-hidden="true" size={18} strokeWidth={1.7} />
            ) : (
              <Paperclip aria-hidden="true" size={18} strokeWidth={1.7} />
            )}
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
