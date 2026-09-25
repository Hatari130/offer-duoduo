import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ChatAttachment } from "@offerflow/domain";
import { ArrowUp, FileText, Image, LoaderCircle, Paperclip, Square, X } from "lucide-react";
import { createUuid } from "../../app/id";
import { extractPdfAttachmentText } from "./pdfAttachment";
import { CHAT_FILE_ACCEPT, extractedAttachment, validateAttachmentFile } from "./attachments";
import { MAX_CHAT_ATTACHMENTS } from "@offerflow/contracts";

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
  onRecognizeFile: (file: File, signal: AbortSignal) => Promise<{ text: string }>;
  onProcessingChange: (processing: boolean) => void;
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
  onRecognizeFile,
  onProcessingChange,
  onSubmit,
  onStop
}: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState("");
  const processingRef = useRef<AbortController>();

  useEffect(() => () => {
    processingRef.current?.abort();
    onProcessingChange(false);
  }, [onProcessingChange]);

  useEffect(() => {
    if (!attachments.length && !processingRef.current) setProgress("");
  }, [attachments.length]);

  useLayoutEffect(() => {
    if (textareaRef.current) fitTextarea(textareaRef.current);
  }, [value]);

  const addFiles = async (files: File[]) => {
    if (!files.length || processingRef.current || streaming) return;
    if (onAttachmentRequest && !onAttachmentRequest()) return;
    if (files.length + attachments.length > MAX_CHAT_ATTACHMENTS) {
      onAttachmentError?.("每条消息最多添加 2 个附件，请移除一个后再试。");
      return;
    }
    const controller = new AbortController();
    processingRef.current = controller;
    setParsing(true);
    onProcessingChange(true);
    onAttachmentError?.("");
    try {
      const mimeTypes = files.map(validateAttachmentFile);
      const next: ChatAttachment[] = [];
      for (const [index, file] of files.entries()) {
        if (controller.signal.aborted) return;
        const mimeType = mimeTypes[index];
        setProgress(`正在读取「${file.name}」…`);
        let content: string;
        const recognize = async () => {
          controller.signal.throwIfAborted();
          setProgress(`正在识别「${file.name}」中的文字…`);
          return (await onRecognizeFile(new File([file], file.name, { type: mimeType }), controller.signal)).text;
        };
        if (mimeType.startsWith("image/")) {
          content = await recognize();
        } else if (mimeType === "application/pdf") {
          try {
            content = await extractPdfAttachmentText(await file.arrayBuffer());
          } catch (error) {
            if (error instanceof Error && error.message === "PDF_NEEDS_OCR") content = await recognize();
            else throw new Error("PDF 解析失败，请确认文件完整且未加密后重试。");
          }
        } else {
          content = await file.text();
        }
        next.push(extractedAttachment(file, mimeType, content, createUuid()));
      }
      if (controller.signal.aborted) return;
      onAttachmentsChange([...attachments, ...next]);
      setProgress(`已读取 ${next.length} 个附件，可以发送了。`);
    } catch (error) {
      if (controller.signal.aborted) return;
      setProgress("");
      onAttachmentError?.(error instanceof Error ? error.message : "附件读取失败，请重试。");
    } finally {
      if (processingRef.current === controller) {
        processingRef.current = undefined;
        if (!controller.signal.aborted) setParsing(false);
        onProcessingChange(false);
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if ((value.trim() || attachments.length) && !streaming && !processingRef.current) onSubmit();
    }
  };

  return (
    <div className="composer-shell"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        void addFiles([...event.dataTransfer.files]);
      }}
    >
      {attachments.length > 0 && (
        <div className="composer-attachments" aria-label="待发送附件">
          {attachments.map((attachment) => (
            <span className="attachment-chip" key={attachment.id}>
              {attachment.mimeType.startsWith("image/") ? <Image aria-hidden="true" size={14} /> : <FileText aria-hidden="true" size={14} />}
              <span>{attachment.name}</span>
              <button
                type="button"
                aria-label={`移除 ${attachment.name}`}
                disabled={parsing || streaming}
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
        onPaste={(event) => {
          const files = [...event.clipboardData.items]
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
          if (!files.length) return;
          // Preserve ordinary text paste, including a clipboard containing both text and an image.
          if (!event.clipboardData.getData("text/plain")) event.preventDefault();
          void addFiles(files);
        }}
        aria-describedby="chat-attachment-help"
        placeholder="说说你想推进什么，也可以粘贴岗位描述或截图。"
      />
      <div className="composer-toolbar">
        <div className="composer-material-actions">
          <input
            ref={fileRef}
            hidden
            type="file"
            multiple
            accept={CHAT_FILE_ACCEPT}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              void addFiles(files);
            }}
          />
          <button
            className="composer-upload-button"
            type="button"
            aria-label="上传文件或截图"
            title="TXT / Markdown ≤200 KB；PDF / PNG / JPG / WebP ≤8 MB，最多 2 个附件"
            onClick={() => {
              if (onAttachmentRequest && !onAttachmentRequest()) return;
              fileRef.current?.click();
            }}
            disabled={attachments.length >= MAX_CHAT_ATTACHMENTS || parsing || streaming}
          >
            {parsing ? (
              <LoaderCircle className="spin" aria-hidden="true" size={18} strokeWidth={1.7} />
            ) : (
              <Paperclip aria-hidden="true" size={18} strokeWidth={1.7} />
            )}
            <span>上传文件</span>
          </button>
          {contextSlot}
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
            disabled={(!value.trim() && !attachments.length) || parsing}
            aria-label="发送问题"
          >
            <ArrowUp aria-hidden="true" size={19} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <p id="chat-attachment-help" className="composer-attachment-help">支持文档和截图，可粘贴或拖入。仅保留提取文字，不保存原文件。</p>
      <div className="composer-attachment-progress" role="status" aria-atomic="true">{progress}</div>
      {parsing && <button className="composer-cancel-upload" type="button" onClick={() => {
        processingRef.current?.abort();
        processingRef.current = undefined;
        setParsing(false);
        onProcessingChange(false);
        setProgress("已取消读取附件。");
      }}>取消读取</button>}
    </div>
  );
}
