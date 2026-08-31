import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type PropsWithChildren } from "react";
import { SiteCompliance } from "../components/SiteCompliance";
import type { ChatConversation } from "@offerflow/domain";
import {
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Home,
  Info,
  Link2,
  LogIn,
  LogOut,
  Menu,
  MessageCircleMore,
  MonitorSmartphone,
  MoreHorizontal,
  Newspaper,
  PanelLeftClose,
  Pencil,
  Pin,
  Plus,
  Puzzle,
  Settings,
  Search,
  Trash2,
  X
} from "lucide-react";
import { api } from "../app/api";
import { useAuth } from "../app/AuthContext";
import { companionshipLabel } from "../app/companionship";
import { navigate } from "../app/router";
import { applyColorTheme, persistColorTheme, readStoredColorTheme, type ColorTheme } from "../app/theme";
import { Logo } from "../components/Logo";
import { FeedbackDialog } from "../components/FeedbackDialog";
import { ThemeToggle } from "../components/ThemeToggle";
import { UserAvatar } from "../components/UserAvatar";

interface AppLinkProps extends PropsWithChildren {
  href: string;
  className?: string;
  onNavigate?: () => void;
  guard?: () => boolean;
  ariaCurrent?: "page";
  title?: string;
}

function AppLink({ href, className, onNavigate, guard, ariaCurrent, title, children }: AppLinkProps) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (guard && !guard()) return;
    navigate(href);
    onNavigate?.();
  };
  return <a href={href} className={className} aria-current={ariaCurrent} title={title} onClick={open}>{children}</a>;
}

const primaryNavigation = [
  { href: "/app/chat", label: "求职陪跑", mobileLabel: "陪跑", icon: MessageCircleMore, requiresAuth: false, badge: "内测中" },
  { href: "/app/opportunities", label: "校招信息速递", mobileLabel: "机会", icon: Newspaper, requiresAuth: false },
  { href: "/app/companies", label: "公司投递直达", mobileLabel: "直达", icon: Building2, requiresAuth: false },
  { href: "/app/resumes", label: "简历中心", mobileLabel: "简历", icon: FileText, requiresAuth: true, badge: "内测中" },
  { href: "/app/applications", label: "个人投递管理", mobileLabel: "投递", icon: BriefcaseBusiness, requiresAuth: true }
];

function formatConversationTime(value: string, now: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 10 * 60_000) return "刚刚";

  const current = new Date(now);
  const updated = new Date(timestamp);
  const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const updatedDay = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime();
  const dayDifference = Math.round((currentDay - updatedDay) / 86_400_000);

  if (dayDifference <= 0) return "今天";
  if (dayDifference === 1) return "昨天";
  if (dayDifference < 7) return `${dayDifference}天前`;
  return updated.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    ...(updated.getFullYear() === current.getFullYear() ? {} : { year: "numeric" })
  });
}

