import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";

function getTotpAal(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as Record<string, unknown>;
    return typeof claims.aal === "string" ? claims.aal : "";
  } catch {
    return "";
  }
}

export default function MfaRequiredPage() {
  const { session, signOut } = useAuth();
  const [factorId, setFactorId] = useState("");
  const [verifiedFactor, setVerifiedFactor] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadFactors() {
      if (!supabase) {
        setError("The authentication service is not configured.");
        setLoading(false);
        return;
      }
      const { data, error: factorError } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (factorError || !data) {
        setError("Your authenticator could not be checked. Sign out and contact your system administrator.");
      } else {
        const factor = data.totp.find((candidate) => candidate.status === "verified");
        if (factor) {
          setFactorId(factor.id);
          setVerifiedFactor(true);
        } else {
          const pendingFactors = data.totp.filter((candidate) => candidate.status === "unverified");
          for (const pendingFactor of pendingFactors) {
            const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
            if (unenrollError) {
              setError("An unfinished authenticator setup could not be cleared. Contact your system administrator.");
              break;
            }
          }
        }
      }
      setLoading(false);
    }
    void loadFactors();
    return () => { active = false; };
  }, []);

  async function startEnrollment() {
    if (!supabase) return;
    setError("");
    setSubmitting(true);
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      for (const factor of factors?.all ?? []) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
          if (unenrollError) throw unenrollError;
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "DHRMIS authenticator",
        issuer: "Diocese of Kigezi DHRMIS",
      });
      if (enrollError || !data || data.type !== "totp") throw enrollError ?? new Error("Authenticator setup could not be started.");
      setFactorId(data.id);
      setVerifiedFactor(false);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch {
      setError("Authenticator setup could not be started. Try again or contact your system administrator.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !factorId) return;
    setError("");
    setSubmitting(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) throw challengeError ?? new Error("Verification could not be started.");
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
      if (verifyError) throw verifyError;
      setQrCode("");
      setSecret("");
      setCode("");
      if (getTotpAal((await supabase.auth.getSession()).data.session?.access_token ?? "") !== "aal2") {
        setError("The code was accepted, but the secure session is still updating. Refresh the page in a moment.");
      }
    } catch {
      setError("That authenticator code could not be verified. Check the time on your device and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="mfa-title">
        <div className="brand-lockup"><span className="brand-symbol">DK</span><span>DHRMIS</span></div>
        <p className="eyebrow">SECURE ACCOUNT ACCESS</p>
        <h1 id="mfa-title">Authenticator verification</h1>
        <p className="muted">Your account needs multi-factor authentication before personnel records can be opened.</p>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {loading ? <p className="muted" role="status">Checking your authenticator…</p> : !factorId ? <>
          <p className="muted">Set up an authenticator app on your phone to secure this account.</p>
          <button className="button button-primary button-full" type="button" onClick={() => void startEnrollment()} disabled={submitting || !supabase}>
            {submitting ? "Preparing setup…" : "Set up authenticator"}
          </button>
        </> : <>
          {qrCode && <div className="form-stack"><p className="muted">Scan this code with your authenticator app. Keep the setup secret private.</p>
            <img src={`data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`} alt="Authenticator setup QR code" style={{ display: "block", width: 190, height: 190, margin: "0 auto" }} />
            <label className="field">Setup secret<input readOnly type="text" value={secret} autoComplete="off" /></label>
          </div>}
          <form className="form-stack" onSubmit={(event) => void verify(event)}>
            <label>Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /></label>
            <button className="button button-primary button-full" disabled={submitting || code.length < 6}>
              {submitting ? "Verifying…" : verifiedFactor ? "Verify and continue" : "Verify and secure account"}
            </button>
          </form>
        </>}
        <button className="text-button" type="button" onClick={() => void signOut()} style={{ display: "block", margin: "18px auto 0" }}>Sign out</button>
      </section>
    </main>
  );
}
