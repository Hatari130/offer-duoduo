import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "./AuthContext";
import { conversationIdFromPath, navigate, usePathname } from "./router";
import { AppShell } from "../layouts/AppShell";
import { LoginPage } from "../pages/LoginPage";
import { ChatPage } from "../pages/ChatPage";
import { OpportunitiesPage } from "../pages/OpportunitiesPage";
import { CompanyDirectoryPage } from "../pages/CompanyDirectoryPage";
import { ApplicationsPage } from "../pages/ApplicationsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { ExtensionConnectPage } from "../pages/ExtensionConnectPage";
import { MembershipPage } from "../pages/MembershipPage";
import { ResumeStudioPage } from "../pages/ResumeStudioPage";
import { ResumeLibraryPage } from "../pages/ResumeLibraryPage";
import { BrowserExtensionPage } from "../pages/BrowserExtensionPage";
import { Logo } from "../components/Logo";

const titles: Array<[RegExp, string]> = [
  [/^\/app\/chat/, "求职助手"],
  [/^\/app\/opportunities/, "校招信息速递"],
  [/^\/app\/companies/, "公司投递一键直达"],
  [/^\/app\/applications/, "个人投递管理"],
  [/^\/app\/resumes\/tailor/, "岗位定制简历"],
  [/^\/app\/resumes/, "简历中心"],
  [/^\/app\/upgrade/, "升级至 Pro"],
  [/^\/app\/settings/, "设置与设备同步"],
  [/^\/browser-extension/, "浏览器插件"]
];

export function App() {
  const pathname = usePathname();
  const { status } = useAuth();
  const extensionConnect = pathname.startsWith("/extension/connect");
  const extensionLanding = pathname.startsWith("/browser-extension");

  useEffect(() => {
    if (status === "anonymous" && pathname !== "/login" && !extensionConnect && !extensionLanding) navigate("/login", { replace: true });
    if (status === "authenticated" && !pathname.startsWith("/app") && !extensionConnect && !extensionLanding) navigate("/app/chat", { replace: true });
  }, [extensionConnect, extensionLanding, pathname, status]);

  useEffect(() => {
    const section = titles.find(([pattern]) => pattern.test(pathname))?.[1];
    document.title = section ? `${section} · JobKoI` : "JobKoI · 求职工作台";
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

  if (extensionLanding) return <BrowserExtensionPage />;

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
  if (pathname.startsWith("/app/upgrade")) return <MembershipPage />;
  const tailorMatch = pathname.match(/^\/app\/resumes\/tailor\/([^/]+)$/);
  if (tailorMatch) return <ResumeStudioPage taskId={decodeURIComponent(tailorMatch[1])} />;

  let page: React.ReactNode;
  if (extensionConnect) page = <ExtensionConnectPage />;
  else if (pathname.startsWith("/app/opportunities")) page = <OpportunitiesPage />;
  else if (pathname.startsWith("/app/companies")) page = <CompanyDirectoryPage />;
  else if (pathname.startsWith("/app/applications")) page = <ApplicationsPage />;
  else if (pathname.startsWith("/app/resumes")) page = <ResumeLibraryPage />;
  else if (pathname.startsWith("/app/settings")) page = <SettingsPage />;
  else page = <ChatPage conversationId={conversationIdFromPath(pathname)} />;

  return <AppShell pathname={pathname}>{page}</AppShell>;
}
