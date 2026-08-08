import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "./AuthContext";
import { conversationIdFromPath, navigate, usePathname } from "./router";
import { AppShell } from "../layouts/AppShell";
import { LoginPage } from "../pages/LoginPage";
import { ChatPage } from "../pages/ChatPage";
import { OpportunitiesPage } from "../pages/OpportunitiesPage";
import { ApplicationsPage } from "../pages/ApplicationsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { ExtensionConnectPage } from "../pages/ExtensionConnectPage";
import { Logo } from "../components/Logo";

const titles: Array<[RegExp, string]> = [
  [/^\/app\/chat/, "求职助手"],
  [/^\/app\/opportunities/, "校招信息速递"],
  [/^\/app\/applications/, "个人投递管理"],
  [/^\/app\/settings/, "设置与设备同步"]
];

export function App() {
  const pathname = usePathname();
  const { status } = useAuth();
  const extensionConnect = pathname.startsWith("/extension/connect");

  useEffect(() => {
    if (status === "anonymous" && pathname !== "/login" && !extensionConnect) navigate("/login", { replace: true });
    if (status === "authenticated" && !pathname.startsWith("/app") && !extensionConnect) navigate("/app/chat", { replace: true });
  }, [extensionConnect, pathname, status]);

  useEffect(() => {
    const section = titles.find(([pattern]) => pattern.test(pathname))?.[1];
    document.title = section ? `${section} · OfferFlow` : "OfferFlow · 求职工作台";
    if (status === "authenticated") {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("#main-content h1")?.focus());
    }
  }, [pathname, status]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("/app/chat");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  if (status === "loading") {
    return (
      <main className="app-boot" role="status">
        <Logo />
        <LoaderCircle className="spin" aria-hidden="true" size={20} />
        <span>正在连接你的工作台…</span>
      </main>
    );
  }

  if (status === "anonymous") return <LoginPage />;

  let page: React.ReactNode;
  if (extensionConnect) page = <ExtensionConnectPage />;
  else if (pathname.startsWith("/app/opportunities")) page = <OpportunitiesPage />;
  else if (pathname.startsWith("/app/applications")) page = <ApplicationsPage />;
  else if (pathname.startsWith("/app/settings")) page = <SettingsPage />;
  else page = <ChatPage conversationId={conversationIdFromPath(pathname)} />;

  return <AppShell pathname={pathname}>{page}</AppShell>;
}
