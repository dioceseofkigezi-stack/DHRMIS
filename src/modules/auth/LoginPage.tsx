import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";

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
  const { session, loading, mfaChallengeRequired, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checkingMfa, setCheckingMfa] = useState(false);
  const [code, setCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaEnrollment, setMfaEnrollment] = useState<{ qrCode: string; secret: string } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function prepareMfaChallenge() {
      if (!session || !mfaChallengeRequired || mfaFactorId || !supabase) return;
      setCheckingMfa(true);
      const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (factorsError) {
        setError("Multi-factor authentication could not be prepared. Try again or contact your administrator.");
        setCheckingMfa(false);
        return;
      }
      const factor = data?.totp.find((candidate) => candidate.status === "verified");
      if (factor) {
        setMfaEnrollment(null);
        setMfaFactorId(factor.id);
        setCheckingMfa(false);
        return;
      }
      for (const pendingFactor of data?.totp ?? []) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
        if (!active) return;
        if (removeError) {
          setError("An incomplete authenticator setup must be cleared by your administrator.");
          setCheckingMfa(false);
          return;
        }
      }
      const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "DHRMIS authenticator",
      });
      if (!active) return;
      if (enrollmentError || !enrollment?.totp) {
        setError("An authenticator could not be enrolled. Contact your administrator.");
      } else {
        setMfaFactorId(enrollment.id);
        setMfaEnrollment({ qrCode: enrollment.totp.qr_code, secret: enrollment.totp.secret });
      }
      setCheckingMfa(false);
    }
    void prepareMfaChallenge();
    return () => { active = false; };
  }, [session, mfaChallengeRequired, mfaFactorId, mfaEnrollment]);

  if (loading) return <div className="screen-state">Checking your session…</div>;
  if (session && !mfaFactorId && !checkingMfa && !mfaChallengeRequired) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mfaFactorId) {
        if (!supabase) throw new Error("Sign-in service is unavailable.");
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: code.trim() });
        if (verifyError) throw verifyError;
        setMfaEnrollment(null);
      } else {
        setCheckingMfa(true);
        await signIn(email.trim(), password);
        if (supabase) {
          const { data, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (levelError) throw levelError;
          if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
            const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
            if (factorsError) throw factorsError;
            const factor = factors.totp.find((candidate) => candidate.status === "verified");
            if (!factor) throw new Error("Multi-factor authentication is required. Contact your administrator.");
            setMfaFactorId(factor.id);
            return;
          }
        }
      }
      const destination = (location.state as { from?: string } | null)?.from ?? "/dashboard";
      navigate(destination, { replace: true });
    } catch (reason) {
      setError(mfaFactorId ? "That verification code could not be accepted. Check the code and try again." : friendlySignInError(reason));
    } finally {
      setCheckingMfa(false);
      setSubmitting(false);
    }
  }

  async function switchAccount() {
    try {
      await signOut();
      setMfaFactorId("");
      setMfaEnrollment(null);
      setCode("");
      setError("");
    } catch {
      setError("Unable to sign out. Refresh the page and try again.");
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-lockup"><span className="brand-symbol">DK</span><span>DHRMIS</span></div>
        <p className="eyebrow">DIOCESE OF KIGEZI</p>
        <h1 id="login-title">{mfaEnrollment ? "Set up your authenticator" : mfaFactorId ? "Verify your identity" : "Welcome back"}</h1>
        <p className="muted">{mfaEnrollment ? "Scan the QR code with an authenticator app, then enter its six-digit code." : mfaFactorId ? "Enter the current code from your authenticator app." : "Sign in to your human resource management workspace."}</p>
        {mfaEnrollment && <div className="notice notice-warning"><img className="mfa-qr-code" src={mfaEnrollment.qrCode} alt="Authenticator enrollment QR code" /><p>If you cannot scan the code, enter this setup key manually:</p><code>{mfaEnrollment.secret}</code></div>}
        {!supabase && <div className="notice notice-warning">Connect the approved Supabase project in the application environment.</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
          {!mfaFactorId ? <>
            <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@diocese.org" /></label>
            <label>Password
              <span className="password-input"><input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span>
            </label>
            <div className="login-utility-row"><Link to="/forgot-password">Forgot password?</Link></div>
          </> : <label>Authenticator code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></label>}
          <button className="button button-primary button-full" disabled={submitting || !supabase}>
            {submitting ? "Please wait…" : mfaFactorId ? "Verify and continue" : "Sign in"}
          </button>
          {mfaFactorId && <button type="button" className="text-button login-back" onClick={() => void switchAccount()}>Use another account</button>}
        </form>
        <p className="login-footer">Access is protected by your diocesan account and database permissions.</p>
      </section>
    </main>
  );
}
