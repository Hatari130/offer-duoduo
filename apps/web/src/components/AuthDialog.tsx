import { useEffect, useRef, type MouseEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "../app/AuthContext";
import { AuthCard } from "./AuthCard";

export function AuthDialog() {
  const { status, loginPrompt, dismissLogin } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const open = Boolean(loginPrompt) && status !== "authenticated";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const restoreFocus = () => {
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const close = () => dialogRef.current?.close();
  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog"
      aria-labelledby="auth-dialog-title"
      onClick={closeFromBackdrop}
      onCancel={dismissLogin}
      onClose={() => {
        dismissLogin();
        restoreFocus();
      }}
    >
      <div className="auth-dialog-surface">
        <button className="auth-dialog-close" type="button" aria-label="关闭登录窗口" onClick={close}>
          <X aria-hidden="true" size={18} />
        </button>
        <AuthCard
          headingId="auth-dialog-title"
          idPrefix="auth-dialog"
          loginHeading="登录后继续"
          prompt={loginPrompt}
          onSuccess={close}
        />
      </div>
    </dialog>
  );
}
