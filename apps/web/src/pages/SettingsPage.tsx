import { useState } from "react";
import { Check, Cloud, Copy, KeyRound, Link2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { API_BASE_URL, api } from "../app/api";
import { useAuth } from "../app/AuthContext";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [code, setCode] = useState<string>();
  const [expiresAt, setExpiresAt] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const createCode = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.auth.createDeviceCode();
      setCode(result.code);
      setExpiresAt(result.expiresAt);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法生成配对码");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="data-page settings-page">
      <header className="page-header">
        <div><span className="page-kicker"><ShieldCheck aria-hidden="true" size={14} />ACCOUNT & SYNC</span><h1 tabIndex={-1}>设置与设备同步</h1><p>管理账号，并把浏览器插件连接到同一个 OfferFlow 工作台。</p></div>
      </header>

      <div className="settings-grid">
        <section className="settings-card account-settings-card">
          <div className="settings-card-icon"><Cloud aria-hidden="true" size={21} /></div>
          <div><span className="settings-label">当前账号</span><h2>{user?.displayName}</h2><p>{user?.email}</p></div>
          <button className="secondary-button" type="button" onClick={logout}><LogOut aria-hidden="true" size={16} />退出登录</button>
        </section>

        <section className="settings-card pairing-card">
          <div className="settings-card-heading"><div className="settings-card-icon"><Link2 aria-hidden="true" size={21} /></div><div><span className="settings-label">浏览器插件</span><h2>配对一个新设备</h2></div></div>
          <p>在插件的“设置与备份”中输入配对码。配对后，插件会本地优先保存，并在后台增量同步投递记录。</p>
          {code ? (
            <div className="pairing-code-block">
              <span>一次性配对码</span>
              <button type="button" onClick={() => void copyCode()} aria-label="复制配对码"><strong>{code}</strong>{copied ? <Check aria-hidden="true" size={18} /> : <Copy aria-hidden="true" size={18} />}</button>
              <small>{expiresAt ? `${new Date(expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 前有效，使用后立即失效。` : "10 分钟内有效。"}</small>
            </div>
          ) : (
            <div className="pairing-placeholder"><KeyRound aria-hidden="true" size={20} /><span>生成一个只使用一次的 8 位配对码。</span></div>
          )}
          <button className="primary-button" type="button" onClick={() => void createCode()} disabled={busy}>{busy ? <RefreshCw className="spin" aria-hidden="true" size={16} /> : <KeyRound aria-hidden="true" size={16} />}{code ? "重新生成配对码" : "生成配对码"}</button>
        </section>

        <section className="settings-card endpoint-card">
          <div className="settings-card-icon"><ShieldCheck aria-hidden="true" size={21} /></div>
          <div><span className="settings-label">数据连接</span><h2>OfferFlow API</h2><p><code>{API_BASE_URL}</code></p><small>模型密钥和知识库只保存在服务端，不会进入 Web 或插件包。</small></div>
        </section>
      </div>
      <div className="page-announcer" role={message ? "alert" : "status"}>{message}</div>
    </section>
  );
}