export function AppShell({ pathname, children }: PropsWithChildren<{ pathname: string }>) {
  const { status, user, logout, requestLogin } = useAuth();
  const isGuest = status === "guest";
  const isAnonymous = status === "anonymous";
  const isVisitor = isAnonymous || isGuest;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("offerflow:sidebar-collapsed") === "true";
  });
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [threadQuery, setThreadQuery] = useState("");
  const [renamingConversationId, setRenamingConversationId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState("");
  const [threadError, setThreadError] = useState("");
  const [threadStatus, setThreadStatus] = useState("");
  const [activeThreadMenuId, setActiveThreadMenuId] = useState<string>();
  const [threadMenuPosition, setThreadMenuPosition] = useState<{ top: number; left: number }>();
  const [confirmingThreadDelete, setConfirmingThreadDelete] = useState(false);
  const threadDeleteConfirmTimerRef = useRef<number | undefined>(undefined);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [accountOpen, setAccountOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  );
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const threadMenuRef = useRef<HTMLDivElement>(null);
  const threadMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const threadMenuOpenedByKeyboardRef = useRef(false);
  const compactSidebarToggleRef = useRef<HTMLButtonElement>(null);
  const collapseSidebarToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRequestedFocusRef = useRef(false);
  const pinnedStorageKey = `offerflow:pinned-conversations:${user?.id || "visitor"}`;
  const activeNavigationIndex = primaryNavigation.findIndex(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    setFeedbackOpen(false);
    setActiveThreadMenuId(undefined);
    setThreadMenuPosition(undefined);
  }, [pathname]);

  useEffect(() => {
    const closePopovers = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!accountMenuRef.current?.contains(target)) setAccountOpen(false);
      if (!threadMenuRef.current?.contains(target) && !threadMenuTriggerRef.current?.contains(target)) {
        setActiveThreadMenuId(undefined);
        setThreadMenuPosition(undefined);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      setAccountOpen(false);
      if (threadMenuRef.current) {
        const trigger = threadMenuTriggerRef.current;
        setActiveThreadMenuId(undefined);
        setThreadMenuPosition(undefined);
        window.requestAnimationFrame(() => trigger?.focus());
      }
    };
    document.addEventListener("pointerdown", closePopovers);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePopovers);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (isAnonymous) {
      setConversations([]);
      return;
    }
    let active = true;
    const load = () => {
      api.chat
        .listConversations()
        .then((result) => {
          if (active) setConversations(result.conversations);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener("offerflow:conversation-updated", load);
    return () => {
      active = false;
      window.removeEventListener("offerflow:conversation-updated", load);
    };
  }, [isAnonymous, user?.id]);

  useEffect(() => {
    const colorScheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!colorScheme) return undefined;
    const followSystemTheme = (event: MediaQueryListEvent) => {
      if (readStoredColorTheme()) return;
      const nextTheme = event.matches ? "dark" : "light";
      applyColorTheme(nextTheme);
      setColorTheme(nextTheme);
    };
    colorScheme.addEventListener("change", followSystemTheme);
    return () => colorScheme.removeEventListener("change", followSystemTheme);
  }, []);

  useEffect(() => {
    if (!conversations.length && !user) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [conversations.length, user]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(pinnedStorageKey) || "[]") as unknown;
      setPinnedConversationIds(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setPinnedConversationIds([]);
    }
  }, [pinnedStorageKey]);

  useEffect(() => {
    if (!threadStatus) return undefined;
    const timer = window.setTimeout(() => setThreadStatus(""), 2600);
    return () => window.clearTimeout(timer);
  }, [threadStatus]);

  useEffect(() => {
    if (!activeThreadMenuId) return undefined;
    const closeOnViewportChange = () => {
      setActiveThreadMenuId(undefined);
      setThreadMenuPosition(undefined);
    };
    window.addEventListener("resize", closeOnViewportChange);
    document.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.removeEventListener("resize", closeOnViewportChange);
      document.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [activeThreadMenuId]);

  useEffect(() => {
    if (!activeThreadMenuId || !threadMenuOpenedByKeyboardRef.current) return;
    window.requestAnimationFrame(() => threadMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }, [activeThreadMenuId]);

  useLayoutEffect(() => {
    if (!sidebarToggleRequestedFocusRef.current) return;
    sidebarToggleRequestedFocusRef.current = false;
    if (sidebarCollapsed) compactSidebarToggleRef.current?.focus();
    else collapseSidebarToggleRef.current?.focus();
  }, [sidebarCollapsed]);

  const closeMobile = () => {
    setMobileOpen(false);
    setAccountOpen(false);
    setActiveThreadMenuId(undefined);
    setThreadMenuPosition(undefined);
  };
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>, close: () => void) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  };
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    window.localStorage.setItem("offerflow:sidebar-collapsed", String(next));
    setAccountOpen(false);
    setActiveThreadMenuId(undefined);
    setThreadMenuPosition(undefined);
    sidebarToggleRequestedFocusRef.current = true;
    setSidebarCollapsed(next);
  };
  const toggleColorTheme = () => {
    const nextTheme = colorTheme === "dark" ? "light" : "dark";
    applyColorTheme(nextTheme);
    persistColorTheme(nextTheme);
    setColorTheme(nextTheme);
  };
  const requireLogin = (reason: string) => {
    if (!isAnonymous) return true;
    closeMobile();
    requestLogin(reason);
    return false;
  };
  const pinnedConversationIdSet = new Set(pinnedConversationIds);
  const visibleConversations = conversations
    .filter((conversation) =>
      `${conversation.title} ${conversation.lastMessagePreview || ""}`.toLowerCase().includes(threadQuery.trim().toLowerCase())
    )
    .sort((first, second) => Number(pinnedConversationIdSet.has(second.id)) - Number(pinnedConversationIdSet.has(first.id)));
  const activeThreadMenuConversation = conversations.find((conversation) => conversation.id === activeThreadMenuId);
  const closeThreadMenu = () => {
    setActiveThreadMenuId(undefined);
    setThreadMenuPosition(undefined);
    setConfirmingThreadDelete(false);
    window.clearTimeout(threadDeleteConfirmTimerRef.current);
  };
  const toggleThreadMenu = (event: MouseEvent<HTMLButtonElement>, conversationId: string) => {
    if (activeThreadMenuId === conversationId) {
      closeThreadMenu();
      return;
    }
    const trigger = event.currentTarget;
    const triggerRect = trigger.getBoundingClientRect();
    const menuWidth = 208;
    const menuHeight = 190;
    const viewportGutter = 10;
    const opensBelow = triggerRect.bottom + 6 + menuHeight <= window.innerHeight - viewportGutter;
    threadMenuTriggerRef.current = trigger;
    threadMenuOpenedByKeyboardRef.current = event.detail === 0;
    setThreadMenuPosition({
      top: opensBelow ? triggerRect.bottom + 6 : Math.max(viewportGutter, triggerRect.top - menuHeight - 6),
      left: Math.min(
        window.innerWidth - menuWidth - viewportGutter,
        Math.max(viewportGutter, triggerRect.right - menuWidth)
      )
    });
    setActiveThreadMenuId(conversationId);
  };
  const togglePinnedConversation = (conversation: ChatConversation) => {
    const willPin = !pinnedConversationIdSet.has(conversation.id);
    setPinnedConversationIds((current) => {
      const next = willPin
        ? [conversation.id, ...current.filter((id) => id !== conversation.id)]
        : current.filter((id) => id !== conversation.id);
      try {
        window.localStorage.setItem(pinnedStorageKey, JSON.stringify(next));
      } catch {
        // Keep the interaction working when storage is unavailable.
      }
      return next;
    });
    setThreadStatus(willPin ? `已置顶“${conversation.title}”。` : `已取消置顶“${conversation.title}”。`);
    closeThreadMenu();
  };
  const copyConversationLink = async (conversation: ChatConversation) => {
    const url = `${window.location.origin}/app/chat/${encodeURIComponent(conversation.id)}`;
    closeThreadMenu();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const copyTarget = document.createElement("textarea");
        copyTarget.value = url;
        copyTarget.style.position = "fixed";
        copyTarget.style.opacity = "0";
        document.body.append(copyTarget);
        copyTarget.select();
        document.execCommand("copy");
        copyTarget.remove();
      }
      setThreadStatus("对话链接已复制。");
    } catch {
      setThreadError("暂时无法复制链接。打开该对话后，再从浏览器地址栏复制。");
    }
  };
  const beginRename = (conversation: ChatConversation) => {
    setRenamingConversationId(conversation.id);
    setRenameDraft(conversation.title);
    setThreadError("");
  };
  const saveRename = async (conversationId: string) => {
    const title = renameDraft.trim();
    if (!title) {
      setThreadError("请输入对话名称。");
      return;
    }
    try {
      const result = await api.chat.updateConversation(conversationId, { title });
      setConversations((current) => current.map((item) => item.id === conversationId ? result.conversation : item));
      setRenamingConversationId(undefined);
      setThreadError("");
      window.dispatchEvent(new CustomEvent("offerflow:conversation-renamed", { detail: result.conversation }));
    } catch (requestError) {
      setThreadError(requestError instanceof Error ? requestError.message : "暂时无法重命名对话");
    }
  };
  const removeConversation = async (conversation: ChatConversation) => {
    try {
      await api.chat.deleteConversation(conversation.id);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      setThreadError("");
      if (pathname === `/app/chat/${encodeURIComponent(conversation.id)}`) navigate("/app/chat");
    } catch (requestError) {
      setThreadError(requestError instanceof Error ? requestError.message : "暂时无法删除对话");
    }
  };

  return (
    <div className={`app-frame${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <div className="workspace-quick-actions" role="group" aria-label="显示与反馈">
        <button className="feedback-trigger" type="button" aria-haspopup="dialog" onClick={() => setFeedbackOpen(true)}>
          <MessageCircleMore aria-hidden="true" size={16} />共建反馈
        </button>
        <ThemeToggle theme={colorTheme} onToggle={toggleColorTheme} />
      </div>
      <header className={`mobile-header${isVisitor ? " is-guest" : ""}`}>
        <button
          type="button"
          aria-label="打开更多菜单"
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          onClick={() => setMobileOpen(true)}
        >
          <Menu aria-hidden="true" size={21} />
        </button>
        <Logo />
        <button className="mobile-feedback-trigger" type="button" aria-label="打开共建反馈" aria-haspopup="dialog" onClick={() => setFeedbackOpen(true)}>
          <MessageCircleMore aria-hidden="true" size={20} />
        </button>
        <ThemeToggle className="theme-toggle--mobile" theme={colorTheme} onToggle={toggleColorTheme} />
        {isVisitor ? (
          <button className="mobile-login-link" type="button" onClick={() => requestLogin("登录后即可同步并继续使用全部功能。")}>登录</button>
        ) : (
          <UserAvatar avatarKey={user?.avatarKey} className="mobile-avatar" />
        )}
      </header>

      <button
        className={`sidebar-scrim${mobileOpen ? " is-visible" : ""}`}
        type="button"
        aria-label="关闭导航"
        onClick={closeMobile}
      />

      <aside id="app-sidebar" className={`app-sidebar${mobileOpen ? " is-open" : ""}`} aria-label="更多功能与账户">
        <div className="sidebar-brand-row">
          <AppLink href="/app/chat" className="sidebar-brand-link" onNavigate={closeMobile}><Logo /></AppLink>
          <button
            ref={compactSidebarToggleRef}
            className="sidebar-compact-toggle"
            type="button"
            aria-label="展开侧边栏"
            aria-expanded={false}
            aria-controls="app-sidebar"
            title="展开侧边栏"
            onClick={toggleSidebar}
          >
            <Logo compact />
          </button>
          <button
            ref={collapseSidebarToggleRef}
            className="sidebar-collapse-toggle"
            type="button"
            aria-label="收起侧边栏"
            aria-expanded={true}
            aria-controls="app-sidebar"
            title="收起侧边栏"
            onClick={toggleSidebar}
          >
            <PanelLeftClose aria-hidden="true" size={19} strokeWidth={1.8} />
          </button>
          <button className="sidebar-close" type="button" aria-label="关闭导航" onClick={closeMobile}>
            <X aria-hidden="true" size={19} />
          </button>
        </div>

        <AppLink
          href="/app/chat"
          className="new-chat-button"
          title={sidebarCollapsed ? "新对话" : undefined}
          guard={() => requireLogin("登录后即可开始并保存新的求职对话。")}
          onNavigate={closeMobile}
        >
          <Plus aria-hidden="true" size={18} strokeWidth={2} />
          <span className="sidebar-item-label">新对话</span>
          <span className="sidebar-shortcut">⌘ K</span>
        </AppLink>

        <nav className="primary-nav" aria-label="功能页" data-active-index={activeNavigationIndex}>
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <AppLink
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " is-active" : ""}`}
                ariaCurrent={active ? "page" : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                guard={item.requiresAuth ? () => requireLogin(`登录后即可使用${item.label}。`) : undefined}
                onNavigate={closeMobile}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span className="sidebar-item-label">{item.label}</span>
                {item.badge && <em className="nav-release-badge">{item.badge}</em>}
                {!item.badge && item.href === "/app/opportunities" && <em>实时</em>}
              </AppLink>
            );
          })}
        </nav>

        <section className="recent-threads" aria-labelledby="recent-thread-title">
          <div className="sidebar-section-heading">
            <span id="recent-thread-title">最近对话</span>
            <Clock3 aria-hidden="true" size={14} />
          </div>
          {conversations.length > 4 && (
            <label className="thread-search">
              <span className="sr-only">搜索历史对话</span>
              <Search aria-hidden="true" size={14} />
              <input
                type="search"
                value={threadQuery}
                placeholder="搜索对话"
                onChange={(event) => setThreadQuery(event.target.value)}
              />
            </label>
          )}
          <div className="thread-links">
            {visibleConversations.map((conversation) => {
              const href = `/app/chat/${encodeURIComponent(conversation.id)}`;
              return (
                <div
                  className={`thread-link-row${pathname === href ? " is-active" : ""}${pinnedConversationIdSet.has(conversation.id) ? " is-pinned" : ""}${activeThreadMenuId === conversation.id ? " is-menu-open" : ""}`}
                  key={conversation.id}
                >
                  {renamingConversationId === conversation.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); void saveRename(conversation.id); }}>
                      <label className="sr-only" htmlFor={`conversation-${conversation.id}`}>对话名称</label>
                      <input
                        id={`conversation-${conversation.id}`}
                        autoFocus
                        maxLength={80}
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Escape") setRenamingConversationId(undefined); }}
                      />
                      <button type="submit" aria-label="保存对话名称"><Check aria-hidden="true" size={14} /></button>
                    </form>
                  ) : (
                    <>
                      <AppLink
                        href={href}
                        className="thread-link"
                        ariaCurrent={pathname === href ? "page" : undefined}
                        title={conversation.title}
                        onNavigate={closeMobile}
                      >
                        <span className="thread-link-copy">
                          <span className="thread-link-title">{conversation.title}</span>
                          <time dateTime={conversation.updatedAt}>{formatConversationTime(conversation.updatedAt, clockNow)}</time>
                        </span>
                      </AppLink>
                      <span className="thread-row-actions">
                        <button
                          type="button"
                          className="thread-pin-button"
                          aria-label={`${pinnedConversationIdSet.has(conversation.id) ? "取消置顶" : "置顶"} ${conversation.title}`}
                          aria-pressed={pinnedConversationIdSet.has(conversation.id)}
                          title={pinnedConversationIdSet.has(conversation.id) ? "取消置顶" : "置顶对话"}
                          onClick={() => togglePinnedConversation(conversation)}
                        >
                          <Pin aria-hidden="true" size={14} fill={pinnedConversationIdSet.has(conversation.id) ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          className="thread-more-button"
                          aria-label={`更多对话操作：${conversation.title}`}
                          aria-expanded={activeThreadMenuId === conversation.id}
                          aria-controls={activeThreadMenuId === conversation.id ? `thread-actions-${conversation.id}` : undefined}
                          onClick={(event) => toggleThreadMenu(event, conversation.id)}
                        >
                          <MoreHorizontal aria-hidden="true" size={16} />
                        </button>
                      </span>
                    </>
                  )}
                </div>
              );
            })}
            {!conversations.length && (
              <p className="thread-empty">你的求职问题会保存在这里。</p>
            )}
            {conversations.length > 0 && !visibleConversations.length && (
              <p className="thread-empty">没有匹配的对话。换个关键词试试。</p>
            )}
          </div>
          <p className="sr-only" role="status" aria-live="polite">{threadStatus}</p>
          <p className="thread-error" role="alert">{threadError}</p>
        </section>

        <div className="sidebar-footer">
          <a
            href="/browser-extension"
            className="extension-entry-button"
            title={sidebarCollapsed ? "获取浏览器插件" : undefined}
            target="_blank"
            rel="noreferrer"
            onClick={closeMobile}
          >
            <Puzzle aria-hidden="true" size={16} />
            <span>获取浏览器插件</span>
            <em>免费</em>
          </a>

          <div className={`sidebar-account-row${isVisitor ? " is-guest" : ""}`}>
            {isVisitor ? (
              <button
                type="button"
                className="account-trigger account-trigger--guest"
                title={sidebarCollapsed ? "登录" : undefined}
                onClick={() => requestLogin("登录后即可同步对话、简历和投递记录。")}
              >
                <span className="account-avatar">访</span>
                <span><strong>点击登录</strong><small>登录后同步</small></span>
                <LogIn aria-hidden="true" size={15} />
              </button>
            ) : (
              <div
                className={`account-menu${accountOpen ? " is-open" : ""}`}
                ref={accountMenuRef}
                onMouseEnter={() => setAccountOpen(true)}
                onMouseLeave={() => setAccountOpen(false)}
                onFocus={() => setAccountOpen(true)}
                onBlur={(event) => closeWhenFocusLeaves(event, () => setAccountOpen(false))}
              >
                <button
                  className="account-trigger"
                  type="button"
                  aria-label="打开账户菜单"
                  aria-expanded={accountOpen}
                  aria-controls="account-popover"
                  onClick={() => setAccountOpen((current) => !current)}
                >
                  <UserAvatar avatarKey={user?.avatarKey} className="account-avatar" />
                  <span><strong>{user?.displayName || "JobKoI 用户"}</strong><small>{companionshipLabel(user?.createdAt || "", clockNow)}</small></span>
                  <ChevronDown aria-hidden="true" size={15} />
                </button>

                <div className="account-popover" id="account-popover" aria-label="账户菜单">
                  <header className="account-profile">
                    <UserAvatar avatarKey={user?.avatarKey} className="account-avatar account-avatar--large" />
                    <span><strong>{user?.displayName || "JobKoI 用户"}</strong><small>{user?.email}</small></span>
                  </header>

                  <div className="account-popover-links">
                    <AppLink href="/app/settings" onNavigate={closeMobile}>
                      <Settings aria-hidden="true" size={16} />设置与设备同步
                    </AppLink>
                    <AppLink href="/app/chat" onNavigate={closeMobile}>
                      <Home aria-hidden="true" size={16} />返回首页
                    </AppLink>
                    <button type="button" onClick={() => { setAccountOpen(false); setFeedbackOpen(true); }}>
                      <MessageCircleMore aria-hidden="true" size={16} />提交反馈
                    </button>
                    <button type="button" disabled title="后续接入">
                      <Info aria-hidden="true" size={16} />更新日志<span>即将上线</span>
                    </button>
                    <button type="button" onClick={logout}>
                      <LogOut aria-hidden="true" size={16} />退出登录
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!isVisitor && (
              <AppLink
                href="/app/settings"
                className="sidebar-footer-icon"
                onNavigate={closeMobile}
              >
                <MonitorSmartphone aria-hidden="true" size={17} />
                <span className="sr-only">打开设备同步设置</span>
              </AppLink>
            )}

            <button className="sidebar-footer-icon" type="button" aria-label="打开共建反馈" aria-haspopup="dialog" onClick={() => setFeedbackOpen(true)}>
              <MessageCircleMore aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      </aside>

      {activeThreadMenuConversation && threadMenuPosition && (
        <div
          className="thread-action-popover"
          id={`thread-actions-${activeThreadMenuConversation.id}`}
          ref={threadMenuRef}
          style={threadMenuPosition}
          role="group"
          aria-label={`“${activeThreadMenuConversation.title}”的对话操作`}
        >
          <button type="button" onClick={() => void copyConversationLink(activeThreadMenuConversation)}>
            <Link2 aria-hidden="true" size={16} />复制对话链接
          </button>
          <button type="button" onClick={() => { closeThreadMenu(); beginRename(activeThreadMenuConversation); }}>
            <Pencil aria-hidden="true" size={16} />重命名
          </button>
          <span className="thread-action-divider" aria-hidden="true" />
          <button type="button" onClick={() => togglePinnedConversation(activeThreadMenuConversation)}>
            <Pin aria-hidden="true" size={16} fill={pinnedConversationIdSet.has(activeThreadMenuConversation.id) ? "currentColor" : "none"} />
            {pinnedConversationIdSet.has(activeThreadMenuConversation.id) ? "取消置顶" : "置顶对话"}
          </button>
          <button
            className="is-danger"
            type="button"
            onClick={() => {
              if (!confirmingThreadDelete) {
                setConfirmingThreadDelete(true);
                window.clearTimeout(threadDeleteConfirmTimerRef.current);
                threadDeleteConfirmTimerRef.current = window.setTimeout(() => setConfirmingThreadDelete(false), 4000);
                return;
              }
              closeThreadMenu();
              void removeConversation(activeThreadMenuConversation);
            }}
          >
            <Trash2 aria-hidden="true" size={16} />
            {confirmingThreadDelete ? "确认删除？" : "删除"}
          </button>
        </div>
      )}

      <div className={`workspace-shell${isGuest ? " workspace-shell--guest" : ""}`}>
        {isGuest && (
          <header className="guest-toolbar" aria-label="账户操作">
            <AppLink href="/login" className="guest-login-link">
              <LogIn aria-hidden="true" size={16} strokeWidth={2} />
              登录
            </AppLink>
          </header>
        )}
        <main
          id="main-content"
          className={`workspace-main${pathname.startsWith("/app/chat") ? " workspace-main--chat" : ""}`}
          tabIndex={-1}
        >
          {children}
        </main>
        <footer className="workspace-footer">
          <SiteCompliance className="workspace-site-compliance" compact showFeedback={false} />
        </footer>
      </div>

      <nav className="mobile-bottom-nav" aria-label="主要功能" data-active-index={activeNavigationIndex}>
        {primaryNavigation.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <AppLink
              key={item.href}
              href={item.href}
              className={`mobile-bottom-link${active ? " is-active" : ""}`}
              ariaCurrent={active ? "page" : undefined}
              guard={item.requiresAuth ? () => requireLogin(`登录后即可使用${item.label}。`) : undefined}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <span>{item.mobileLabel}</span>
            </AppLink>
          );
        })}
      </nav>
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} pagePath={pathname} />
    </div>
  );
}
