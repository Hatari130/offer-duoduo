import { useEffect, useRef, useState } from "react";
import type { ChatContextOption, ChatContextReference } from "@offerflow/domain";
import { BriefcaseBusiness, FileText, Mic2, Plus, Search, X } from "lucide-react";

interface ChatContextPickerProps {
  options: ChatContextOption[];
  selected: ChatContextReference[];
  loading?: boolean;
  onChange: (next: ChatContextReference[]) => void;
}

const kindLabels = {
  application: "投递记录",
  resume: "简历版本",
  interview: "面试记录"
} as const;

const kindIcons = {
  application: BriefcaseBusiness,
  resume: FileText,
  interview: Mic2
} as const;

export function ChatContextPicker({ options, selected, loading, onChange }: ChatContextPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = (option: ChatContextOption) => {
    const exists = selected.some((item) => item.kind === option.kind && item.id === option.id);
    if (exists) {
      onChange(selected.filter((item) => !(item.kind === option.kind && item.id === option.id)));
      return;
    }
    if (selected.length >= 4) return;
    onChange([...selected, option]);
  };
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.description || ""}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="chat-context" ref={shellRef}>
      <div className="chat-context-row">
        <span className="chat-context-label">本轮参考</span>
        <div className="chat-context-chips">
          {selected.map((item) => (
            <span className="chat-context-chip" key={`${item.kind}:${item.id}`}>
              <span>{item.label}</span>
              <button
                type="button"
                aria-label={`移除参考资料 ${item.label}`}
                onClick={() => onChange(selected.filter((candidate) => candidate !== item))}
              >
                <X aria-hidden="true" size={12} />
              </button>
            </span>
          ))}
          {!selected.length && <span className="chat-context-empty">尚未选择个人材料</span>}
        </div>
        <button
          className="chat-context-trigger"
          type="button"
          aria-expanded={open}
          aria-controls="chat-context-popover"
          onClick={() => setOpen((current) => !current)}
        >
          <Plus aria-hidden="true" size={14} />
          选择材料
        </button>
      </div>

      {open && (
        <section className="chat-context-popover" id="chat-context-popover" aria-labelledby="chat-context-title">
          <header>
            <div>
              <h2 id="chat-context-title">选择本轮参考资料</h2>
              <p>只读取你选中的个人材料，并结合通用求职知识回答。最多 4 项。</p>
            </div>
            <button type="button" aria-label="关闭资料选择" onClick={() => setOpen(false)}>
              <X aria-hidden="true" size={16} />
            </button>
          </header>

          {options.length > 6 && (
            <label className="chat-context-search">
              <span className="sr-only">搜索个人材料</span>
              <Search aria-hidden="true" size={15} />
              <input
                type="search"
                value={query}
                placeholder="搜索公司、岗位或简历"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          )}

          {loading ? (
            <p className="chat-context-state" role="status">正在读取可用资料…</p>
          ) : filteredOptions.length ? (
            <div className="chat-context-options">
              {(Object.keys(kindLabels) as Array<keyof typeof kindLabels>).map((kind) => {
                const items = filteredOptions.filter((item) => item.kind === kind);
                if (!items.length) return null;
                const Icon = kindIcons[kind];
                return (
                  <section key={kind} aria-labelledby={`chat-context-${kind}`}>
                    <h3 id={`chat-context-${kind}`}><Icon aria-hidden="true" size={14} />{kindLabels[kind]}</h3>
                    <div>
                      {items.map((item) => {
                        const checked = selected.some((candidate) => candidate.kind === item.kind && candidate.id === item.id);
                        const disabled = !checked && selected.length >= 4;
                        return (
                          <label className="chat-context-option" key={`${item.kind}:${item.id}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggle(item)}
                            />
                            <span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : options.length ? (
            <div className="chat-context-state">
              <strong>没有匹配的个人材料</strong>
              <span>换个公司、岗位或简历名称试试。</span>
            </div>
          ) : (
            <div className="chat-context-state">
              <strong>还没有可用的个人材料</strong>
              <span>先在简历中心、投递管理或面试记录中添加资料。</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
