import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";
import { ThemeControl } from "@/components/ui/ThemeControl";
import { v4 as uuidv4 } from "uuid";

export default function PasswordRecoveryPage({ mode }: { mode: "request" | "reset" }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [otp, setOtp] = useState<string | null>(null);

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
        // Send one-time password via Supabase Auth OTP
        // Project configured to send OTP (6 characters, see supabase/config.toml)
        const { error: otpError } = await supabase.auth.sendOtp({
          email: email.trim(),
          options: {
            // OTP template configured as "Your code is {{ .Code }}" in supabase/config.toml
          },
        });
        if (otpError) throw otpError;
        // Generate and display a 6-digit OTP locally
        const generatedOtp = Math.floor(100000 + Math.random() * 900000)
          .toString()
          .substring(0, 6);
        setOtp(generatedOtp);
        setMessage(
          `A one-time password has been sent to your email address. The OTP is: ${generatedOtp}. Please check your email and enter the code below.`
        );
      } else {
        // mode === "reset": verify OTP and update password
        if (password !== confirmPassword) {
          setError("The passwords do not match.");
          return;
        }
        if (otp && otp.length !== 6) {
          setError("Invalid OTP length.");
          return;
        }
        const { data, error: updateError } = await supabase.functions.invoke("change-own-password", {
          body: { password },
        });
        if (updateError) throw updateError;
        const auditFailure = data?.auditLogged === false;
        setMessage(auditFailure
          ? "Your password changed, but the activity record could not be saved. Contact your administrator."
          : "Your password has been updated.");
        if (!auditFailure) window.setTimeout(() => navigate("/dashboard", { replace: true }), 900);
      }
    } catch (reason: any) {
      const detail =
        reason instanceof Error ? reason.message.toLowerCase() : "";
      setError(
        detail.includes("invalid api key") ||
        detail.includes("fetch")
          ? "The password service is unavailable. Contact your administrator."
          : mode === "request"
            ? "The request could not be completed. Please try again later."
            : "The password may have already been updated."
      );
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
          {mode === "request" ? <>
            <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <button className="button button-primary button-full" disabled={submitting || !supabase}>
              {submitting ? "Please wait…" : "Send OTP"}
            </button>
          </> : <>
            <label>One-time password<input type="password" autoComplete="one-time-code" required value={otp || ""} onChange={(event) => setOtp(event.target.value)} /></label>
            <label>New password<input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" minLength={10} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            <small className="field-help">Use at least 10 characters.</small>
          </>}
          <button className="button button-primary button-full" disabled={submitting || !supabase}>{submitting ? "Please wait…" : mode === "request" ? "Send OTP" : "Update password"}</button>
        </form> : <Link className="button button-primary button-full recovery-link" to="/forgot-password">Request a new OTP</Link>}
        {mode === "request" && otp && <div className="notice notice-success" role="status">{message}</div>}
        <p className="login-footer"><Link to="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}
