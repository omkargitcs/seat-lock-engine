import { useEffect, useRef } from "react";

// Small confirm dialog. Escape and backdrop click cancel it.
export default function Dialog({ title, children, confirmLabel, cancelLabel = "Keep it", danger = false, busy = false, onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && !busy && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="dialog pop" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button type="button" ref={cancelRef} className="btn btn-quiet" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
