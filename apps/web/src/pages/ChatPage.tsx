import { useEffect, useRef, useState } from "react";
import type {
  ChatAttachment,
  ChatContextOption,
  ChatContextReference,
  ChatConversation,
  ChatMessage
} from "@offerflow/domain";
import { DEFAULT_CHAT_COMPANION } from "@offerflow/domain";
import { ArrowRight, CalendarDays, Compass, MessageCircle, PanelTop, X } from "lucide-react";
import { api } from "../app/api";
import { useAuth } from "../app/AuthContext";
import { createUuid } from "../app/id";
import { navigate } from "../app/router";
import { ChatComposer } from "../features/chat/ChatComposer";
import { CompanionAvatar } from "../features/chat/CompanionAvatar";
import { ChatContextPicker } from "../features/chat/ChatContextPicker";
import { MessageList } from "../features/chat/MessageList";
import { chatPendingMode, type ChatPendingMode } from "../features/chat/pendingMode";

const recommendationCards = [
  {
    prompt: "帮我找适合我的校招岗位。目标方向：【岗位方向】，意向城市：【城市】，毕业年份：【年份】。",
    title: "找适合我的岗位",
    description: "从目标方向和意向城市开始",
    icon: Compass
  },
  {
    prompt: "帮我修改一段简历，保留真实经历。目标岗位：【岗位】，需要修改的原文：【粘贴经历，或选择已有简历材料】。",
    title: "改一段简历",
    description: "把你的经历写得更清楚",
    icon: PanelTop
  },
  {
    prompt: "陪我练习一道【目标岗位】的面试题。请先出题，等我回答后再给具体反馈。",
    title: "练一道面试题",
    description: "先试着回答，再一起完善",
    icon: MessageCircle
  },
  {
    prompt: "帮我安排本周的求职计划。目标岗位：【岗位】，当前进度：【准备或投递阶段】，本周可用时间：【时间】。",
    title: "安排本周求职",
    description: "把目标拆成几件做得到的事",
    icon: CalendarDays
  }
] as const;

