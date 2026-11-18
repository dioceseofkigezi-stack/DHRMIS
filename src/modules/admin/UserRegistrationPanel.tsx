import { useState, type FormEvent } from "react";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";

const roleOptions = [
  { code: "SUPER_SYSTEM_ADMIN", label: "Super/System Administrator" },
  { code: "SECRETARIAT_USER", label: "Secretariat / Main Office user" },
  { code: "MISSION_BOARD_USER", label: "Mission Board user" },
  { code: "EDUCATION_BOARD_USER", label: "Education Board user" },
  { code: "HEALTH_BOARD_USER", label: "Health Board user" },
  { code: "LAND_FINANCE_BOARD_USER", label: "Land & Finance Board user" },
  { code: "PLANNING_DEVELOPMENT_BOARD_USER", label: "Planning & Development Board user" },
  { code: "ICT_BOARD_USER", label: "ICT Board user" },
];

interface CreatedAccount {
  email: string;
  role: string;
  temporaryPassword: string;
  auditLogged: boolean;
}

async function functionErrorMessage(reason: unknown, fallback: string) {
  if (reason && typeof reason === "object" && "name" in reason && reason.name === "FunctionsFetchError") {
    return "The account service could not be reached. Check your connection and confirm the register-user Edge Function is deployed.";
  }
  if (reason && typeof reason === "object" && "context" in reason && reason.context instanceof Response) {
    try {
      const response = reason.context.clone();
      const responseText = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(responseText) as unknown; } catch { payload = null; }
      if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
        return payload.message;
      }
      if (response.status === 404) return "The register-user Edge Function was not found. Deploy it to the configured Supabase project and try again.";
      if (response.status >= 500) return `The account function failed (HTTP ${response.status}). Check its Supabase logs for the cause.`;
      return `The account function rejected the request (HTTP ${response.status}). Check your session and account details.`;
    } catch {
      // Keep the safe fallback if the response cannot be read.
    }
  }
  if (reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string") {
    return reason.message;
  }
  return fallback;
}

export default function UserRegistrationPanel({ online, onSuccess }: { online: boolean; onSuccess?: () => void }) {
  const { roles } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null);
  const [copyMessage, setCopyMessage] = useState("");

  if (!roles.includes("SUPER_SYSTEM_ADMIN")) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreatedAccount(null);
    setCopyMessage("");
    if (!supabase) {
      setError("The account service is not configured. Contact your system administrator.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: createError } = await supabase.functions.invoke("register-user", {
        body: { fullName: fullName.trim(), email: email.trim(), roleCode },
      });
      if (createError) throw createError;
      const temporaryPassword = data && typeof data === "object" && "temporaryPassword" in data && typeof data.temporaryPassword === "string"
        ? data.temporaryPassword
        : "";
      if (!temporaryPassword) {
        throw new Error("The account was created, but its one-time password was not returned. Contact your system administrator before sharing the account details.");
      }
      const selectedRole = roleOptions.find((role) => role.code === roleCode)?.label ?? roleCode;
      setCreatedAccount({
        email: email.trim(),
        role: selectedRole,
        temporaryPassword,
        auditLogged: !(data && typeof data === "object" && "auditLogged" in data && data.auditLogged === false),
      });
      setFullName("");
      setEmail("");
      setRoleCode("");
      onSuccess?.();
    } catch (reason) {
      setError(await functionErrorMessage(reason, "The account could not be created. Check the details and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyTemporaryPassword() {
    if (!createdAccount) return;
    try {
      await navigator.clipboard.writeText(createdAccount.temporaryPassword);
      setCopyMessage("Temporary password copied.");
    } catch {
      setCopyMessage("Copy is unavailable here. Select the password and copy it manually.");
    }
  }

  return (
    <section className="panel registration-panel" aria-labelledby="register-user-title">
      <div className="panel-heading registration-heading">
        <div><h2 id="register-user-title">Create a user account</h2></div>
      </div>
      {error && <div className="notice notice-error registration-message" role="alert">{error}</div>}
      {createdAccount && <div className="registration-credentials" role="status">
        <button className="text-button" type="button" onClick={() => { setCreatedAccount(null); setCopyMessage(""); }}>Hide credentials</button>
        <div className="notice notice-success registration-message">
          <strong>Account created for {createdAccount.email}</strong><br />
          Role: {createdAccount.role}. The user must change this one-time password at first sign-in.
          {!createdAccount.auditLogged && <><br />The account was created, but its audit entry could not be confirmed.</>}
        </div>
        <label className="field registration-password">One-time temporary password
          <span className="registration-password-row"><input type="text" readOnly autoComplete="off" value={createdAccount.temporaryPassword} onFocus={(event) => event.currentTarget.select()} aria-label="One-time temporary password" /><button className="button button-secondary" type="button" onClick={() => void copyTemporaryPassword()}>Copy</button></span>
        </label>
        {copyMessage && <small className="field-help" aria-live="polite">{copyMessage}</small>}
        <p className="field-help">This password is shown only now. Give it directly to the account holder.</p>
      </div>}
      <form className="registration-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="registration-fields">
          <label className="field" htmlFor="register-full-name">Full name<span aria-hidden="true" className="required-indicator"> *</span>
            <input id="register-full-name" name="fullName" autoComplete="name" required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label className="field" htmlFor="register-email">Email address<span aria-hidden="true" className="required-indicator"> *</span>
            <input id="register-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@diocese.org" />
          </label>
          <label className="field" htmlFor="register-role">Initial role<span aria-hidden="true" className="required-indicator"> *</span>
            <select id="register-role" name="roleCode" required value={roleCode} onChange={(event) => setRoleCode(event.target.value)}>
              <option value="">Select a role</option>
              {roleOptions.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}
            </select>
          </label>
        </div>
        <div className="registration-footer">
          <button className="button button-primary" type="submit" disabled={!online || submitting || !supabase}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
          <small className="muted">A one-time password will be generated and shown after creation.</small>
        </div>
      </form>
    </section>
  );
}
