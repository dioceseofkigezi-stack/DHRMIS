import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sessionIdFromToken(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as Record<string, unknown>;
    return typeof claims.session_id === "string" ? claims.session_id : "";
  } catch {
    return "";
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { message: "Use POST to change the first-login password." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { message: "The password service is not configured." });
  }

  const authorization = request.headers.get("Authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!authorization || !bearerMatch) return respond(401, { message: "Sign in with your temporary password to continue." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { message: "Enter a valid password request." });
  }
  const newPassword = body && typeof body === "object" && "newPassword" in body && typeof body.newPassword === "string"
    ? body.newPassword
    : "";
  const currentPassword = body && typeof body === "object" && "currentPassword" in body && typeof body.currentPassword === "string"
    ? body.currentPassword
    : "";
  if (!currentPassword || currentPassword.length > 128) {
    return respond(400, { message: "Enter the one-time temporary password you used to sign in." });
  }
  if (newPassword.length < 10 || newPassword.length > 128 ||
      !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    return respond(400, { message: "Use at least 10 characters with an uppercase letter, lowercase letter, number and symbol." });
  }
  if (newPassword === currentPassword) {
    return respond(400, { message: "Choose a password different from the temporary password." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(bearerMatch[1]);
  if (callerError || !callerData.user) return respond(401, { message: "Your sign-in session has expired. Sign in again." });
  if (callerData.user.app_metadata?.must_change_password !== true) {
    return respond(409, { message: "This account is not awaiting a first-login password change." });
  }
  if (!callerData.user.email) return respond(400, { message: "This account has no email address for password verification." });
  const verificationClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: verification, error: verificationError } = await verificationClient.auth.signInWithPassword({
    email: callerData.user.email,
    password: currentPassword,
  });
  if (verificationError || verification.user?.id !== callerData.user.id) {
    return respond(400, { message: "The one-time temporary password could not be confirmed. Check it and try again." });
  }

  const appMetadata = { ...(callerData.user.app_metadata ?? {}), must_change_password: false };
  const { error: updateError } = await adminClient.auth.admin.updateUserById(callerData.user.id, {
    password: newPassword,
    app_metadata: appMetadata,
  });
  if (updateError) {
    const detail = updateError.message.toLowerCase();
    if (detail.includes("same password") || detail.includes("different from") || detail.includes("reuse")) {
      return respond(400, { message: "Choose a password different from the temporary password." });
    }
    console.error("complete-first-login-password: password update failed", {
      code: updateError.code,
      status: updateError.status,
      message: updateError.message,
    });
    return respond(502, { message: "The password could not be changed. Check it and try again." });
  }

  const metadata = callerData.user.user_metadata ?? {};
  const actorName = (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) || callerData.user.email || null;
  const authSessionId = sessionIdFromToken(bearerMatch[1]);
  const { data: trackedSession } = authSessionId
    ? await adminClient.from("user_sessions").select("id")
      .eq("user_id", callerData.user.id)
      .eq("auth_session_id", authSessionId)
      .maybeSingle()
    : { data: null };
  const redactedPassword = "[REDACTED: CREDENTIAL OR SECRET]";
  const { error: auditError } = await adminClient.from("audit_log").insert({
    user_id: callerData.user.id,
    user_name: actorName,
    action: "USER_PASSWORD_CHANGED",
    module: "user_accounts",
    record_id: callerData.user.id,
    record_type: "auth.users",
    result: "Success",
    before_values: { password: redactedPassword, must_change_password: true },
    after_values: { password: redactedPassword, must_change_password: false },
    purpose: "User changed their temporary password at first sign-in.",
    context: "Password changed successfully. The plaintext and stored password hash are never recorded.",
    session_id: trackedSession?.id ?? null,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    device_info: request.headers.get("x-client-info")?.slice(0, 500) ?? null,
    user_agent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
  });

  return respond(200, { changed: true, auditLogged: !auditError });
});
