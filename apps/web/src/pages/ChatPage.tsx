import { useEffect, useRef, useState } from "react";
import type { ChatAttachment, ChatConversation, ChatMessage } from "@offerflow/domain";
import { CAREER_CHAT_SUGGESTIONS } from "@offerflow/domain";
import { Compass, FileSearch, PanelTop, Sparkles } from "lucide-react";
import { api } from "../app/api";
import { useAuth } from "../app/AuthContext";
import { navigate } from "../app/router";
import { ChatComposer } from "../features/chat/ChatComposer";
import { MessageList } from "../features/chat/MessageList";

export function ChatPage({ conversationId }: { conversationId?: string }) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ChatConversation>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
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
      }
    }
    if (controller.signal.aborted) {
      setMessages((current) => current.map((message) =>
        message.status === "streaming" ? { ...message, status: "complete" } : message
      ));
    }
  };

  const send = async (suggested?: string) => {
    const content = (suggested ?? draft).trim();
    if (!content || streaming) return;
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
        id: crypto.randomUUID(),
        conversationId: activeConversation.id,
        role: "user",
        content,
        status: "complete",
        createdAt: new Date().toISOString(),
        attachments,
        citations: []
      };
      setMessages((current) => [...current, clientMessage]);
      setDraft("");
      setAttachments([]);
      await consumeStream(
        api.chat.sendMessage(
          activeConversation.id,
          { content, clientMessageId: clientMessage.id, attachments: clientMessage.attachments },
          controller.signal
        ),
        controller
      );
      window.dispatchEvent(new Event("offerflow:conversation-updated"));
    } catch (requestError) {
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
    setStreaming(true);
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await consumeStream(
        api.chat.retryMessage(
          conversation.id,
          message.id,
          { clientMessageId: crypto.randomUUID() },
          controller.signal
        ),
        controller
      );
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : "暂时无法重新生成");
      }
    } finally {
      setStreaming(false);
      abortRef.current = undefined;
    }
  };

  const copy = async (message: ChatMessage) => {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(undefined), 1600);
  };

  if (loading) {
    return <div className="page-loading" role="status"><span className="loading-orbit" /><span>正在载入对话…</span></div>;
  }

  const isEmpty = messages.length === 0;
  return (
    <section className={`chat-page${isEmpty ? " chat-page--empty" : ""}`}>
      {isEmpty ? (
        <div className="chat-welcome">
          <div className="welcome-kicker"><Sparkles aria-hidden="true" size={15} />OfferFlow 求职助手</div>
          <h1 tabIndex={-1}>今天想先解决哪一步？</h1>
          <p>聊岗位、改经历、做规划。回答会优先检索你的求职知识库，并标出参考来源。</p>
          <ChatComposer
            value={draft}
            attachments={attachments}
            streaming={streaming}
            autoFocus
            onChange={setDraft}
            onAttachmentsChange={setAttachments}
            onSubmit={() => void send()}
            onStop={() => abortRef.current?.abort()}
          />
          <div className="suggestion-grid" aria-label="常用问题">
            {CAREER_CHAT_SUGGESTIONS.map((suggestion, index) => {
              const Icon = [Compass, PanelTop, FileSearch, Sparkles][index];
              return (
                <button type="button" key={suggestion} onClick={() => void send(suggestion)}>
                  <Icon aria-hidden="true" size={17} />
                  <span>{suggestion}</span>
                </button>
              );
            })}
          </div>
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
            <MessageList messages={messages} copiedMessageId={copiedMessageId} onCopy={copy} onRetry={retry} />
          </div>
          <div className="thread-composer">
            <ChatComposer
              value={draft}
              attachments={attachments}
              streaming={streaming}
              onChange={setDraft}
              onAttachmentsChange={setAttachments}
              onSubmit={() => void send()}
              onStop={() => abortRef.current?.abort()}
            />
            <small>AI 回答可能不完整，请核对重要信息。</small>
          </div>
        </>
      )}
      <div className="chat-status" role={error ? "alert" : "status"}>{error}</div>
    </section>
  );
}
