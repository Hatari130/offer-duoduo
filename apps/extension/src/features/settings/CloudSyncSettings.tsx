import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Link2,
  RefreshCw,
  Upload,
  Unplug
} from "lucide-react";
import {
  DEFAULT_CLOUD_API_URL,
  disconnectCloud,
  getCloudSyncOverview,
  loginAndSync as loginAndSyncCloud,
  pairCloudDevice,
  resyncAllCloud,
  runCloudSync,
  type CloudSyncOverview
} from "@/infrastructure/sync/cloudSync";
import {
  CLOUD_CONNECTION_KEY,
  CLOUD_SYNC_OUTBOX_KEY,
  CLOUD_SYNC_STATE_KEY
} from "@/infrastructure/sync/syncState";
import "./cloud-sync.css";

function formatSyncTime(value?: string): string {
  if (!value) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function CloudSyncSettings() {
  const [overview, setOverview] = useState<CloudSyncOverview>();
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_CLOUD_API_URL);
  const [pairingCode, setPairingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    const next = await getCloudSyncOverview();
    setOverview(next);
    if (next.connection) setApiBaseUrl(next.connection.apiBaseUrl);
  };

  useEffect(() => {
    void refresh();
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (
        changes[CLOUD_CONNECTION_KEY] ||
        changes[CLOUD_SYNC_STATE_KEY] ||
        changes[CLOUD_SYNC_OUTBOX_KEY]
      ) {
        void refresh();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const pair = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await pairCloudDevice(pairingCode, apiBaseUrl);
      setOverview(next);
      setPairingCode("");
      setMessage("设备已配对，投递记录已完成首轮同步。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "设备配对失败");
    } finally {
      setBusy(false);
    }
  };

  const loginAndSync = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await loginAndSyncCloud();
      setOverview(next);
      setMessage(`已登录并同步 ${next.state.lastUploadedCount ?? 0} 条投递记录`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录并同步失败");
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await runCloudSync();
      setOverview(next);
      setMessage("本地与 Web 工作台已同步。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "同步失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const resyncAll = async () => {
    if (
      !window.confirm(
        "将本地全部投递记录重新上传到工作台？用于服务端数据丢失后恢复，不会影响云端连接。"
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await resyncAllCloud();
      setOverview(next);
      setMessage(`已重新上传 ${next.state.lastUploadedCount ?? 0} 条投递记录`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重新上传失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("断开云端连接？本地投递记录不会被删除。")) return;
    setBusy(true);
    setError("");
    try {
      await disconnectCloud();
      await refresh();
      setMessage("已断开连接，本地记录保持不变。");
    } finally {
      setBusy(false);
    }
  };

  const connection = overview?.connection;
  const conflicts = overview?.state.conflicts ?? [];

  return (
    <section className="settings-card cloud-sync-card" aria-labelledby="cloud-sync-title">
      <div className="setting-icon cloud-sync-icon">
        <Cloud size={24} aria-hidden="true" />
      </div>
      <div className="setting-copy cloud-sync-copy">
        <h3 id="cloud-sync-title">OfferFlow Web 工作台</h3>
        <p>本地优先保存，联网后只同步发生变化的投递记录；版本冲突会保留本地内容并提示处理。</p>

        {connection ? (
          <div className="cloud-sync-connected">
            <div className="connection-state">
              <span className="connected-dot" />
              已连接 {connection.user.displayName} · {connection.user.email}
            </div>
            <dl className="cloud-sync-stats">
              <div><dt>最近同步</dt><dd>{formatSyncTime(overview?.state.lastSyncedAt)}</dd></div>
              <div><dt>待上传</dt><dd>{overview?.pendingCount ?? 0} 条</dd></div>
              <div><dt>冲突</dt><dd className={conflicts.length ? "has-conflict" : ""}>{conflicts.length} 条</dd></div>
            </dl>
            {overview?.state.lastSyncedAt && (
              <p className="cloud-sync-last-result">
                最近一次同步：上传 {overview.state.lastUploadedCount ?? 0} 条，收到 {overview.state.lastReceivedCount ?? 0} 条更新
              </p>
            )}
            <code className="cloud-sync-endpoint">{connection.apiBaseUrl}</code>
          </div>
        ) : (
          <>
          <button className="button button--primary cloud-login-button" type="button" onClick={() => void loginAndSync()} disabled={busy}>
            {busy ? <RefreshCw className="spin" size={16} /> : <Cloud size={16} />}
            登录 OfferFlow 并同步投递
          </button>
          <details className="cloud-advanced-pairing">
            <summary>开发者配对方式</summary>
            <form className="cloud-pair-form" onSubmit={pair}>
            <label>
              <span>Web 端 API 地址</span>
              <input
                type="url"
                required
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder={DEFAULT_CLOUD_API_URL}
              />
            </label>
            <label>
              <span>8 位设备配对码</span>
              <input
                className="pair-code-input"
                inputMode="text"
                autoComplete="one-time-code"
                required
                maxLength={12}
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
                placeholder="AB12 CD34"
              />
            </label>
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? <RefreshCw className="spin" size={16} /> : <Link2 size={16} />}
              连接工作台
            </button>
            </form>
          </details>
          </>
        )}

        {conflicts.length > 0 && (
          <div className="cloud-conflict-list" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            <div>
              <strong>有 {conflicts.length} 条记录需要确认</strong>
              <span>
                {conflicts.slice(0, 2).map((conflict) => {
                  const application = conflict.server?.application;
                  return application ? `${application.company} · ${application.position}` : conflict.entityId;
                }).join("、")}
              </span>
            </div>
          </div>
        )}
        {overview?.state.lastError && !error && (
          <p className="cloud-sync-feedback is-error" role="alert">{overview.state.lastError}</p>
        )}
        {error && <p className="cloud-sync-feedback is-error" role="alert">{error}</p>}
        {message && <p className="cloud-sync-feedback is-success" role="status"><CheckCircle2 size={13} />{message}</p>}
      </div>

      {connection && (
        <div className="cloud-sync-actions">
          <button className="button button--secondary" type="button" onClick={() => void syncNow()} disabled={busy}>
            <RefreshCw className={busy ? "spin" : ""} size={16} />
            立即同步
          </button>
          <button className="button button--secondary" type="button" onClick={() => void resyncAll()} disabled={busy}>
            <Upload size={14} />
            重新上传全部
          </button>
          <button className="cloud-disconnect-button" type="button" onClick={() => void disconnect()} disabled={busy}>
            <Unplug size={14} />断开
          </button>
        </div>
      )}
    </section>
  );
}
