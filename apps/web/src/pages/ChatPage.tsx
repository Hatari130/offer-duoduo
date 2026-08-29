import { useEffect, useRef, useState } from "react";
import type {
  ChatAttachment,
  ChatContextOption,
  ChatContextReference,
  ChatConversation,
  ChatMessage
} from "@offerflow/domain";
import { CAREER_CHAT_SUGGESTIONS } from "@offerflow/domain";
import { ArrowRight, Compass, FileSearch, PanelTop, ScanSearch, Sparkles, X } from "lucide-react";
import { api } from "../app/api";
import { useAuth } from "../app/AuthContext";
import { createUuid } from "../app/id";
import { navigate } from "../app/router";
import { ChatComposer } from "../features/chat/ChatComposer";
import { ChatContextPicker } from "../features/chat/ChatContextPicker";
import { MessageList } from "../features/chat/MessageList";

const recommendationCards = [
  {
    prompt: CAREER_CHAT_SUGGESTIONS[0],
    tag: "秋招规划",
    title: "把秋招拆成一张可执行时间表",
    description: "根据目标岗位和当前进度，明确每周重点。",
    icon: Compass,
    tone: "sky"
  },
  {
    prompt: CAREER_CHAT_SUGGESTIONS[1],
    tag: "简历提升",
    title: "让项目经历更有说服力",
    description: "用成果、行动和证据重写项目表达。",
    icon: PanelTop,
    tone: "sand"
  },
  {
    prompt: CAREER_CHAT_SUGGESTIONS[2],
    tag: "面试准备",
    title: "拆解职业规划类高频问题",
    description: "得到回答结构、追问方向和练习建议。",
    icon: FileSearch,
    tone: "mint"
  },
  {
    prompt: CAREER_CHAT_SUGGESTIONS[3],
    tag: "岗位分析",
    title: "从岗位描述提炼准备重点",
    description: "识别核心能力、关键词和经验缺口。",
    icon: ScanSearch,
    tone: "lilac"
  }
] as const;

export function ChatPage({ conversationId }: { conversationId?: string }) {
  const { status, requestLogin } = useAuth();
  const [conversation, setConversation] = useState<ChatConversation>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [contextOptions, setContextOptions] = useState<ChatContextOption[]>([]);
  const [selectedContext, setSelectedContext] = useState<ChatContextReference[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const abortRef = useRef<AbortController>();
  const justCreatedRef = useRef<string>();

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
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let activeConversation = conversation;
      if (!activeConversation) {
        const created = await api.chat.createConversation();
        activeConversation = created.conversation;
        setConversation(activeConversation);
        justCreatedRef.current = activeConversation.id;
        navigate(`/app/chat/${encodeURIComponent(activeConversation.id)}`);
      }

      const clientMessage: ChatMessage = {
        id: createUuid(),
        conversationId: activeConversation.id,
        role: "user",
        content,
        status: "complete",
        createdAt: new Date().toISOString(),
        attachments,
        context: selectedContext,
        citations: []
      };
      setMessages((current) => [...current, clientMessage]);
      setDraft("");
      setAttachments([]);
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
      setStreaming(false);
      abortRef.current = undefined;
    }
  };

  const retry = async (message: ChatMessage) => {
    if (!conversation || streaming) return;
    if (!requireChatLogin()) return;
    setStreaming(true);
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
            <i /><i /><i /><i /><i /><i />
          </div>
          <h1 tabIndex={-1}>今天想先解决哪一步？</h1>
          <p>
            聊岗位、改简历、做规划，优先检索你的求职知识库，帮你更快拿到 offer
            <Sparkles className="welcome-subtitle-spark" aria-hidden="true" size={17} />
          </p>
          {contextPicker}
          <ChatComposer
            value={draft}
            attachments={attachments}
            streaming={streaming}
            autoFocus
            onChange={setDraft}
            onAttachmentsChange={setAttachments}
            onAttachmentRequest={requireChatLogin}
            onAttachmentError={setError}
            onSubmit={() => void send()}
            onStop={() => abortRef.current?.abort()}
          />
          <section className="recommendation-section" aria-label="为你推荐">
            <header>
              <div>
                <span className="recommendation-label"><Compass aria-hidden="true" size={14} />为你推荐</span>
              </div>
            </header>
            <div className="recommendation-grid">
              {recommendationCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    type="button"
                    className="recommendation-card"
                    data-tone={card.tone}
                    key={card.prompt}
                    onClick={() => void send(card.prompt)}
                  >
                    <span className="recommendation-visual" aria-hidden="true">
                      <Icon size={22} />
                      <i /><i />
                    </span>
                    <span className="recommendation-tag">{card.tag}</span>
                    <strong>{card.title}</strong>
                    <small>{card.description}</small>
                    <span className="recommendation-action">开始提问 <ArrowRight aria-hidden="true" size={14} /></span>
                  </button>
                );
              })}
            </div>
          </section>
          <small className="chat-disclaimer">AI 回答可能不完整，重要招聘信息请以企业官方公告为准。</small>
        </div>
      ) : (
        <>
          <header className="thread-header">
            <div>
              <span>求职助手</span>
              <h1 tabIndex={-1}>{conversation?.title || "求职对话"}</h1>
            </div>
            <button type="button" onClick={() => navigate("/app/chat")}>开始新对话</button>
          </header>
          <div className="thread-scroll">
            <MessageList
              messages={messages}
              copiedMessageId={copiedMessageId}
              onCopy={copy}
              onRetry={retry}
              onFeedback={feedback}
              onFollowUp={(prompt) => void send(prompt)}
              onOpenWorkspace={(kind) => navigate(kind === "resume" ? "/app/resumes" : "/app/applications")}
            />
          </div>
          <div className="thread-composer">
            {contextPicker}
            <ChatComposer
              value={draft}
              attachments={attachments}
              streaming={streaming}
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
