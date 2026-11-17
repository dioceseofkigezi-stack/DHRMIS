import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";
import { getWorkspaceLandingPath } from "@/core/organizational-scope/workspaces";

function friendlySignInError(reason: unknown) {
  if (reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string") {
    const message = reason.message.toLowerCase();
    if (message.includes("invalid api key") || message.includes("fetch")) {
      return "The sign-in service is unavailable. Contact your system administrator.";
    }
  }
  return "Sign-in could not be completed. Check your details or contact your system administrator.";
}

export default function LoginPage() {
  const { session, loading, roles, workspaceDomainCodes, roleUserId, roleLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="screen-state">Checking your session…</div>;
  if (session && (roleLoading || roleUserId !== session.user.id)) {
    return <div className="screen-state"><span className="loading-spinner" /> Loading your workspace...</div>;
  }
  if (session) return <Navigate to={getWorkspaceLandingPath(roles, workspaceDomainCodes)} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (reason) {
      setError(friendlySignInError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-lockup"><img className="brand-symbol" src="/LOGO.PNG" alt="" /><span>DHRMIS</span></div>
        <p className="eyebrow">DIOCESE OF KIGEZI</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="muted">Sign in to your human resource management workspace.</p>
        {!supabase && <div className="notice notice-warning">Connect the approved Supabase project in the application environment.</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
          <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@diocese.org" /></label>
          <label>Password
            <span className="password-input"><input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span>
          </label>
          <div className="login-utility-row"><Link to="/forgot-password">Forgot password?</Link></div>
          <button className="button button-primary button-full" disabled={submitting || !supabase}>
            {submitting ? "Please wait…" : "Sign in"}
          </button>
        </form>
        <p className="login-footer">Access is protected by your diocesan account and database permissions.</p>
      </section>
    </main>
  );
}
