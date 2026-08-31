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
import { ResumeStudioPage } from "../pages/ResumeStudioPage";
import { ResumeLibraryPage } from "../pages/ResumeLibraryPage";
import { BrowserExtensionPage } from "../pages/BrowserExtensionPage";
import { Logo } from "../components/Logo";
import { LegalPage } from "../pages/LegalPage";
import { AuthDialog } from "../components/AuthDialog";
import { CompanionOnboardingDialog } from "../components/CompanionOnboardingDialog";
import { loginReasonForPath } from "./authAccess";

const titles: Array<[RegExp, string]> = [
  [/^\/app\/chat/, "求职陪跑"],
  [/^\/app\/opportunities/, "校招信息速递"],
  [/^\/app\/companies/, "公司投递一键直达"],
  [/^\/app\/applications/, "个人投递管理"],
  [/^\/app\/resumes\/tailor/, "岗位定制简历"],
  [/^\/app\/resumes/, "简历中心"],
  [/^\/app\/settings/, "设置与设备同步"],
  [/^\/browser-extension/, "浏览器插件"],
  [/^\/privacy$/, "隐私政策"],
  [/^\/terms$/, "用户协议"]
];

export function App() {
  const pathname = usePathname();
  const { status, requestLogin } = useAuth();
  const extensionConnect = pathname.startsWith("/extension/connect");
  const extensionLanding = pathname.startsWith("/browser-extension");
  const legalPage = pathname === "/privacy" || pathname === "/terms";
  const protectedReason = status === "anonymous" ? loginReasonForPath(pathname) : undefined;

  useEffect(() => {
    if (status === "anonymous" && protectedReason) {
      requestLogin(protectedReason);
      navigate("/app/chat", { replace: true });
      return;
    }
    if ((status === "authenticated" || status === "guest") && pathname === "/login") navigate("/app/chat", { replace: true });
    if (
      status !== "loading"
      && pathname !== "/login"
      && !pathname.startsWith("/app")
      && !extensionConnect
      && !extensionLanding
      && !legalPage
    ) {
      navigate("/app/chat", { replace: true });
    }
  }, [extensionConnect, extensionLanding, legalPage, pathname, protectedReason, requestLogin, status]);

  useEffect(() => {
    const section = titles.find(([pattern]) => pattern.test(pathname))?.[1];
    document.title = section ? `${section} · JobKoI` : "JobKoI · 求职工作台";
    if (status !== "loading" && pathname.startsWith("/app")) {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("#main-content h1")?.focus());
    }
  }, [pathname, status]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (status === "anonymous") requestLogin("登录后即可开始并保存新的求职对话。");
        else navigate("/app/chat");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [requestLogin, status]);

  if (extensionLanding) return <BrowserExtensionPage />;
  if (legalPage) return <LegalPage kind={pathname === "/privacy" ? "privacy" : "terms"} />;

  if (status === "loading") {
    return (
      <main className="app-boot" role="status">
        <Logo />
        <LoaderCircle className="spin" aria-hidden="true" size={20} />
        <span>正在连接你的工作台…</span>
      </main>
    );
  }

  if (pathname === "/login") return <LoginPage />;
  const tailorMatch = pathname.match(/^\/app\/resumes\/tailor\/([^/]+)$/);
  if (tailorMatch && !protectedReason) return <ResumeStudioPage taskId={decodeURIComponent(tailorMatch[1])} />;

  let page: React.ReactNode;
  if (protectedReason) page = <ChatPage />;
  else if (extensionConnect) page = <ExtensionConnectPage />;
  else if (pathname.startsWith("/app/opportunities")) page = <OpportunitiesPage />;
  else if (pathname.startsWith("/app/companies")) page = <CompanyDirectoryPage />;
  else if (pathname.startsWith("/app/applications")) page = <ApplicationsPage />;
  else if (pathname.startsWith("/app/resumes")) page = <ResumeLibraryPage />;
  else if (pathname.startsWith("/app/settings")) page = <SettingsPage />;
  else page = <ChatPage conversationId={conversationIdFromPath(pathname)} />;

  return (
    <>
      <AppShell pathname={pathname}>{page}</AppShell>
      <AuthDialog />
      <CompanionOnboardingDialog />
    </>
  );
}
