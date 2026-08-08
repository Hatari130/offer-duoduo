import { useEffect, useState, type MouseEvent, type PropsWithChildren } from "react";
import type { ChatConversation } from "@offerflow/domain";
import {
  BriefcaseBusiness,
  ChevronDown,
  Cloud,
  LogOut,
  Menu,
  MessageCircleMore,
  Newspaper,
  Plus,
  Settings,
  Sparkles,
  X
} from "lucide-react";
import { api } from "../app/api";
import { useAuth } from "../app/AuthContext";
import { navigate } from "../app/router";
import { Logo } from "../components/Logo";

interface AppLinkProps extends PropsWithChildren {
  href: string;
  className?: string;
  onNavigate?: () => void;
}

function AppLink({ href, className, onNavigate, children }: AppLinkProps) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
    onNavigate?.();
  };
  return <a href={href} className={className} onClick={open}>{children}</a>;
}

const primaryNavigation = [
  { href: "/app/chat", label: "求职助手", icon: MessageCircleMore },
  { href: "/app/opportunities", label: "校招信息速递", icon: Newspaper },
  { href: "/app/applications", label: "个人投递管理", icon: BriefcaseBusiness }
];

export function AppShell({ pathname, children }: PropsWithChildren<{ pathname: string }>) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
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
  }, [user?.id]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="mobile-header">
        <button type="button" aria-label="打开导航" onClick={() => setMobileOpen(true)}>
          <Menu aria-hidden="true" size={21} />
        </button>
        <Logo />
        <span className="mobile-avatar" aria-hidden="true">{user?.displayName.slice(0, 1) || "O"}</span>
      </header>

      <button
        className={`sidebar-scrim${mobileOpen ? " is-visible" : ""}`}
        type="button"
        aria-label="关闭导航"
        onClick={closeMobile}
      />

      <aside className={`app-sidebar${mobileOpen ? " is-open" : ""}`} aria-label="主导航">
        <div className="sidebar-brand-row">
          <AppLink href="/app/chat" onNavigate={closeMobile}><Logo /></AppLink>
          <button className="sidebar-close" type="button" aria-label="关闭导航" onClick={closeMobile}>
            <X aria-hidden="true" size={19} />
          </button>
        </div>

        <AppLink href="/app/chat" className="new-chat-button" onNavigate={closeMobile}>
          <Plus aria-hidden="true" size={18} strokeWidth={2} />
          新对话
          <span>⌘ K</span>
        </AppLink>

        <nav className="primary-nav" aria-label="功能页">
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <AppLink
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " is-active" : ""}`}
                onNavigate={closeMobile}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={active ? 2 : 1.7} />
                <span>{item.label}</span>
                {item.href === "/app/opportunities" && <em>待接入</em>}
              </AppLink>
            );
          })}
        </nav>

        <section className="recent-threads" aria-labelledby="recent-thread-title">
          <div className="sidebar-section-heading">
            <span id="recent-thread-title">最近对话</span>
            <Sparkles aria-hidden="true" size={14} />
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
          <div className="cloud-status" role="status">
            <Cloud aria-hidden="true" size={15} />
            <span><strong>云端已连接</strong><small>投递记录将自动同步</small></span>
            <i aria-hidden="true" />
          </div>
          <details className="account-menu">
            <summary>
              <span className="account-avatar">{user?.displayName.slice(0, 1) || "O"}</span>
              <span><strong>{user?.displayName || "OfferFlow 用户"}</strong><small>{user?.email}</small></span>
              <ChevronDown aria-hidden="true" size={15} />
            </summary>
            <div className="account-popover">
              <AppLink href="/app/settings" onNavigate={closeMobile}>
                <Settings aria-hidden="true" size={16} />设置与设备同步
              </AppLink>
              <button type="button" onClick={logout}>
                <LogOut aria-hidden="true" size={16} />退出登录
              </button>
            </div>
          </details>
        </div>
      </aside>

      <div className="workspace-shell">
        <main id="main-content" className="workspace-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
