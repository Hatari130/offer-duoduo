import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Trash2,
  Link2,
  RefreshCw,
  Upload,
  Unplug
} from "lucide-react";
import {
  cloudErrorMessage,
  disconnectCloud,
  deleteLocalApplicationsAndForgetOwner,
  getCloudSyncOverview,
  loginAndSync as loginAndSyncCloud,
  resolveCloudConflict,
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

export default function CloudSyncSettings({ compact = false }: { compact?: boolean }) {
  const [overview, setOverview] = useState<CloudSyncOverview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    const next = await getCloudSyncOverview();
    setOverview(next);
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

  const loginAndSync = async () => {
    if (!window.confirm("首次连接会把当前本地投递绑定到即将登录的账号。确认继续？")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await loginAndSyncCloud(undefined, undefined, undefined, { allowInitialUpload: true });
      setOverview(next);
      setMessage(`已登录并同步 ${next.state.lastUploadedCount ?? 0} 条投递记录`);
    } catch (cause) {
      setError(cloudErrorMessage(cause, "登录并同步失败"));
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
      setError(cloudErrorMessage(cause, "同步失败，请稍后重试"));
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

  const deleteLocalData = async () => {
    if (!window.confirm("永久删除插件中的全部本地投递并解除账号绑定？此操作不能撤销，请先确认数据已同步或导出。")) return;
    setBusy(true);
    setError("");
    try {
      await deleteLocalApplicationsAndForgetOwner();
      await refresh();
      setMessage("本地投递已清除，现在可以连接另一个账号。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法清除本地投递");
    } finally { setBusy(false); }
  };

  const connection = overview?.connection;
  const conflicts = overview?.state.conflicts ?? [];

  const resolveConflict = async (entityId: string, choice: "local" | "server") => {
    setBusy(true);
    setError("");
    try {
      setOverview(await resolveCloudConflict(entityId, choice));
      setMessage(choice === "local" ? "已保留本地版本并重新同步" : "已采用云端版本");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "冲突处理失败");
    } finally { setBusy(false); }
  };

  if (compact) {
    const lastSyncedAt = overview?.state.lastSyncedAt
      ? new Date(overview.state.lastSyncedAt).toLocaleString("zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "尚未同步";
    return (
      <section className="cloud-account-card" aria-label="JobKoI 账号与同步">
        <span className="cloud-account-icon"><Cloud size={18} aria-hidden="true" /></span>
        <span className="cloud-account-copy">
          <strong>{connection ? connection.user.displayName || connection.user.email : "登录 JobKoI"}</strong>
          <small>{connection ? `网站数据已连接 · ${lastSyncedAt}` : "同步网页工作台与插件投递记录"}</small>
          {(error || overview?.state.lastError) && (
            <em role="alert">{error || overview?.state.lastError}</em>
          )}
        </span>
        <button
          type="button"
          onClick={() => void (connection ? syncNow() : loginAndSync())}
          disabled={busy}
        >
          {busy ? <RefreshCw className="spin" size={15} /> : connection ? <RefreshCw size={15} /> : <Link2 size={15} />}
          {connection ? "同步" : "登录"}
        </button>
      </section>
    );
  }

  return (
    <section className="settings-card cloud-sync-card" aria-labelledby="cloud-sync-title">
      <div className="setting-icon cloud-sync-icon">
        <Cloud size={24} aria-hidden="true" />
      </div>
      <div className="setting-copy cloud-sync-copy">
        <h3 id="cloud-sync-title">Web 工作台</h3>

        {connection ? (
          <div className="cloud-sync-connected">
            <div className="cloud-sync-status-line">
              <span className="connected-dot" />
              <strong>连接正常</strong>
              <span>{connection.user.displayName} · {connection.user.email}</span>
            </div>
          </div>
        ) : (
          <button className="button button--primary cloud-login-button" type="button" onClick={() => void loginAndSync()} disabled={busy}>
            {busy ? <RefreshCw className="spin" size={16} /> : <Cloud size={16} />}
            登录 JobKoI 并同步投递
          </button>
        )}

        {conflicts.length > 0 && (
          <div className="cloud-conflict-list" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            <div>
              <strong>有 {conflicts.length} 条记录需要确认</strong>
              <span>本地草稿已保留，请逐条选择。</span>
              {conflicts.map((conflict) => (
                <div className="cloud-conflict-item" key={conflict.entityId}>
                  <span>{conflict.local?.application.company || conflict.server?.application.company || "投递记录"} · {conflict.local?.application.position || conflict.server?.application.position || conflict.entityId}</span>
                  <button type="button" disabled={busy} onClick={() => void resolveConflict(conflict.entityId, "local")}>保留本地</button>
                  <button type="button" disabled={busy} onClick={() => void resolveConflict(conflict.entityId, "server")}>使用云端</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {overview?.state.lastError && !error && (
          <p className="cloud-sync-feedback is-error" role="alert">{overview.state.lastError}</p>
        )}
        {error && <p className="cloud-sync-feedback is-error" role="alert">{error}</p>}
        {message && <p className="cloud-sync-feedback is-success" role="status"><CheckCircle2 size={13} />{message}</p>}
        {!connection && (
          <button className="cloud-disconnect-button" type="button" onClick={() => void deleteLocalData()} disabled={busy}>
            <Trash2 size={14} />清除本地投递并解除旧账号绑定
          </button>
        )}
      </div>

      {connection && (
        <div className="cloud-sync-actions">
          <button className="button button--primary" type="button" onClick={() => void syncNow()} disabled={busy}>
            <RefreshCw className={busy ? "spin" : ""} size={16} />
            同步
          </button>
          <details className="cloud-sync-more">
            <summary>更多操作</summary>
            <div>
              <button className="button button--secondary" type="button" onClick={() => void resyncAll()} disabled={busy}>
                <Upload size={14} />
                重新上传全部
              </button>
              <button className="cloud-disconnect-button" type="button" onClick={() => void disconnect()} disabled={busy}>
                <Unplug size={14} />断开连接
              </button>
              <button className="cloud-disconnect-button" type="button" onClick={() => void deleteLocalData()} disabled={busy}>
                <Trash2 size={14} />清除本地投递并换号
              </button>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
