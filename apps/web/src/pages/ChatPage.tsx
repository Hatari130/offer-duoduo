import { useEffect, useRef, useState } from "react";
import type { ChatAgentProfile } from "@offerflow/contracts";
import { MAX_TEAM_SKILLS } from "@offerflow/contracts";
import type {
  ChatAgentExpert,
  ChatAgentName,
  JobApplication,
  ChatAgentRun,
  ChatAttachment,
  ChatContextOption,
  ChatContextReference,
  ChatConversation,
  ChatMessage,
  CustomSkill,
  CustomSkillDraft
} from "@offerflow/domain";
import { COMPANION_AGENT, DEFAULT_CHAT_COMPANION } from "@offerflow/domain";
import { ChevronRight, Store, X } from "lucide-react";
import { api } from "../app/api";
import { useAuth } from "../app/AuthContext";
import { createUuid } from "../app/id";
import { navigate } from "../app/router";
import { ExpertAvatar } from "../features/agents/skillMeta";
import { SkillMarket } from "../features/agents/SkillMarket";
import { TeamDialog } from "../features/agents/TeamDialog";
import { TeamGallery } from "../features/agents/TeamGallery";
import { ChatComposer } from "../features/chat/ChatComposer";
import { CompanionAvatar } from "../features/chat/CompanionAvatar";
import { ChatContextPicker } from "../features/chat/ChatContextPicker";
import { MessageList } from "../features/chat/MessageList";
import { preloadMarkdown } from "../features/chat/Markdown";
import { TodayBrief, type BriefAction } from "../features/chat/TodayBrief";
import { chatPendingMode, type ChatPendingMode } from "../features/chat/pendingMode";

function withAgentRun(message: ChatMessage, team: ChatAgentName, update: (run: ChatAgentRun) => ChatAgentRun): ChatMessage {
  const run = message.agentRun ?? { agent: team, steps: [], rewrites: [], trace: [] };
  return { ...message, agentRun: update(run) };
}

/** The last turn of an invited team. The default agent's turns do not tie the conversation to a team. */
function lastAgentRun(messages: ChatMessage[]): (ChatAgentRun & { agent: ChatAgentName }) | undefined {
  const run = [...messages].reverse().find((message) => message.agentRun && message.agentRun.agent !== COMPANION_AGENT)?.agentRun;
  return run && run.agent !== COMPANION_AGENT ? { ...run, agent: run.agent } : undefined;
}

