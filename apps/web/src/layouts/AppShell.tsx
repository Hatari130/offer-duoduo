import { useEffect, useRef, useState, type FocusEvent, type MouseEvent, type PropsWithChildren } from "react";
import type { ChatConversation } from "@offerflow/domain";
import {
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  Clock3,
  Cloud,
  FileText,
  Gift,
  Home,
  Info,
  LogIn,
  LogOut,
  Menu,
  MessageCircleMore,
  MonitorSmartphone,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Puzzle,
  Settings,
  X
} from "lucide-react";
import { api } from "../app/api";
import { useAuth } from "../app/AuthContext";
import { navigate, startUiTransition } from "../app/router";
import { Logo } from "../components/Logo";

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
  { href: "/app/chat", label: "求职助手", mobileLabel: "助手", icon: MessageCircleMore, requiresAuth: false },
  { href: "/app/opportunities", label: "校招信息速递", mobileLabel: "机会", icon: Newspaper, requiresAuth: false },
  { href: "/app/companies", label: "公司投递直达", mobileLabel: "直达", icon: Building2, requiresAuth: false },
  { href: "/app/resumes", label: "简历中心", mobileLabel: "简历", icon: FileText, requiresAuth: true },
  { href: "/app/applications", label: "个人投递管理", mobileLabel: "投递", icon: BriefcaseBusiness, requiresAuth: true }
];

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
  const [accountOpen, setAccountOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const contactMenuRef = useRef<HTMLDivElement>(null);
  const activeNavigationIndex = primaryNavigation.findIndex(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    setContactOpen(false);
  }, [pathname]);

  useEffect(() => {
    const closePopovers = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!accountMenuRef.current?.contains(target)) setAccountOpen(false);
      if (!contactMenuRef.current?.contains(target)) setContactOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      setAccountOpen(false);
      setContactOpen(false);
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
          if (active) setConversations(result.conversations.slice(0, 8));
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

  const closeMobile = () => {
    setMobileOpen(false);
    setAccountOpen(false);
    setContactOpen(false);
  };
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>, close: () => void) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  };
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    startUiTransition(() => {
      window.localStorage.setItem("offerflow:sidebar-collapsed", String(next));
      setAccountOpen(false);
      setContactOpen(false);
      setSidebarCollapsed(next);
    }, "sidebar");
  };
  const requireLogin = (reason: string) => {
    if (!isAnonymous) return true;
    closeMobile();
    requestLogin(reason);
    return false;
  };

  return (
    <div className={`app-frame${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
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
        {isVisitor ? (
          <button className="mobile-login-link" type="button" onClick={() => requestLogin("登录后即可同步并继续使用全部功能。")}>登录</button>
        ) : (
          <span className="mobile-avatar" aria-hidden="true">{user?.displayName.slice(0, 1) || "O"}</span>
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
          <AppLink href="/app/chat" onNavigate={closeMobile}><Logo /></AppLink>
          <button
            className="sidebar-collapse-toggle"
            type="button"
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="app-sidebar"
            title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed
              ? <PanelLeftOpen aria-hidden="true" size={19} strokeWidth={1.8} />
              : <PanelLeftClose aria-hidden="true" size={19} strokeWidth={1.8} />}
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
          新对话
          <span>⌘ K</span>
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
                <span>{item.label}</span>
                {item.href === "/app/opportunities" && <em>实时</em>}
              </AppLink>
            );
          })}
        </nav>

        <section className="recent-threads" aria-labelledby="recent-thread-title">
          <div className="sidebar-section-heading">
            <span id="recent-thread-title">最近对话</span>
            <Clock3 aria-hidden="true" size={14} />
          </div>
          <div className="thread-links">
            {conversations.map((conversation) => {
              const href = `/app/chat/${encodeURIComponent(conversation.id)}`;
              return (
                <AppLink
                  key={conversation.id}
                  href={href}
                  className={`thread-link${pathname === href ? " is-active" : ""}`}
                  onNavigate={closeMobile}
                >
                  <span>{conversation.title}</span>
                </AppLink>
              );
            })}
            {!conversations.length && (
              <p className="thread-empty">你的求职问题会保存在这里。</p>
            )}
          </div>
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
                  <span className="account-avatar">{user?.displayName.slice(0, 1) || "O"}</span>
                  <span><strong>{user?.displayName || "JobKoI 用户"}</strong><small>Free</small></span>
                  <ChevronDown aria-hidden="true" size={15} />
                </button>

                <div className="account-popover" id="account-popover" aria-label="账户菜单">
                  <header className="account-profile">
                    <span className="account-avatar account-avatar--large">{user?.displayName.slice(0, 1) || "O"}</span>
                    <span><strong>{user?.displayName || "JobKoI 用户"}</strong><small>{user?.email}</small></span>
                  </header>

                  <section className="account-plan-card" aria-label="当前会员方案">
                    <div><strong>Free</strong><AppLink href="/app/upgrade" onNavigate={closeMobile}>升级</AppLink></div>
                    <p><span>试用额度</span><b>5 次</b></p>
                    <p><span>云端同步</span><b className="is-connected"><Cloud aria-hidden="true" size={13} />已连接</b></p>
                  </section>

                  <div className="account-popover-links">
                    <AppLink href="/app/settings" onNavigate={closeMobile}>
                      <Settings aria-hidden="true" size={16} />设置与设备同步
                    </AppLink>
                    <AppLink href="/app/chat" onNavigate={closeMobile}>
                      <Home aria-hidden="true" size={16} />返回首页
                    </AppLink>
                    <button type="button" onClick={() => { setAccountOpen(false); setContactOpen(true); }}>
                      <MessageCircleMore aria-hidden="true" size={16} />联系我们
                    </button>
                    <button type="button" disabled title="后续接入">
                      <Info aria-hidden="true" size={16} />更新日志<span>即将上线</span>
                    </button>
                    <button type="button" disabled title="后续接入">
                      <Gift aria-hidden="true" size={16} />赠送会员<span>即将上线</span>
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

            <div
              className={`contact-menu${contactOpen ? " is-open" : ""}`}
              ref={contactMenuRef}
              onBlur={(event) => closeWhenFocusLeaves(event, () => setContactOpen(false))}
            >
              <button
                className="sidebar-footer-icon"
                type="button"
                aria-expanded={contactOpen}
                aria-controls="contact-popover"
                aria-label="联系我们"
                onClick={() => setContactOpen((current) => !current)}
              >
                <MessageCircleMore aria-hidden="true" size={18} />
              </button>
              <section className="contact-popover" id="contact-popover" aria-labelledby="contact-title">
                <div className="contact-popover-heading">
                  <h2 id="contact-title">联系我们</h2>
                  <button type="button" aria-label="关闭联系我们" onClick={() => setContactOpen(false)}>
                    <X aria-hidden="true" size={16} />
                  </button>
                </div>
                <div className="contact-illustration" aria-hidden="true">
                  <MessageCircleMore size={28} />
                  <i /><i /><i />
                </div>
                <p>遇到问题或有产品建议？欢迎加入 JobKoI 求职交流 QQ 群。</p>
                <div className="qq-group-placeholder">
                  <span>JobKoI 求职交流群</span>
                  <strong>QQ群号待接入</strong>
                </div>
                <button className="contact-primary" type="button" disabled>QQ群即将开放</button>
                <small>正式群号接入后，这里会支持一键复制。</small>
              </section>
            </div>
          </div>
        </div>
      </aside>

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
    </div>
  );
}
