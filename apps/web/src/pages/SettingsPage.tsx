import { useRef, useState } from "react";
import { Cloud, Download, LogOut, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { API_BASE_URL, api } from "../app/api";
import { useAuth } from "../app/AuthContext";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmOtherSessions, setConfirmOtherSessions] = useState(false);
  const otherSessionsTriggerRef = useRef<HTMLButtonElement>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const closeOtherSessionsConfirmation = () => {
    setConfirmOtherSessions(false);
    window.requestAnimationFrame(() => otherSessionsTriggerRef.current?.focus());
  };

  const revokeOtherSessions = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.auth.listSessions();
      const otherSessionIds = result.sessions
        .filter((session) => session.id !== result.currentSessionId)
        .map((session) => session.id);
      if (otherSessionIds.length === 0) {
        setMessage("当前没有其他设备需要退出");
      } else {
        const revocations = await Promise.allSettled(otherSessionIds.map((sessionId) => api.auth.revokeSession(sessionId)));
        const failedCount = revocations.filter((item) => item.status === "rejected").length;
        if (failedCount > 0) throw new Error("部分设备未能退出，请重试");
        setMessage("其他设备已退出，当前页面继续保持登录");
      }
      closeOtherSessionsConfirmation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法退出其他设备，请重试");
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

  return (
    <section className="data-page settings-page">
      <header className="page-header">
        <div><span className="page-kicker"><ShieldCheck aria-hidden="true" size={14} />账号与同步</span><h1 tabIndex={-1}>设置与设备同步</h1><p>管理账号、安全状态与个人数据。</p></div>
      </header>

      <div className="settings-grid">
        <section className="settings-card account-settings-card">
          <div className="settings-card-icon"><Cloud aria-hidden="true" size={21} /></div>
          <div><span className="settings-label">当前账号</span><h2>{user?.displayName}</h2><p>{user?.email}</p></div>
          <button className="secondary-button" type="button" onClick={() => void logout()}><LogOut aria-hidden="true" size={16} />退出登录</button>
        </section>

        <section className="settings-card endpoint-card">
          <div className="settings-card-icon"><ShieldCheck aria-hidden="true" size={21} /></div>
          <div><span className="settings-label">数据连接</span><h2>JobKoI API</h2><p><code>{API_BASE_URL}</code></p><small>模型密钥和知识库只保存在服务端，不会进入 Web 或插件包。</small></div>
        </section>

        <section className="settings-card security-summary-card">
          <div className="settings-card-heading"><div className="settings-card-icon"><MonitorSmartphone aria-hidden="true" size={21} /></div><div><span className="settings-label">安全</span><h2>登录安全</h2></div></div>
          <div className="security-summary-row">
            <div>
              <strong>当前账号在线</strong>
              <p>设备明细已隐藏。需要时可一次退出其他浏览器和插件，当前页面不会退出。</p>
            </div>
            <button
              ref={otherSessionsTriggerRef}
              className="secondary-button"
              type="button"
              aria-expanded={confirmOtherSessions}
              aria-controls="other-sessions-confirmation"
              disabled={busy}
              onClick={() => setConfirmOtherSessions((current) => !current)}
            >
              <LogOut aria-hidden="true" size={16} />退出其他设备
            </button>
          </div>
          {confirmOtherSessions && (
            <div className="other-sessions-confirmation" id="other-sessions-confirmation" role="group" aria-labelledby="other-sessions-confirmation-title">
              <div>
                <strong id="other-sessions-confirmation-title">退出其他设备？</strong>
                <p>其他浏览器和插件需要重新登录；当前页面不会退出。</p>
              </div>
              <div className="other-sessions-confirmation-actions">
                <button className="secondary-button" type="button" disabled={busy} onClick={closeOtherSessionsConfirmation}>取消</button>
                <button className="session-revoke-button" type="button" disabled={busy} onClick={() => void revokeOtherSessions()}>
                  <LogOut aria-hidden="true" size={16} />{busy ? "正在退出" : "确认退出其他设备"}
                </button>
              </div>
            </div>
          )}
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
