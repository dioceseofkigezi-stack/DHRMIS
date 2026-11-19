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
  if (request.method !== "POST") return respond(405, { message: "Use POST to update your email address." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { message: "The email service is not configured." });
  }

  const authorization = request.headers.get("Authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!authorization || !bearerMatch) return respond(401, { message: "Sign in again to continue." });
  const accessToken = bearerMatch[1];
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser(accessToken);
  if (callerError || !callerData.user) return respond(401, { message: "Your session has expired. Sign in again." });
  const user = callerData.user;
  if (user.app_metadata?.must_change_password === true) {
    return respond(403, { message: "Change your temporary password before updating your email address." });
  }

  const authSessionId = sessionIdFromToken(accessToken);
  const { data: trackedSession, error: sessionError } = authSessionId
    ? await adminClient.from("user_sessions").select("id")
      .eq("user_id", user.id)
      .eq("auth_session_id", authSessionId)
      .eq("isactive", true)
      .gt("expiresat", new Date().toISOString())
      .maybeSingle()
    : { data: null, error: null };
  if (sessionError) return respond(500, { message: "Your account session could not be checked." });
  if (!trackedSession) return respond(403, { message: "Sign in again to update your email address." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { message: "Enter a valid email request." });
  }
  const email = body && typeof body === "object" && "email" in body && typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(400, { message: "Enter a valid email address." });
  }
  if (email === (user.email ?? "").toLowerCase()) return respond(200, { changed: false, email });

  const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: true,
  });
  if (updateError || !updatedUser.user) {
    const detail = updateError?.message.toLowerCase() ?? "";
    if (detail.includes("already been registered") || detail.includes("already exists")) {
      return respond(409, { message: "That email address is already in use." });
    }
    return respond(502, { message: "Your email address could not be changed. Check the address and try again." });
  }

  const metadata = user.user_metadata ?? {};
  const actorName = (typeof metadata.full_name === "string" && metadata.full_name) || user.email || null;
  const { error: auditError } = await adminClient.from("audit_log").insert({
    user_id: user.id,
    user_name: actorName,
    action: "USER_ACCOUNT_UPDATED",
    module: "user_accounts",
    record_id: user.id,
    record_type: "auth.users",
    result: "Success",
    before_values: { email: user.email ?? "" },
    after_values: { email: updatedUser.user.email ?? email },
    purpose: "User updated their own account email address.",
    context: "Email address changed without an email confirmation step.",
    session_id: trackedSession.id,
  });

  return respond(200, {
    changed: true,
    email: updatedUser.user.email ?? email,
    auditLogged: !auditError,
  });
});
