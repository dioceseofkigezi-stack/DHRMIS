import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";
import { ThemeControl } from "@/components/ui/ThemeControl";

export default function PasswordRecoveryPage({ mode }: { mode: "request" | "reset" }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) {
      setError("The password service is not configured. Contact your administrator.");
      return;
    }
    if (mode === "reset" && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "request") {
        const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (requestError) throw requestError;
        setMessage("If the address is associated with an account, password reset instructions will be sent.");
      } else {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage("Your password has been updated.");
        window.setTimeout(() => navigate("/dashboard", { replace: true }), 900);
      }
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message.toLowerCase() : "";
      setError(detail.includes("invalid api key") || detail.includes("fetch")
        ? "The password service is unavailable. Contact your administrator."
        : mode === "request"
          ? "The request could not be completed. Please try again later."
          : "The reset link may have expired. Request a new password reset link.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "reset" && loading) return <div className="screen-state">Checking your recovery link…</div>;

  return (
    <main className="login-screen">
      <ThemeControl className="login-theme-control" showIcon={false} />
      <section className="login-card" aria-labelledby="recovery-title">
        <div className="brand-lockup"><img className="brand-symbol" src="/LOGO.PNG" alt="" /><span>DHRMIS</span></div>
        <h1 id="recovery-title">{mode === "request" ? "Reset your password" : "Choose a new password"}</h1>
        {message && <div className="notice notice-success" role="status">{message}</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {mode === "request" || session ? <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
          {mode === "request" ? <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label> : <>
            <label>New password<input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" minLength={10} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            <small className="field-help">Use at least 10 characters.</small>
          </>}
          <button className="button button-primary button-full" disabled={submitting || !supabase}>{submitting ? "Please wait…" : mode === "request" ? "Send reset instructions" : "Update password"}</button>
        </form> : <Link className="button button-primary button-full recovery-link" to="/forgot-password">Request a new reset link</Link>}
        <p className="login-footer"><Link to="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}
