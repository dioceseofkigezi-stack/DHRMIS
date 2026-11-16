import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "@/app/App";
import { AuthProvider } from "@/modules/core/auth/context";
import LoginPage from "@/modules/auth/LoginPage";
import PasswordRecoveryPage from "@/modules/auth/PasswordRecoveryPage";
import { AppErrorBoundary } from "@/core/errors/AppErrorBoundary";
import { ToastProvider } from "@/core/notifications/ToastProvider";
import "@/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppErrorBoundary>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<PasswordRecoveryPage mode="request" />} />
              <Route path="/reset-password" element={<PasswordRecoveryPage mode="reset" />} />
              <Route path="/*" element={<App />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" }).catch(() => undefined);
  });
}