export function ChatPage({ conversationId }: { conversationId?: string }) {
  const { status, requestLogin } = useAuth();
  const [conversation, setConversation] = useState<ChatConversation>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [taskHint, setTaskHint] = useState("");
  // Teams and skills. `teamSkills` undefined = not customised: the last run's team, else the defaults.
  const [agents, setAgents] = useState<ChatAgentProfile[]>([]);
  const [skills, setSkills] = useState<ChatAgentExpert[]>([]);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [team, setTeam] = useState<ChatAgentName>();
  const [teamSkills, setTeamSkills] = useState<string[]>();
  const [teamDialog, setTeamDialog] = useState<ChatAgentName>();
  // A reply streams in within seconds of the first send; have the renderer ready before that.
  useEffect(() => {
    if (conversationId) preloadMarkdown();
    else if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(preloadMarkdown, { timeout: 3000 });
    else setTimeout(preloadMarkdown, 1500);
  }, [conversationId]);
  const [marketOpen, setMarketOpen] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentProcessing, setAttachmentProcessing] = useState(false);
  const [contextOptions, setContextOptions] = useState<ChatContextOption[]>([]);
  const [selectedContext, setSelectedContext] = useState<ChatContextReference[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [streaming, setStreaming] = useState(false);
  const [pendingMode, setPendingMode] = useState<ChatPendingMode>();
  const [error, setError] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  // The “今天” brief (experimental): signed-in users only, shown once their applications have loaded.
  const [applications, setApplications] = useState<JobApplication[]>();
  const abortRef = useRef<AbortController>();
  const justCreatedRef = useRef<string>();

  const focusComposer = (caretAtEnd = true) => {
    window.requestAnimationFrame(() => {
      const input = document.getElementById("career-question") as HTMLTextAreaElement | null;
      if (!input) return;
      input.focus();
      if (caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
    });
  };

  // A conversation belongs to the team that answered in it; it cannot switch teams afterwards.
  const conversationRun = lastAgentRun(messages);
  const activeTeam = agents.find((agent) => agent.id === team);
  const memberIds = teamSkills ?? conversationRun?.skills ?? activeTeam?.defaultSkills ?? [];
  const members = memberIds.flatMap((id) => skills.filter((skill) => skill.id === id));

  const inviteTeam = (next: ChatAgentName) => {
    if (streaming || (conversationRun && conversationRun.agent !== next)) return;
    const profile = agents.find((agent) => agent.id === next);
    setTeam(next);
    setTeamSkills(undefined);
    setTeamDialog(undefined);
    if (!draft.trim() && profile) setDraft(profile.starter);
    setTaskHint(`已邀请${profile?.name ?? "团队"}。需要对照岗位时，可以在“选择已有材料”里选一条投递。`);
    focusComposer();
  };

  const toggleSkill = (skillId: string) => {
    if (memberIds.includes(skillId)) setTeamSkills(memberIds.filter((id) => id !== skillId));
    else if (memberIds.length >= MAX_TEAM_SKILLS) setError(`一支团队最多 ${MAX_TEAM_SKILLS} 位专家`);
    else setTeamSkills([...memberIds, skillId]);
  };

  const mentionExpert = (expert: ChatAgentExpert) => {
    const mention = `@${expert.name} `;
    setDraft((current) => current.includes(mention) ? current : `${mention}${current}`);
    setTeamDialog(undefined);
    focusComposer();
  };

  const refreshSkills = async () => {
    const [roster, own] = await Promise.all([api.chat.listAgents(), api.chat.listCustomSkills()]);
    setAgents(roster.agents);
    setSkills(roster.skills);
    setCustomSkills(own.skills);
  };

  const saveCustomSkill = async (skillDraft: CustomSkillDraft, id?: string) => {
    const saved = id ? await api.chat.updateCustomSkill(id, skillDraft) : await api.chat.createCustomSkill(skillDraft);
    await refreshSkills();
    // A newly created skill joins the current team right away when it fits.
    const skillId = `custom:${saved.skill.id}`;
    if (!id && team && saved.skill.teams.includes(team) && !memberIds.includes(skillId) && memberIds.length < MAX_TEAM_SKILLS) {
      setTeamSkills([...memberIds, skillId]);
    }
  };

  const deleteCustomSkill = async (id: string) => {
    await api.chat.deleteCustomSkill(id);
    setTeamSkills(memberIds.filter((skillId) => skillId !== `custom:${id}`));
    await refreshSkills();
  };

  useEffect(() => {
    if (!conversationId) {
      setConversation(undefined);
      setMessages([]);
      setLoading(false);
      setTeam(undefined);
      setTeamSkills(undefined);
      return;
    }
    if (justCreatedRef.current === conversationId) {
      justCreatedRef.current = undefined;
      return;
    }
    // Another conversation: its own history decides which team it belongs to.
    setTeam(undefined);
    setTeamSkills(undefined);
    let active = true;
    setLoading(true);
    setError("");
    api.chat
      .getConversation(conversationId)
      .then((result) => {
        if (!active) return;
        setConversation(result.conversation);
        setMessages(result.messages);
        setTeam(lastAgentRun(result.messages)?.agent);
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
    let active = true;
    api.chat.listAgents()
      .then((result) => {
        if (!active) return;
        setAgents(result.agents);
        setSkills(result.skills);
      })
      .catch(() => undefined);
    if (status !== "anonymous") {
      api.chat.listCustomSkills()
        .then((result) => {
          if (active) setCustomSkills(result.skills);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [status]);

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

  useEffect(() => {
    if (status !== "authenticated") {
      setApplications(undefined);
      return;
    }
    let active = true;
    api.applications.list()
      .then((result) => {
        if (active) setApplications(result.applications.filter((item) => !item.deletedAt).map((item) => item.application));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [status]);

  const runBriefAction = (action: BriefAction) => {
    if (action.type === "applications") {
      navigate("/app/applications");
      return;
    }
    if (!requireChatLogin()) return;
    inviteTeam(action.team);
    const material = action.applicationId
      ? contextOptions.find((option) => option.kind === "application" && option.id === action.applicationId)
      : undefined;
    if (material) {
      const { selectable: _selectable, ...reference } = material;
      setSelectedContext([reference]);
    }
  };

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
      } else if (event.type === "message.reset") {
        setMessages((current) => current.map((message) =>
          message.id === event.messageId ? { ...message, content: "" } : message
        ));
      } else if (event.type === "agent.step") {
        setMessages((current) => current.map((message) =>
          message.id === event.messageId
            ? withAgentRun(message, team ?? "resume_coach", (run) => ({ ...run, steps: [...run.steps, event.step] }))
            : message
        ));
      } else if (event.type === "agent.rewrite") {
        setMessages((current) => current.map((message) =>
          message.id === event.messageId
            ? withAgentRun(message, team ?? "resume_coach", (run) => ({
              ...run,
              rewrites: [...run.rewrites.filter((item) => item.entryId !== event.rewrite.entryId), event.rewrite]
            }))
            : message
        ));
      } else if (event.type === "agent.expert") {
        setMessages((current) => current.map((message) =>
          message.id === event.messageId
            ? withAgentRun(message, team ?? "resume_coach", (run) => ({ ...run, notes: [...(run.notes ?? []), event.note] }))
            : message
        ));
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
    const content = (suggested ?? draft).trim() || (attachments.length ? "请阅读附件，概括主要内容并给出建议。" : "");
    if (!content || streaming || attachmentProcessing) return;
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
            context: clientMessage.context,
            ...(team ? { agent: team, ...(teamSkills ? { skills: teamSkills } : {}) } : {})
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

  const teamChip = activeTeam && (
    <div className="team-chip">
      <button type="button" className="team-chip__main" onClick={() => setTeamDialog(activeTeam.id)} aria-label={`${activeTeam.name}，查看和调整成员`}>
        <span className="avatar-stack">
          {members.slice(0, 4).map((member) => <ExpertAvatar key={member.id} expert={member} />)}
        </span>
        <strong>{activeTeam.name}</strong>
        <span>{members.length ? `${members.length} 位专家为你工作` : "主教练独自工作"}</span>
        <ChevronRight aria-hidden="true" size={14} />
      </button>
      {!conversationRun && (
        <button type="button" className="team-chip__leave" aria-label="不邀请这支团队" onClick={() => setTeam(undefined)}>
          <X aria-hidden="true" size={13} />
        </button>
      )}
    </div>
  );
  const contextPicker = status !== "anonymous" && (
    <>
      <ChatContextPicker
        options={contextOptions}
        selected={selectedContext}
        loading={contextLoading}
        onChange={setSelectedContext}
      />
      <button type="button" className="composer-skill-button" onClick={() => setMarketOpen(true)}>
        <Store aria-hidden="true" size={14} />技能
      </button>
    </>
  );
  const shownTeam = agents.find((agent) => agent.id === teamDialog);
  const shownMembers = shownTeam && shownTeam.id === team
    ? members
    : (shownTeam?.defaultSkills ?? []).flatMap((id) => skills.filter((skill) => skill.id === id));
  const agentDialogs = (
    <>
      <TeamDialog
        team={shownTeam}
        members={shownMembers}
        invited={Boolean(shownTeam && shownTeam.id === team)}
        locked={Boolean(shownTeam && conversationRun && conversationRun.agent !== shownTeam.id)}
        onClose={() => setTeamDialog(undefined)}
        onInvite={() => shownTeam && (requireChatLogin() ? inviteTeam(shownTeam.id) : setTeamDialog(undefined))}
        onRemove={toggleSkill}
        onReset={() => setTeamSkills(activeTeam?.defaultSkills)}
        onMention={mentionExpert}
        onOpenMarket={() => {
          setTeamDialog(undefined);
          setMarketOpen(true);
        }}
      />
      <SkillMarket
        open={marketOpen}
        onClose={() => setMarketOpen(false)}
        agents={agents}
        skills={skills}
        customSkills={customSkills}
        activeTeam={activeTeam}
        teamSkillIds={memberIds}
        onToggle={toggleSkill}
        onSaveCustom={saveCustomSkill}
        onDeleteCustom={deleteCustomSkill}
      />
    </>
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
          <h1 tabIndex={-1}>说出你的目标，<span>求职团队和你一起推进</span></h1>
          <p>
            邀请一支团队，再用技能市场里的专家升级他们。
          </p>
          {agents.length > 0 && (
            <TeamGallery
              agents={agents}
              skills={skills}
              activeTeam={team}
              onOpen={setTeamDialog}
              onInvite={(next) => {
                if (requireChatLogin()) inviteTeam(next);
              }}
            />
          )}
          <ChatComposer
            value={draft}
            attachments={attachments}
            key={conversationId || "new"}
            onRecognizeFile={api.chat.recognizeFile}
            onProcessingChange={setAttachmentProcessing}
            streaming={streaming}
            contextSlot={contextPicker}
            headerSlot={teamChip}
            autoFocus
            onChange={setDraft}
            onAttachmentsChange={setAttachments}
            onAttachmentRequest={requireChatLogin}
            onAttachmentError={setError}
            onSubmit={() => void send()}
            onStop={() => abortRef.current?.abort()}
          />
          {status === "authenticated" && applications && (
            <TodayBrief applications={applications} onAction={runBriefAction} />
          )}
          <span className="sr-only" role="status">{taskHint}</span>
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
                  <i>{conversationRun ? activeTeam?.name : DEFAULT_CHAT_COMPANION.role}</i>
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
              teamNames={Object.fromEntries(agents.map((agent) => [agent.id, agent.name]))}
            />
          </div>
          <div className="thread-composer">
            <ChatComposer
              value={draft}
              attachments={attachments}
              key={conversationId || "new"}
              onRecognizeFile={api.chat.recognizeFile}
              onProcessingChange={setAttachmentProcessing}
              streaming={streaming}
              contextSlot={contextPicker}
              headerSlot={teamChip}
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
      {agentDialogs}
    </section>
  );
}
