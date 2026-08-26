import { useEffect, useState } from "react";
import type { AuthDeviceSession } from "@offerflow/contracts";
import { Check, Cloud, Copy, Download, KeyRound, Link2, LogOut, MonitorSmartphone, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { API_BASE_URL, api } from "../app/api";
import { useAuth } from "../app/AuthContext";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [code, setCode] = useState<string>();
  const [expiresAt, setExpiresAt] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState<AuthDeviceSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const loadSessions = async () => {
    try {
      const result = await api.auth.listSessions();
      setSessions(result.sessions);
      setCurrentSessionId(result.currentSessionId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取登录设备");
    }
  };

  useEffect(() => { void loadSessions(); }, []);

  const revokeSession = async (sessionId: string) => {
    setBusy(true);
    try {
      await api.auth.revokeSession(sessionId);
      if (sessionId === currentSessionId) await logout();
      else await loadSessions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法撤销这个设备");
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const data = await api.account.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `jobkoi-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("数据副本已导出");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法导出数据");
    } finally { setBusy(false); }
  };

  const deleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (deleteConfirmation !== "DELETE" || !deletePassword) {
      setMessage("请输入当前密码，并输入 DELETE 确认");
      return;
    }
    setBusy(true);
    try {
      await api.account.delete({ password: deletePassword, confirmation: "DELETE" });
      await logout();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法删除账号");
    } finally { setBusy(false); }
  };

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
        <div><span className="page-kicker"><ShieldCheck aria-hidden="true" size={14} />账号与同步</span><h1 tabIndex={-1}>设置与设备同步</h1><p>管理账号，并把浏览器插件连接到同一个 JobKoI 工作台。</p></div>
      </header>

      <div className="settings-grid">
        <section className="settings-card account-settings-card">
          <div className="settings-card-icon"><Cloud aria-hidden="true" size={21} /></div>
          <div><span className="settings-label">当前账号</span><h2>{user?.displayName}</h2><p>{user?.email}</p></div>
          <button className="secondary-button" type="button" onClick={() => void logout()}><LogOut aria-hidden="true" size={16} />退出登录</button>
        </section>

        <section className="settings-card device-sessions-card">
          <div className="settings-card-heading"><div className="settings-card-icon"><MonitorSmartphone aria-hidden="true" size={21} /></div><div><span className="settings-label">安全</span><h2>已登录设备</h2></div></div>
          <p>发现陌生设备时可立即撤销；插件设备使用独立令牌，不影响网站登录。</p>
          <ul className="device-session-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <div><strong>{session.deviceName || (session.scope === "device" ? "浏览器插件" : "网站会话")}{session.id === currentSessionId ? "（当前）" : ""}</strong><small>最近使用：{new Date(session.lastSeenAt).toLocaleString("zh-CN")} · 到期：{new Date(session.expiresAt).toLocaleDateString("zh-CN")}</small></div>
                <button type="button" className="icon-button" aria-label={`撤销${session.deviceName || "此设备"}`} disabled={busy} onClick={() => void revokeSession(session.id)}><Trash2 aria-hidden="true" size={16} /></button>
              </li>
            ))}
          </ul>
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
          <div><span className="settings-label">数据连接</span><h2>JobKoI API</h2><p><code>{API_BASE_URL}</code></p><small>模型密钥和知识库只保存在服务端，不会进入 Web 或插件包。</small></div>
        </section>

        <section className="settings-card data-rights-card">
          <div className="settings-card-heading"><div className="settings-card-icon"><ShieldCheck aria-hidden="true" size={21} /></div><div><span className="settings-label">隐私权利</span><h2>导出或删除数据</h2></div></div>
          <p>导出会生成你的账号、投递、对话、简历和面试记录副本。删除账号会永久清除服务端个人数据。</p>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void exportData()}><Download aria-hidden="true" size={16} />导出我的数据</button>
          <details>
            <summary>永久删除账号</summary>
            <form onSubmit={deleteAccount} className="delete-account-form">
              <label><span>当前密码</span><input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label>
              <label><span>输入 DELETE 确认</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label>
              <button className="danger-button" type="submit" disabled={busy || user?.email === "demo@offerflow.cn"}><Trash2 aria-hidden="true" size={16} />永久删除</button>
            </form>
          </details>
        </section>
      </div>
      <div className="page-announcer" role={message ? "alert" : "status"}>{message}</div>
    </section>
  );
}
