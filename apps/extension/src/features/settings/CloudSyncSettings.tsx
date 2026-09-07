import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Trash2,
  Link2,
  LogOut,
  RefreshCw,
  Upload,
  Unplug
} from "lucide-react";
import {
  cloudErrorMessage,
  disconnectCloud,
  resetLocalAndCloudResumes,
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
  CLOUD_SYNC_STATE_KEY,
  clearCloudConnection,
  clearCloudDataOwner,
  clearCloudSyncStorage
} from "@/infrastructure/sync/syncState";
import { saveJobs, clearLocalProfileAndResumes } from "@/infrastructure/storage/storage";
import { UserAvatar } from "@/features/workspace/UserAvatar";
import "./cloud-sync.css";

export default function CloudSyncSettings({
  compact = false,
  variant
}: {
  compact?: boolean;
  variant?: "card" | "badge" | "compact";
}) {
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

  const loginAndSync = async (forceRebind = false) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await loginAndSyncCloud(undefined, undefined, undefined, {
        allowInitialUpload: true,
        forceRebind
      });
      setOverview(next);
      setMessage(`已登录并同步 ${next.state.lastUploadedCount ?? 0} 条投递记录`);
    } catch (cause) {
      setError(cloudErrorMessage(cause, "登录并同步失败"));
    } finally {
      setBusy(false);
    }
  };


  const syncNow = async () => {
    if (overview?.requiresUploadConsent) {
      await loginAndSync();
      return;
    }
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
        "重新上传本地全部投递，并同步通用简历的允许字段？网申专用字段和原文件仍留在本地。"
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
    if (!window.confirm("确定退出当前账号登录？")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await disconnectCloud();
      setOverview(undefined);
      await refresh();
      setMessage("已退出登录。");
    } catch (cause) {
      console.error("Disconnect failed:", cause);
      try {
        await clearCloudConnection();
        await clearCloudSyncStorage();
        await clearCloudDataOwner();
        setOverview(undefined);
        await refresh();
        setMessage("已退出登录。");
      } catch (inner) {
        const msg = inner instanceof Error ? inner.message : String(inner);
        if (msg.includes("context invalidated")) {
          setError("插件已更新，请刷新网页（按 F5）后再试。");
        } else {
          setError(msg || "退出登录失败，请重试");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const resetCloudAndLocalResumes = async () => {
    const userLabel = connection?.user.displayName || "当前账号";
    if (!window.confirm(`清空 ${userLabel} 的本地简历、原文件和网申档案，并删除云端通用简历内容？\n\n投递与云端岗位定制版本不会删除。云端仅保留不含内容的同步删除标记；备份按保留期限清理。\n此操作不能撤销。`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await resetLocalAndCloudResumes();
      await refresh();
      setMessage("已清空本地简历与网申档案，并删除云端通用简历内容；投递与岗位定制版本已保留。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重置失败");
    } finally {
      setBusy(false);
    }
  };

  const deleteLocalData = async () => {
    if (!window.confirm("永久删除插件中的全部本地投递、简历库并清除个人网申档案？此操作不能撤销，请先确认数据已备份。")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await deleteLocalApplicationsAndForgetOwner();
      setOverview((prev) =>
        prev ? { ...prev, connection: undefined, requiresUploadConsent: false } : undefined
      );
      await refresh();
      setMessage("本地投递、简历与个人数据已彻底清除，现在可以连接新账号。");
    } catch (cause) {
      console.error("Clear local data failed:", cause);
      try {
        await clearCloudConnection();
        await saveJobs([], { origin: "cloud" });
        await clearLocalProfileAndResumes();
        await clearCloudSyncStorage();
        await clearCloudDataOwner();
        setOverview((prev) =>
          prev ? { ...prev, connection: undefined, requiresUploadConsent: false } : undefined
        );
        await refresh();
        setMessage("本地投递、简历与个人数据已彻底清除。");
      } catch (inner) {
        const msg = inner instanceof Error ? inner.message : String(inner);
        if (msg.includes("context invalidated")) {
          setError("插件已更新，请刷新网页（按 F5）后再试。");
        } else {
          setError(msg || "无法清除本地数据");
        }
      }
    } finally {
      setBusy(false);
    }
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

  if (variant === "badge") {
    const lastSyncedTime = overview?.state.lastSyncedAt
      ? new Date(overview.state.lastSyncedAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : null;

    const isError = Boolean(connection && (error || overview?.state.lastError));
    const tooltipText = busy
      ? "正在与云端工作台同步中…"
      : isError
        ? `同步异常: ${error || overview?.state.lastError}（点击重试）`
        : connection
          ? `${connection.user.displayName || connection.user.email}（已连接，上次同步 ${lastSyncedTime || "未知"}）· 点击立即同步`
          : "未连接 Web 工作台 · 点击登录并同步";

    return (
      <button
        type="button"
        className={`cloud-sync-badge ${connection ? "is-connected" : "is-disconnected"} ${busy ? "is-busy" : ""} ${isError ? "is-error" : ""}`}
        onClick={() => void (connection ? syncNow() : loginAndSync())}
        disabled={busy}
        title={tooltipText}
        aria-label={tooltipText}
      >
        <span className="cloud-sync-badge-dot" aria-hidden="true" />
        <Cloud size={12} className="cloud-sync-badge-icon" aria-hidden="true" />
        <span className="cloud-sync-badge-text">
          {busy
            ? "同步中…"
            : isError
              ? "同步异常"
              : connection
                ? (lastSyncedTime ? `已同步 ${lastSyncedTime}` : "已连接")
                : "连接云端"}
        </span>
        {busy && <RefreshCw className="spin cloud-sync-badge-spin" size={11} aria-hidden="true" />}
      </button>
    );
  }

  if (compact || variant === "compact") {
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
          <small>{connection ? overview?.requiresUploadConsent ? "请确认投递与简历的同步范围" : `网站数据已连接 · ${lastSyncedAt}` : "连接后确认投递与简历的同步范围"}</small>
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
        {connection && (
          <button
            type="button"
            className="cloud-logout-button"
            onClick={() => void disconnect()}
            disabled={busy}
            title="退出登录"
          >
            <LogOut size={14} />
          </button>
        )}
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
            <UserAvatar avatarKey={connection.user.avatarKey} className="cloud-connected-avatar" />
            <div className="cloud-sync-status-line">
              <div className="cloud-status-badge">
                <span className="connected-dot" />
                <strong>已登录 JobKoi</strong>
              </div>
              <span className="cloud-user-meta">
                {connection.user.displayName || "用户"} · {connection.user.email}
              </span>
            </div>
          </div>
        ) : (
          <button className="button button--primary cloud-login-button" type="button" onClick={() => void loginAndSync()} disabled={busy}>
            {busy ? <RefreshCw className="spin" size={16} /> : <Cloud size={16} />}
            登录 JobKoi 并同步投递
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
        {error && (
          <p className="cloud-sync-feedback is-error" role="alert">{error}</p>
        )}
        {message && <p className="cloud-sync-feedback is-success" role="status"><CheckCircle2 size={13} />{message}</p>}
        {!connection && (
          <button className="cloud-disconnect-button" type="button" onClick={() => void deleteLocalData()} disabled={busy}>
            <Trash2 size={14} />清除本地投递与个人数据
          </button>
        )}
      </div>

      {connection && (
        <div className="cloud-sync-actions">
          <button className="button button--primary" type="button" onClick={() => void syncNow()} disabled={busy}>
            <RefreshCw className={busy ? "spin" : ""} size={15} />
            立即同步
          </button>
          <button className="button cloud-logout-button" type="button" onClick={() => void disconnect()} disabled={busy} title="退出当前登录账号">
            <LogOut size={14} />
            退出登录
          </button>
          <details className="cloud-sync-more">
            <summary>更多</summary>
            <div>
              <button className="button button--secondary" type="button" onClick={() => void resyncAll()} disabled={busy}>
                <Upload size={14} />
                重新上传全部
              </button>
              <button className="button button--secondary" type="button" onClick={() => void resetCloudAndLocalResumes()} disabled={busy} style={{ color: "#d97706" }}>
                <Trash2 size={14} />
                重置简历与网申档案
              </button>
              <button className="cloud-disconnect-button" type="button" onClick={() => void deleteLocalData()} disabled={busy}>
                <Trash2 size={14} />清空本地资料
              </button>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
