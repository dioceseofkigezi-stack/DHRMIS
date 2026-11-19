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
  if (request.method !== "POST") return respond(405, { message: "Use POST to update your profile." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { message: "The profile service is not configured." });
  }

  const authorization = request.headers.get("Authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!authorization || !bearerMatch) return respond(401, { message: "Sign in again to update your profile." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { message: "Enter valid profile details." });
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : undefined;
  const phone = typeof input.phone === "string" ? input.phone.trim() : undefined;
  const avatarPath = typeof input.avatarPath === "string" ? input.avatarPath : input.avatarPath === null ? null : undefined;
  if (fullName !== undefined && (!fullName || fullName.length > 120 || /[\r\n\0]/.test(fullName))) {
    return respond(400, { message: "Enter a name of 1 to 120 characters." });
  }
  const phoneDigits = (phone ?? "").replace(/\D/g, "");
  if (phone !== undefined && phone && (!/^[+0-9().\s-]+$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15)) {
    return respond(400, { message: "Enter a valid contact phone number, including its country code if needed." });
  }
  if (fullName === undefined && phone === undefined && avatarPath === undefined) {
    return respond(400, { message: "Choose profile details to update." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(bearerMatch[1]);
  if (callerError || !callerData.user) return respond(401, { message: "Your session has expired. Sign in again." });
  if (callerData.user.app_metadata?.must_change_password === true) {
    return respond(403, { message: "Change your temporary password before updating your profile." });
  }

  const previousMetadata = callerData.user.user_metadata ?? {};
  if (avatarPath && (!avatarPath.startsWith(`${callerData.user.id}/`) || avatarPath.length > 500)) {
    return respond(400, { message: "Choose a profile image stored in your account folder." });
  }
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  if (fullName !== undefined) {
    before.full_name = previousMetadata.full_name ?? null;
    before.name = previousMetadata.name ?? null;
    after.full_name = fullName;
    after.name = fullName;
  }
  if (phone !== undefined) {
    before.phone = previousMetadata.phone ?? null;
    before.telephone = previousMetadata.telephone ?? null;
    after.phone = phone || null;
    after.telephone = null;
  }
  if (avatarPath !== undefined) {
    before.avatar_path = previousMetadata.avatar_path ?? null;
    after.avatar_path = avatarPath;
  }
  const changedFields = Object.keys(after).filter((field) => before[field] !== after[field]);
  if (!changedFields.length) return respond(200, { changed: false, auditLogged: true });

  const userMetadata = { ...previousMetadata, ...after };
  const { error: updateError } = await callerClient.auth.updateUser({
    data: userMetadata,
  });
  if (updateError) {
    console.error("update-own-profile: profile update failed", {
      code: updateError.code,
      status: updateError.status,
      message: updateError.message,
    });
    return respond(502, { message: "Your account details could not be saved." });
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
  const { error: auditError } = await adminClient.from("audit_log").insert({
    user_id: callerData.user.id,
    user_name: actorName,
    action: "USER_PROFILE_UPDATED",
    module: "user_accounts",
    record_id: callerData.user.id,
    record_type: "auth.users",
    result: "Success",
    before_values: Object.fromEntries(changedFields.map((field) => [field, before[field]])),
    after_values: Object.fromEntries(changedFields.map((field) => [field, after[field]])),
    purpose: "User updated their profile details.",
    context: `Updated: ${changedFields.join(", ")}.`,
    session_id: trackedSession?.id ?? null,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    device_info: request.headers.get("x-client-info")?.slice(0, 500) ?? null,
    user_agent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
  });

  return respond(200, { changed: true, auditLogged: !auditError });
});
