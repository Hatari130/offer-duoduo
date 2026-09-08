import { useState } from "react";
import { Dialog } from "@offerflow/ui";
import { ArrowRight, Check, History, Sparkles, Wrench, Zap } from "lucide-react";
import { useAuth } from "../app/AuthContext";
import { navigate } from "../app/router";
import {
  CHANGELOG_RELEASES,
  markLatestChangelogSeen,
  type ChangelogItem,
  type ChangelogRelease
} from "../features/changelog/changelogData";

interface ChangelogDialogProps {
  open: boolean;
  onClose: () => void;
  onAcknowledge?: () => void;
}

export function ChangelogDialog({ open, onClose, onAcknowledge }: ChangelogDialogProps) {
  const { status, requestLogin } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string>(CHANGELOG_RELEASES[0].version);

  const currentRelease = CHANGELOG_RELEASES.find((r) => r.version === selectedVersion) || CHANGELOG_RELEASES[0];

  const handleClose = () => {
    markLatestChangelogSeen();
    onClose();
  };

  const handleAcknowledge = () => {
    markLatestChangelogSeen();
    onAcknowledge?.();
    onClose();
  };

  const handleAction = (item: ChangelogItem) => {
    if (!item.actionHref) return;
    markLatestChangelogSeen();
    onClose();
    if (item.requiresAuth && status === "anonymous") {
      requestLogin(`登录后即可体验「${item.title}」。`);
      return;
    }
    navigate(item.actionHref);
  };

  const renderTag = (tag: ChangelogItem["tag"]) => {
    switch (tag) {
      case "new":
        return (
          <span className="changelog-tag changelog-tag--new">
            <Sparkles size={12} aria-hidden="true" />
            <span>重磅新增</span>
          </span>
        );
      case "optimize":
        return (
          <span className="changelog-tag changelog-tag--optimize">
            <Zap size={12} aria-hidden="true" />
            <span>功能优化</span>
          </span>
        );
      case "fix":
        return (
          <span className="changelog-tag changelog-tag--fix">
            <Wrench size={12} aria-hidden="true" />
            <span>问题修复</span>
          </span>
        );
    }
  };

  return (
    <Dialog
      open={open}
      title={
        <span className="changelog-dialog-title-wrap">
          <span className="changelog-title-eyebrow">
            <Sparkles size={14} aria-hidden="true" />
            <span>{currentRelease.badge || "新版本现已就绪"}</span>
          </span>
          <span className="changelog-title-text">{currentRelease.title}</span>
        </span>
      }
      description={currentRelease.summary}
      onClose={handleClose}
      className="changelog-dialog"
      footer={
        <div className="changelog-dialog-footer">
          <button
            type="button"
            className="changelog-history-toggle"
            onClick={() => setShowHistory((prev) => !prev)}
          >
            <History size={14} aria-hidden="true" />
            <span>{showHistory ? "返回最新版本" : "查看往期更新"}</span>
          </button>
          <button
            type="button"
            className="changelog-ack-btn"
            onClick={handleAcknowledge}
          >
            <Check size={16} aria-hidden="true" />
            <span>已知悉</span>
          </button>
        </div>
      }
    >
      <div className="changelog-dialog-body">
        {showHistory ? (
          <div className="changelog-history-panel">
            <div className="changelog-version-tabs" role="tablist" aria-label="往期版本列表">
              {CHANGELOG_RELEASES.map((release) => (
                <button
                  key={release.version}
                  type="button"
                  role="tab"
                  aria-selected={release.version === currentRelease.version}
                  className={`changelog-version-tab${release.version === currentRelease.version ? " is-active" : ""}`}
                  onClick={() => setSelectedVersion(release.version)}
                >
                  <span className="changelog-tab-ver">{release.version}</span>
                  <span className="changelog-tab-date">{release.date}</span>
                </button>
              ))}
            </div>

            <div className="changelog-items-list" role="tabpanel">
              {currentRelease.items.map((item, idx) => (
                <div key={idx} className="changelog-item-card">
                  <header className="changelog-item-header">
                    {renderTag(item.tag)}
                    <h3 className="changelog-item-title">{item.title}</h3>
                  </header>
                  <p className="changelog-item-desc">{item.desc}</p>
                  {item.actionHref && (
                    <button
                      type="button"
                      className="changelog-item-action"
                      onClick={() => handleAction(item)}
                    >
                      <span>{item.actionLabel || "去体验"}</span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="changelog-items-list">
            <div className="changelog-release-meta">
              <span className="changelog-meta-pill">版本 {currentRelease.version}</span>
              <span className="changelog-meta-date">发布于 {currentRelease.date}</span>
            </div>

            {currentRelease.items.map((item, idx) => (
              <div
                key={idx}
                className={`changelog-item-card${item.tag === "new" ? " changelog-item-card--highlight" : ""}`}
              >
                <header className="changelog-item-header">
                  {renderTag(item.tag)}
                  <h3 className="changelog-item-title">{item.title}</h3>
                </header>
                <p className="changelog-item-desc">{item.desc}</p>
                {item.actionHref && (
                  <button
                    type="button"
                    className="changelog-item-action"
                    onClick={() => handleAction(item)}
                  >
                    <span>{item.actionLabel || "立即体验"}</span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
