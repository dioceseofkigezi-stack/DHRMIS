import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
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

export default function UserRegistrationPanel({ online, onSuccess }: { online: boolean; onSuccess?: () => void }) {
  const { roles } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!roles.includes("SUPER_SYSTEM_ADMIN")) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!supabase) {
      setError("The account service is not configured. Contact your system administrator.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: inviteError } = await supabase.functions.invoke("register-user", {
        body: { fullName: fullName.trim(), email: email.trim(), roleCode },
      });
      if (inviteError) {
        let message = "The invitation could not be sent. Check the details and try again.";
        if ("context" in inviteError && inviteError.context instanceof Response) {
          try {
            const payload: unknown = await inviteError.context.clone().json();
            if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
              message = payload.message;
            }
          } catch {
            // Keep the safe fallback when the response is not JSON.
          }
        }
        throw new Error(message);
      }
      const selectedRole = roleOptions.find((role) => role.code === roleCode)?.label ?? roleCode;
      setSuccess(`Invitation sent to ${email.trim()} with the ${selectedRole} role. After accepting it, the user can use “Forgot password” on the sign-in page to set a password.`);
      setFullName("");
      setEmail("");
      setRoleCode("");
      onSuccess?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The invitation could not be sent. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel registration-panel" aria-labelledby="register-user-title">
      <div className="panel-heading registration-heading">
        <div>
          <p className="eyebrow">ACCOUNT PROVISIONING</p>
          <h2 id="register-user-title">Register a user</h2>
          <p className="muted">Invite a named account holder and assign the appropriate system or departmental role. Departmental roles manage their own personnel data.</p>
        </div>
      </div>
      {error && <div className="notice notice-error registration-message" role="alert">{error}</div>}
      {success && <div className="notice notice-success registration-message" role="status">{success}</div>}
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
          <p className="muted">Each department role is limited to one active designated account and its matching organizational scope.</p>
          <button className="button button-primary" type="submit" disabled={!online || submitting || !supabase}>
            <Icon name="plus" size={15} />{submitting ? "Sending invitation…" : "Send invitation"}
          </button>
        </div>
      </form>
    </section>
  );
}
