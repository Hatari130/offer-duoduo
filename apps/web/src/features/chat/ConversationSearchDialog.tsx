import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ChatConversation } from "@offerflow/domain";
import { MessageSquare, Plus, Search } from "lucide-react";
import {
  formatConversationTime,
  groupConversations,
  highlightParts,
  searchConversations,
  searchTerms
} from "./conversationHistory";

type Option =
  | { kind: "new"; id: "new" }
  | { kind: "conversation"; id: string; conversation: ChatConversation; snippet?: string; group?: string };

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightParts(text, terms).map((part, index) => (part.hit ? <mark key={index}>{part.text}</mark> : <Fragment key={index}>{part.text}</Fragment>))}
    </>
  );
}

/**
 * Command-palette search over chat history (ChatGPT/Claude style): empty query lists
 * recent chats by date, typing filters title and last message, ↑↓ + Enter open a result.
 */
export function ConversationSearchDialog({
  open,
  conversations,
  pinnedIds,
  now,
  onClose,
  onOpenConversation,
  onNewChat
}: {
  open: boolean;
  conversations: ChatConversation[];
  pinnedIds: ReadonlySet<string>;
  now: number;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
  onNewChat: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const terms = useMemo(() => searchTerms(query), [query]);

  const options = useMemo<Option[]>(() => {
    if (terms.length) {
      return searchConversations(conversations, query).map(({ conversation, snippet }) => ({
        kind: "conversation",
        id: conversation.id,
        conversation,
        snippet
      }));
    }
    const grouped = groupConversations(conversations, pinnedIds, now).flatMap((group) =>
      group.conversations.map((conversation, index) => ({
        kind: "conversation" as const,
        id: conversation.id,
        conversation,
        group: index === 0 ? group.label : undefined
      }))
    );
    return [{ kind: "new", id: "new" }, ...grouped];
  }, [conversations, now, pinnedIds, query, terms.length]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery("");
      setActiveIndex(0);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (option: Option | undefined) => {
    if (!option) return;
    onClose();
    if (option.kind === "new") onNewChat();
    else onOpenConversation(option.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (options.length ? (index + 1) % options.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (options.length ? (index - 1 + options.length) % options.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[activeIndex]);
    }
  };

  const activeOption = options[activeIndex];

  return (
    <dialog
      ref={dialogRef}
      className="conversation-search"
      aria-label="搜索对话"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="conversation-search__field">
        <Search aria-hidden="true" size={18} />
        {/* showModal() focuses this input, the first focusable element. */}
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="conversation-search-results"
          aria-activedescendant={activeOption ? `conversation-search-option-${activeOption.id}` : undefined}
          aria-autocomplete="list"
          placeholder="搜索对话标题或内容…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>

      <div className="conversation-search__results" id="conversation-search-results" role="listbox" aria-label="对话" ref={listRef}>
        {options.map((option, index) => (
          <Fragment key={option.id}>
            {option.kind === "conversation" && option.group && (
              <div className="conversation-search__group" role="presentation">{option.group}</div>
            )}
            <div
              id={`conversation-search-option-${option.id}`}
              role="option"
              aria-selected={index === activeIndex}
              data-index={index}
              className={`conversation-search__option${index === activeIndex ? " is-active" : ""}`}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {option.kind === "new" ? (
                <>
                  <Plus aria-hidden="true" size={17} />
                  <span className="conversation-search__title">新对话</span>
                </>
              ) : (
                <>
                  <MessageSquare aria-hidden="true" size={16} />
                  <span className="conversation-search__copy">
                    <span className="conversation-search__title"><Highlighted text={option.conversation.title} terms={terms} /></span>
                    {option.snippet && (
                      <span className="conversation-search__snippet"><Highlighted text={option.snippet} terms={terms} /></span>
                    )}
                  </span>
                  <time dateTime={option.conversation.updatedAt}>{formatConversationTime(option.conversation.updatedAt, now)}</time>
                </>
              )}
            </div>
          </Fragment>
        ))}
        {terms.length > 0 && options.length === 0 && (
          <p className="conversation-search__empty">没有找到包含「{query.trim()}」的对话</p>
        )}
        {terms.length === 0 && conversations.length === 0 && (
          <p className="conversation-search__empty">还没有对话。开始第一次求职对话吧。</p>
        )}
      </div>
    </dialog>
  );
}
