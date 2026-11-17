import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "info";
interface ToastMessage { id: number; kind: ToastKind; message: string }
interface ToastContextValue { showToast: (message: string, kind?: ToastKind) => void }

const ToastContext = createContext<ToastContextValue | null>(null);
let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++nextToastId;
    setToasts((current) => [...current.slice(-3), { id, kind, message }]);
    window.setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4500);
  }, [dismiss]);
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.kind}`} key={toast.id} role={toast.kind === "error" ? "alert" : "status"}>
            <span>{toast.message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>Dismiss</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider.");
  return context.showToast;
}
