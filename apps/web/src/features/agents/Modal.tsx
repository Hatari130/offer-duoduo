import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native <dialog> opened with showModal(): focus trap, Esc and backdrop close come for free. */
export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`agents-modal${className ? ` ${className}` : ""}`}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="agents-modal__close" aria-label="关闭" onClick={onClose}>
        <X aria-hidden="true" size={18} />
      </button>
      {open && children}
    </dialog>
  );
}
