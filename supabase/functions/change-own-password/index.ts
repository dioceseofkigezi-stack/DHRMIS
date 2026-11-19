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
  if (request.method !== "POST") return respond(405, { message: "Use POST to change your password." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { message: "The password service is not configured." });
  }

  const authorization = request.headers.get("Authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!authorization || !bearerMatch) return respond(401, { message: "Sign in with your recovery link to continue." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { message: "Enter a valid password request." });
  }
  const password = body && typeof body === "object" && "password" in body && typeof body.password === "string"
    ? body.password
    : "";
  if (password.length < 10 || password.length > 128) {
    return respond(400, { message: "Use a password between 10 and 128 characters." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(bearerMatch[1]);
  if (callerError || !callerData.user) return respond(401, { message: "Your recovery session has expired. Request a new recovery link." });
  if (callerData.user.app_metadata?.must_change_password === true) {
    return respond(403, { message: "Confirm your temporary password on the first-login password page." });
  }

  const { error: updateError } = await callerClient.auth.updateUser({ password });
  if (updateError) {
    console.error("change-own-password: password update failed", {
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
    before_values: { password: redactedPassword },
    after_values: { password: redactedPassword },
    purpose: "User changed their account password through password recovery.",
    context: "Password changed successfully. The plaintext and stored password hash are never recorded.",
    session_id: trackedSession?.id ?? null,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    device_info: request.headers.get("x-client-info")?.slice(0, 500) ?? null,
    user_agent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
  });

  return respond(200, { changed: true, auditLogged: !auditError });
});
