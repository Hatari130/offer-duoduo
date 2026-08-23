import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { api } from "../app/api";
import { Logo } from "../components/Logo";

function redirectWithCode(redirectUri: string, state: string, code: string): void {
  if (!redirectUri.startsWith("https://")) {
    throw new Error("插件授权地址无效");
  }
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  window.location.assign(callback.toString());
}

export function ExtensionConnectPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectUri = params.get("redirect_uri");
    const state = params.get("state");
    if (!redirectUri || !state) {
      setError("没有找到插件授权请求，请从插件重新开始");
      return;
    }

    let active = true;
    api.auth
      .createDeviceCode()
      .then(({ code }) => {
        if (active) redirectWithCode(redirectUri, state, code);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "连接插件失败");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="extension-connect-page">
      <div className="extension-connect-card">
        <Logo />
        {error ? (
          <>
            <div className="extension-connect-icon is-error">!</div>
            <h1>插件连接失败</h1>
            <p>{error}</p>
          </>
        ) : (
          <>
            <div className="extension-connect-icon">
              <CheckCircle2 aria-hidden="true" size={26} />
            </div>
            <h1>正在连接浏览器插件</h1>
            <p>登录已确认，马上把你的投递记录同步到 JobKoI 插件。</p>
            <div className="extension-connect-progress" role="status">
              <LoaderCircle className="spin" aria-hidden="true" size={16} />正在安全交接登录状态
            </div>
          </>
        )}
        <footer><ShieldCheck aria-hidden="true" size={14} />只授权当前浏览器插件，不会暴露你的密码</footer>
      </div>
    </main>
  );
}
