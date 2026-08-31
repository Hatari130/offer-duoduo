import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import type { AvatarKey } from "@offerflow/contracts";
import { useAuth } from "../app/AuthContext";
import { avatarOptions, UserAvatar } from "./UserAvatar";

export function CompanionOnboardingDialog() {
  const {
    companionOnboardingOpen,
    dismissCompanionOnboarding,
    saveCompanion,
    user
  } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const avatarRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarKey>("sprout");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!companionOnboardingOpen) {
      if (dialog.open) dialog.close();
      return;
    }

    setSelectedAvatar(user?.avatarKey ?? "sprout");
    setError("");
    const showDialog = () => {
      if (dialog.open || !companionOnboardingOpen) return;
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      window.requestAnimationFrame(() => {
        dialog.querySelector<HTMLInputElement>('input[name="companion-avatar"]:checked')?.focus();
      });
    };
    const authDialog = document.querySelector<HTMLDialogElement>(".auth-dialog:not(.companion-dialog)");
    if (authDialog?.open) {
      authDialog.addEventListener("close", showDialog, { once: true });
      return () => authDialog.removeEventListener("close", showDialog);
    }
    showDialog();
  }, [companionOnboardingOpen, user?.avatarKey]);

  const close = () => {
    if (busy) return;
    dismissCompanionOnboarding();
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await saveCompanion(selectedAvatar);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法保存，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog companion-dialog"
      aria-labelledby="companion-dialog-title"
      aria-describedby="companion-dialog-description"
      onClick={closeFromBackdrop}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        if (companionOnboardingOpen) dismissCompanionOnboarding();
        window.requestAnimationFrame(() => {
          if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
        });
      }}
    >
      <div className="auth-dialog-surface companion-dialog-surface">
        <button
          className="auth-dialog-close"
          type="button"
          aria-label="使用默认伙伴并关闭"
          onClick={close}
          disabled={busy}
        >
          <X aria-hidden="true" size={18} />
        </button>

        <div className="companion-dialog-content">
          <header>
            <span className="auth-eyebrow">账号已创建</span>
            <h2 id="companion-dialog-title">选择你的求职伙伴</h2>
            <p id="companion-dialog-description">
              {user?.displayName ? `${user.displayName}，` : ""}选一个喜欢的伙伴，它会陪你出现在工作台。
            </p>
          </header>

          <fieldset className="auth-avatar-fieldset">
            <legend>伙伴形象</legend>
            <div className="auth-avatar-grid">
              {avatarOptions.map((option, index) => (
                <label className="auth-avatar-option" key={option.key}>
                  <input
                    ref={(element) => { avatarRefs.current[index] = element; }}
                    type="radio"
                    name="companion-avatar"
                    value={option.key}
                    checked={selectedAvatar === option.key}
                    onChange={() => setSelectedAvatar(option.key)}
                    onKeyDown={(event) => {
                      const direction = event.key === "ArrowRight" || event.key === "ArrowDown"
                        ? 1
                        : event.key === "ArrowLeft" || event.key === "ArrowUp"
                          ? -1
                          : 0;
                      if (!direction) return;
                      event.preventDefault();
                      const nextIndex = (index + direction + avatarOptions.length) % avatarOptions.length;
                      setSelectedAvatar(avatarOptions[nextIndex].key);
                      window.requestAnimationFrame(() => avatarRefs.current[nextIndex]?.focus());
                    }}
                  />
                  <span className="auth-avatar-choice">
                    <UserAvatar avatarKey={option.key} />
                    <span>{option.label}</span>
                    <Check className="auth-avatar-check" aria-hidden="true" size={13} strokeWidth={2.4} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="auth-error" role={error ? "alert" : undefined} aria-live="polite">
            {error}
          </div>

          <div className="companion-dialog-actions">
            <button type="button" className="companion-skip" onClick={close} disabled={busy}>
              使用默认伙伴
            </button>
            <button type="button" className="auth-submit" onClick={() => void save()} disabled={busy} aria-busy={busy}>
              {busy ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : null}
              <span>保存伙伴</span>
              {!busy && <ArrowRight aria-hidden="true" size={18} />}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
