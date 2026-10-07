import { lazy, Suspense, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "./AuthContext";
import { conversationIdFromPath, navigate, usePathname } from "./router";
import { AppShell } from "../layouts/AppShell";
import { ChatPage } from "../pages/ChatPage";
import { Logo } from "../components/Logo";
import { AuthDialog } from "../components/AuthDialog";
import { CompanionOnboardingDialog } from "../components/CompanionOnboardingDialog";
import { loginReasonForPath } from "./authAccess";

// Chat is the landing route and stays in the entry chunk; every other page loads on demand.
const pageLoaders = {
  login: () => import("../pages/LoginPage"),
  opportunities: () => import("../pages/OpportunitiesPage"),
  companies: () => import("../pages/CompanyDirectoryPage"),
  applications: () => import("../pages/ApplicationsPage"),
  settings: () => import("../pages/SettingsPage"),
  extensionConnect: () => import("../pages/ExtensionConnectPage"),
  resumeStudio: () => import("../pages/ResumeStudioPage"),
  resumeLibrary: () => import("../pages/ResumeLibraryPage"),
  browserExtension: () => import("../pages/BrowserExtensionPage"),
  helpCenter: () => import("../pages/HelpCenterPage"),
  legal: () => import("../pages/LegalPage")
};

const LoginPage = lazy(() => pageLoaders.login().then((m) => ({ default: m.LoginPage })));
const OpportunitiesPage = lazy(() => pageLoaders.opportunities().then((m) => ({ default: m.OpportunitiesPage })));
const CompanyDirectoryPage = lazy(() => pageLoaders.companies().then((m) => ({ default: m.CompanyDirectoryPage })));
const ApplicationsPage = lazy(() => pageLoaders.applications().then((m) => ({ default: m.ApplicationsPage })));
const SettingsPage = lazy(() => pageLoaders.settings().then((m) => ({ default: m.SettingsPage })));
const ExtensionConnectPage = lazy(() => pageLoaders.extensionConnect().then((m) => ({ default: m.ExtensionConnectPage })));
const ResumeStudioPage = lazy(() => pageLoaders.resumeStudio().then((m) => ({ default: m.ResumeStudioPage })));
const ResumeLibraryPage = lazy(() => pageLoaders.resumeLibrary().then((m) => ({ default: m.ResumeLibraryPage })));
const BrowserExtensionPage = lazy(() => pageLoaders.browserExtension().then((m) => ({ default: m.BrowserExtensionPage })));
const HelpCenterPage = lazy(() => pageLoaders.helpCenter().then((m) => ({ default: m.HelpCenterPage })));
const LegalPage = lazy(() => pageLoaders.legal().then((m) => ({ default: m.LegalPage })));

// Warm the sidebar destinations once the browser is idle so in-app navigation never waits on the network.
function prefetchShellPages() {
  const run = () => {
    void pageLoaders.opportunities();
    void pageLoaders.companies();
    void pageLoaders.applications();
    void pageLoaders.resumeLibrary();
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

const pageFallback = <div className="route-fallback" aria-busy="true" />;

const titles: Array<[RegExp, string]> = [
  [/^\/app\/chat/, "求职陪跑"],
  [/^\/app\/opportunities/, "校招信息速递"],
  [/^\/app\/companies/, "公司投递一键直达"],
  [/^\/app\/applications/, "个人投递管理"],
  [/^\/app\/resumes\/tailor/, "岗位定制简历"],
  [/^\/app\/resumes\/edit/, "制作简历"],
  [/^\/app\/resumes/, "简历模板"],
  [/^\/app\/settings/, "设置与设备同步"],
  [/^\/browser-extension/, "浏览器插件"],
  [/^\/help-center$/, "帮助中心"],
  [/^\/privacy$/, "隐私政策"],
  [/^\/terms$/, "用户协议"]
];

export function App() {
  const pathname = usePathname();
  const { status, requestLogin } = useAuth();
  const extensionConnect = pathname.startsWith("/extension/connect");
  const extensionLanding = pathname.startsWith("/browser-extension");
  const legalPage = pathname === "/privacy" || pathname === "/terms";
  const helpPage = pathname === "/help-center";
  const protectedReason = status === "anonymous" ? loginReasonForPath(pathname) : undefined;

  useEffect(() => {
    if (status === "anonymous" && protectedReason) {
      requestLogin(protectedReason);
      if (!extensionConnect) {
        navigate("/app/chat", { replace: true });
      }
      return;
    }
    if ((status === "authenticated" || status === "guest") && pathname === "/login") navigate("/app/chat", { replace: true });
    if (
      status !== "loading"
      && pathname !== "/login"
      && !pathname.startsWith("/app")
      && !extensionConnect
      && !extensionLanding
      && !helpPage
      && !legalPage
    ) {
      navigate("/app/chat", { replace: true });
    }
  }, [extensionConnect, extensionLanding, helpPage, legalPage, pathname, protectedReason, requestLogin, status]);

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

  useEffect(() => {
    if (status === "authenticated" || status === "guest") prefetchShellPages();
  }, [status]);

  if (extensionLanding) return <Suspense fallback={pageFallback}><BrowserExtensionPage /></Suspense>;
  if (helpPage) return <Suspense fallback={pageFallback}><HelpCenterPage /></Suspense>;
  if (legalPage) return <Suspense fallback={pageFallback}><LegalPage kind={pathname === "/privacy" ? "privacy" : "terms"} /></Suspense>;

  if (status === "loading") {
    return (
      <main className="app-boot" role="status">
        <Logo />
        <LoaderCircle className="spin" aria-hidden="true" size={20} />
        <span>正在连接你的工作台…</span>
      </main>
    );
  }

  if (pathname === "/login") return <Suspense fallback={pageFallback}><LoginPage /></Suspense>;
  const tailorMatch = pathname.match(/^\/app\/resumes\/tailor\/([^/]+)$/);
  if (tailorMatch && !protectedReason) return <Suspense fallback={pageFallback}><ResumeStudioPage key={`task:${tailorMatch[1]}`} taskId={decodeURIComponent(tailorMatch[1])} /></Suspense>;
  const resumeEditMatch = pathname.match(/^\/app\/resumes\/edit\/([^/]+)$/);
  if (resumeEditMatch && !protectedReason) return <Suspense fallback={pageFallback}><ResumeStudioPage key={`template:${resumeEditMatch[1]}`} templateId={decodeURIComponent(resumeEditMatch[1])} /></Suspense>;

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
      <AppShell pathname={pathname}><Suspense fallback={pageFallback}>{page}</Suspense></AppShell>
      <AuthDialog />
      <CompanionOnboardingDialog />
    </>
  );
}
