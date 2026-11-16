import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({ title, children, confirmLabel, destructive = false, busy = false, onCancel, onConfirm }: Props) {
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmButton.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <section className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <div className="modal-heading"><h2 id="confirm-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onCancel} disabled={busy}><Icon name="close" size={18} /></button></div>
        <div className="confirm-description" id="confirm-description">{children}</div>
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>Cancel</button><button ref={confirmButton} type="button" className={destructive ? "button button-danger" : "button button-primary"} onClick={onConfirm} disabled={busy}>{busy ? "Please wait…" : <><Icon name={destructive ? "trash" : "check"} size={14} />{confirmLabel}</>}</button></div>
      </section>
    </div>
  );
}
