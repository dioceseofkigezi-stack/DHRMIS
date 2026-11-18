import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ThemeControl } from "@/components/ui/ThemeControl";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";

async function functionErrorMessage(reason: unknown) {
  if (reason && typeof reason === "object" && "context" in reason && reason.context instanceof Response) {
    try {
      const payload: unknown = await reason.context.clone().json();
      if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
        return payload.message;
      }
    } catch {
      // Use the safe fallback when the function response is not JSON.
    }
  }
  if (reason && typeof reason === "object" && "name" in reason && reason.name === "FunctionsFetchError") {
    return "The password service could not be reached. Check your connection and try again.";
  }
  return "The password could not be changed. Check your details and try again.";
}

export default function FirstLoginPasswordPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("The password service is not configured. Contact your administrator.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: changeError } = await supabase.functions.invoke("complete-first-login-password", {
        body: { currentPassword, newPassword: password },
      });
      if (changeError) throw changeError;
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setChanged(true);
    } catch (reason) {
      setError(await functionErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function returnToSignIn() {
    setSubmitting(true);
    setError("");
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setError("Your password was changed. Sign out and sign in again with your new password to continue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <ThemeControl className="login-theme-control" showIcon={false} />
      <section className="login-card" aria-labelledby="first-login-password-title">
        <div className="brand-lockup"><img className="brand-symbol" src="/LOGO.PNG" alt="" /><span>DHRMIS</span></div>
        <h1 id="first-login-password-title">Choose a new password</h1>
        {changed ? <>
          <div className="notice notice-success" role="status">Your password has been changed. Sign in again with your new password to continue.</div>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <button className="button button-primary button-full" type="button" disabled={submitting} onClick={() => void returnToSignIn()}>
            {submitting ? "Please wait…" : "Continue to sign in"}
          </button>
        </> : <>
          <p className="login-copy">Your administrator created this account with a one-time password. Confirm it and choose a different password to finish signing in.</p>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
            <label>One-time temporary password<input type="password" autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label>New password<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            <small className="field-help">Use at least 10 characters with an uppercase letter, lowercase letter, number and symbol.</small>
            <button className="button button-primary button-full" type="submit" disabled={submitting || !supabase}>
              {submitting ? "Updating password…" : "Update password"}
            </button>
          </form>
        </>}
      </section>
    </main>
  );
}
