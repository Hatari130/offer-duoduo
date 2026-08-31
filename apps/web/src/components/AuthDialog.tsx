import { useEffect, useRef, useState, type MouseEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "../app/AuthContext";
import { AuthCard } from "./AuthCard";

export function AuthDialog() {
  const { status, loginPrompt, dismissLogin, companionOnboardingOpen } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const open = Boolean(loginPrompt) && status !== "authenticated";

  const beginClose = () => {
    const dialog = dialogRef.current;
    if (!dialog || !dialog.open || closingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    const finish = () => {
      if (!closingRef.current) return;
      closingRef.current = false;
      setClosing(false);
      dialog.close();
    };
    const timer = window.setTimeout(finish, 220);
    dialog.addEventListener(
      "animationend",
      (event) => {
        if (event.animationName !== "auth-dialog-exit") return;
        window.clearTimeout(timer);
        finish();
      },
      { once: true }
    );
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
    } else if (!open && dialog.open) {
      beginClose();
    }
  }, [open]);

  const restoreFocus = () => {
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) beginClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`auth-dialog${closing ? " is-closing" : ""}`}
      aria-labelledby="auth-dialog-title"
      onClick={closeFromBackdrop}
      onCancel={(event) => {
        event.preventDefault();
        beginClose();
      }}
      onClose={() => {
        dismissLogin();
        if (!companionOnboardingOpen) restoreFocus();
      }}
    >
      <div className="auth-dialog-surface">
        <button className="auth-dialog-close" type="button" aria-label="关闭登录窗口" onClick={beginClose}>
          <X aria-hidden="true" size={18} />
        </button>
        <AuthCard
          headingId="auth-dialog-title"
          idPrefix="auth-dialog"
          loginHeading="登录后继续"
          prompt={loginPrompt}
          onSuccess={beginClose}
        />
      </div>
    </dialog>
  );
}