export function ChatPage({ conversationId }: { conversationId?: string }) {
  const { status, requestLogin } = useAuth();
  const [conversation, setConversation] = useState<ChatConversation>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [taskHint, setTaskHint] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [contextOptions, setContextOptions] = useState<ChatContextOption[]>([]);
  const [selectedContext, setSelectedContext] = useState<ChatContextReference[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [streaming, setStreaming] = useState(false);
  const [pendingMode, setPendingMode] = useState<ChatPendingMode>();
  const [error, setError] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const abortRef = useRef<AbortController>();
  const justCreatedRef = useRef<string>();

  const prepareTask = (prompt: string) => {
    if (streaming) return;
    const next = draft.trim() ? `${draft}\n\n${prompt}` : prompt;
    setDraft(next);
    setTaskHint("已填入问题模板，补充括号里的内容后再发送。");
    window.requestAnimationFrame(() => {
      const input = document.getElementById("career-question") as HTMLTextAreaElement | null;
      if (!input) return;
      input.focus();
      const start = next.indexOf("【", next.length - prompt.length);
      if (start >= 0) input.setSelectionRange(start, next.indexOf("】", start) + 1);
      input.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  };

  useEffect(() => {
    if (!conversationId) {
      setConversation(undefined);
      setMessages([]);
      setLoading(false);
      return;
    }
    if (justCreatedRef.current === conversationId) {
      justCreatedRef.current = undefined;
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    api.chat
      .getConversation(conversationId)
      .then((result) => {
        if (!active) return;
        setConversation(result.conversation);
        setMessages(result.messages);
        const latestContext = [...result.messages].reverse().find((message) => message.role === "user")?.context;
        setSelectedContext(latestContext || []);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "无法载入对话");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const renamed = (event: Event) => {
      const updated = (event as CustomEvent<ChatConversation>).detail;
      if (updated?.id === conversation?.id) setConversation(updated);
    };
    window.addEventListener("offerflow:conversation-renamed", renamed);
    return () => window.removeEventListener("offerflow:conversation-renamed", renamed);
  }, [conversation?.id]);

  useEffect(() => {
    if (status === "anonymous") {
      setContextOptions([]);
      setSelectedContext([]);
      return;
    }
    let active = true;
    setContextLoading(true);
    api.chat.listContext()
      .then((result) => {
        if (!active) return;
        setContextOptions(result.contexts);
        setSelectedContext((current) => current.filter((selected) =>
          result.contexts.some((option) => option.kind === selected.kind && option.id === selected.id)
        ));
      })
      .catch(() => {
        if (active) setError("暂时无法读取个人材料，你仍然可以继续提问。");
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => { active = false; };
  }, [status]);

  const requireChatLogin = () => {
    if (status !== "anonymous") return true;
    requestLogin("登录后即可发送问题；你刚刚输入的内容会继续保留。");
    return false;
  };

  const consumeStream = async (
    stream: AsyncGenerator<import("@offerflow/contracts").ChatStreamEvent>,
    controller: AbortController
  ) => {
    for await (const event of stream) {
      if (event.type === "message.started") {
        setPendingMode(undefined);
        setMessages((current) => [...current, event.message]);
      } else if (event.type === "message.delta") {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? { ...message, content: `${message.content}${event.delta}` }
              : message
          )
        );
      } else if (event.type === "citation") {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? { ...message, citations: [...message.citations, event.citation] }
              : message
          )
        );
      } else if (event.type === "message.completed") {
        setMessages((current) =>
          current.map((message) => message.id === event.message.id ? event.message : message)
        );
      } else if (event.type === "error") {
        setError(event.error.message);
        setMessages((current) => current.map((message) =>
          message.status === "streaming" ? { ...message, status: "error" } : message
        ));
      }
    }
    if (controller.signal.aborted) {
      setMessages((current) => current.map((message) =>
        message.status === "streaming" ? { ...message, status: "stopped" } : message
      ));
    }
  };

  const send = async (suggested?: string) => {
    const content = (suggested ?? draft).trim();
    if (!content || streaming) return;
    if (!requireChatLogin()) {
      if (suggested) setDraft(content);
      return;
    }
    setError("");
    setStreaming(true);
    setPendingMode(chatPendingMode(content, messages));
    const controller = new AbortController();
    abortRef.current = controller;

    const clientMessageId = createUuid();
    let clientMessage: ChatMessage = {
      id: clientMessageId,
      conversationId: conversation?.id || `pending:${clientMessageId}`,
      role: "user",
      content,
      status: "complete",
      createdAt: new Date().toISOString(),
      attachments,
      context: selectedContext,
      citations: []
    };
    const appendMessage = () => {
      setMessages((current) => [...current, clientMessage]);
      setDraft("");
      setAttachments([]);
    };

    if (isEmpty && typeof document !== "undefined" && "startViewTransition" in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(appendMessage);
    } else {
      appendMessage();
    }

    try {
      let activeConversation = conversation;
      if (!activeConversation) {
        const created = await api.chat.createConversation();
        activeConversation = created.conversation;
        setConversation(activeConversation);
        justCreatedRef.current = activeConversation.id;
        navigate(`/app/chat/${encodeURIComponent(activeConversation.id)}`);
      }

      if (clientMessage.conversationId !== activeConversation.id) {
        clientMessage = { ...clientMessage, conversationId: activeConversation.id };
        setMessages((current) => current.map((message) =>
          message.id === clientMessage.id ? clientMessage : message
        ));
      }
      await consumeStream(
        api.chat.sendMessage(
          activeConversation.id,
          {
            content,
            clientMessageId: clientMessage.id,
            attachments: clientMessage.attachments,
            context: clientMessage.context
          },
          controller.signal
        ),
        controller
      );
      window.dispatchEvent(new Event("offerflow:conversation-updated"));
    } catch (requestError) {
      setMessages((current) => current.map((message) =>
        message.status === "streaming"
          ? { ...message, status: controller.signal.aborted ? "stopped" : "error" }
          : message
      ));
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : "回答生成失败，请重试");
      }
    } finally {
      setPendingMode(undefined);
      setStreaming(false);
      abortRef.current = undefined;
    }
  };

  const retry = async (message: ChatMessage) => {
    if (!conversation || streaming) return;
    if (!requireChatLogin()) return;
    setStreaming(true);
    setPendingMode(message.opportunityResults ? "opportunities" : "answer");
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await consumeStream(
        api.chat.retryMessage(
          conversation.id,
          message.id,
          { clientMessageId: createUuid() },
          controller.signal
        ),
        controller
      );
    } catch (requestError) {
      setMessages((current) => current.map((item) =>
        item.status === "streaming"
          ? { ...item, status: controller.signal.aborted ? "stopped" : "error" }
          : item
      ));
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : "暂时无法重新生成");
      }
    } finally {
      setPendingMode(undefined);
      setStreaming(false);
      abortRef.current = undefined;
    }
  };

  const copy = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(undefined), 1600);
    } catch {
      setError("无法复制回答，请手动选择文本。");
    }
  };

  const feedback = async (message: ChatMessage, value: "positive" | "negative") => {
    if (!conversation) return;
    try {
      const result = await api.chat.setMessageFeedback(conversation.id, message.id, { feedback: value });
      setMessages((current) => current.map((item) => item.id === message.id ? result.message : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法保存反馈");
    }
  };

  const contextPicker = status !== "anonymous" && (
    <ChatContextPicker
      options={contextOptions}
      selected={selectedContext}
      loading={contextLoading}
      onChange={setSelectedContext}
    />
  );

  if (loading) {
    return (
      <section className="chat-page chat-page--loading">
        <div className="thread-scroll">
          <div className="chat-skeleton" role="status">
            <span className="sr-only">正在载入对话…</span>
            <div className="chat-skeleton__row chat-skeleton__row--user">
              <span className="skel chat-skeleton__bubble" />
            </div>
            <div className="chat-skeleton__row">
              <span className="skel chat-skeleton__avatar" />
              <span className="skel chat-skeleton__line chat-skeleton__line--long" />
            </div>
            <div className="chat-skeleton__row">
              <span className="skel chat-skeleton__avatar" />
              <div className="chat-skeleton__lines">
                <span className="skel chat-skeleton__line" />
                <span className="skel chat-skeleton__line" />
                <span className="skel chat-skeleton__line chat-skeleton__line--short" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const isEmpty = messages.length === 0;
  return (
    <section className={`chat-page${isEmpty ? " chat-page--empty" : ""}`}>
      {isEmpty ? (
        <div className="chat-welcome">
          <div className="chat-atmosphere" aria-hidden="true">
            <div className="chat-atmosphere__mesh" />
            <div className="chat-atmosphere__orb chat-atmosphere__orb--primary" />
            <div className="chat-atmosphere__orb chat-atmosphere__orb--secondary" />
          </div>
          <div className="companion-hero-badge">
            <CompanionAvatar showPresence decorative />
            <span className="companion-hero-badge__label">
              <span className="companion-hero-badge__dot" aria-hidden="true" />
              <strong>{DEFAULT_CHAT_COMPANION.name}</strong> · {DEFAULT_CHAT_COMPANION.role}
            </span>
          </div>
          <h1 tabIndex={-1}>今天，我们先推进哪一步？</h1>
          <p>
            找岗位、改简历、练面试。小鲤陪你从眼前的一小步开始。
          </p>
          <ChatComposer
            value={draft}
            attachments={attachments}
            streaming={streaming}
            contextSlot={contextPicker}
            autoFocus
            onChange={setDraft}
            onAttachmentsChange={setAttachments}
            onAttachmentRequest={requireChatLogin}
            onAttachmentError={setError}
            onSubmit={() => void send()}
            onStop={() => abortRef.current?.abort()}
          />
          <section className="recommendation-section" aria-label={`${DEFAULT_CHAT_COMPANION.name}可以陪你`}>
            <header>
              <div>
                <span className="recommendation-label">从一件具体的事开始</span>
              </div>
            </header>
            <p className="task-entry-hint">选一个方向，补充后再发送</p>
            <div className="recommendation-grid">
              {recommendationCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    type="button"
                    className="chat-task-card"
                    key={card.prompt}
                    onClick={() => prepareTask(card.prompt)}
                    disabled={streaming}
                  >
                    <span className="chat-task-icon" aria-hidden="true"><Icon size={21} strokeWidth={1.7} /></span>
                    <span className="chat-task-copy">
                      <strong>{card.title}</strong>
                      <span>{card.description}</span>
                    </span>
                    <ArrowRight aria-hidden="true" size={16} />
                  </button>
                );
              })}
            </div>
            <span className="sr-only" role="status">{taskHint}</span>
          </section>
          <small className="chat-disclaimer">AI 回答可能不完整，重要招聘信息请以企业官方公告为准。</small>
        </div>
      ) : (
        <>
          <header className="thread-header">
            <div className="thread-header__companion">
              <CompanionAvatar showPresence decorative />
              <div className="thread-header__copy">
                <span className="thread-header__eyebrow">
                  <strong>{DEFAULT_CHAT_COMPANION.name}</strong>
                  <i>{DEFAULT_CHAT_COMPANION.role}</i>
                </span>
                <h1 tabIndex={-1}>{conversation?.title || "求职对话"}</h1>
              </div>
            </div>
            <button type="button" onClick={() => navigate("/app/chat")}>开始新对话</button>
          </header>
          <div className="thread-scroll">
            <MessageList
              messages={messages}
              pendingMode={pendingMode}
              copiedMessageId={copiedMessageId}
              onCopy={copy}
              onRetry={retry}
              onFeedback={feedback}
              onFollowUp={(prompt) => void send(prompt)}
              onOpenWorkspace={(kind) => navigate(kind === "resume" ? "/app/resumes" : "/app/applications")}
            />
          </div>
          <div className="thread-composer">
            <ChatComposer
              value={draft}
              attachments={attachments}
              streaming={streaming}
              contextSlot={contextPicker}
              onChange={setDraft}
              onAttachmentsChange={setAttachments}
              onAttachmentRequest={requireChatLogin}
              onAttachmentError={setError}
              onSubmit={() => void send()}
              onStop={() => abortRef.current?.abort()}
            />
            <small>回答会标出使用过的资料；重要招聘信息仍请以企业官方公告为准。</small>
          </div>
        </>
      )}
      <div className="chat-status" role="alert" aria-atomic="true">
        {error && <><span>{error}</span><button type="button" aria-label="关闭提示" onClick={() => setError("")}><X aria-hidden="true" size={14} /></button></>}
      </div>
    </section>
  );
}
