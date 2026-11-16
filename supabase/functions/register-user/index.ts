import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const roleCodes = new Set([
  "SUPER_ADMIN", "SYSTEM_ADMIN", "SECRETARIAT_USER", "MISSION_BOARD_USER",
  "EDUCATION_BOARD_USER", "HEALTH_BOARD_USER", "LAND_FINANCE_BOARD_USER",
  "PLANNING_DEVELOPMENT_BOARD_USER", "ICT_BOARD_USER",
]);

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isCurrentActiveSuperAdmin(role: Record<string, unknown>) {
  const active = role.isActive ?? role.isactive;
  const suspended = role.isSuspended ?? role.issuspended;
  const expiry = role.accountExpiry ?? role.accountexpiry;
  const lockedUntil = role.lockedUntil ?? role.lockeduntil;
  return active === true && suspended !== true &&
    (typeof expiry !== "string" || Date.parse(expiry) > Date.now()) &&
    (typeof lockedUntil !== "string" || Date.parse(lockedUntil) <= Date.now());
}

function tokenHasAal2(accessToken: string) {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return false;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as Record<string, unknown>;
    return claims.aal === "aal2";
  } catch {
    return false;
  }
}

function sessionIdFromToken(accessToken: string) {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return "";
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as Record<string, unknown>;
    return typeof claims.session_id === "string" ? claims.session_id : "";
  } catch {
    return "";
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { message: "Use POST to register a user." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { message: "The account service is not configured." });
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
  const { data: roleRows, error: roleError } = await adminClient
    .from("user_roles")
    .select("*")
    .eq("user_id", callerData.user.id)
    .eq("role_code", "SUPER_ADMIN");
  if (roleError) return respond(500, { message: "Administrator access could not be checked." });
  const authSessionId = sessionIdFromToken(accessToken);
  const { data: trackedSession, error: sessionError } = authSessionId
    ? await adminClient.from("user_sessions").select("id")
      .eq("user_id", callerData.user.id)
      .eq("auth_session_id", authSessionId)
      .eq("isactive", true)
      .gt("expiresat", new Date().toISOString())
      .maybeSingle()
    : { data: null, error: null };
  if (sessionError) return respond(500, { message: "Administrator session access could not be checked." });
  if (!tokenHasAal2(accessToken) || !trackedSession || !(roleRows ?? []).some((row) => isCurrentActiveSuperAdmin(row as Record<string, unknown>))) {
    return respond(403, { message: "Only an active Super Admin session with multi-factor authentication can register users." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { message: "Enter a valid registration request." });
  }
  if (!body || typeof body !== "object") return respond(400, { message: "Enter a valid registration request." });

  const input = body as Record<string, unknown>;
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const roleCode = typeof input.roleCode === "string" ? input.roleCode : "";
  if (!fullName || fullName.length > 120 || /[\r\n\0]/.test(fullName)) {
    return respond(400, { message: "Enter a name of 1 to 120 characters." });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(400, { message: "Enter a valid email address." });
  }
  if (!roleCodes.has(roleCode)) return respond(400, { message: "Select a valid system role." });

  const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });
  const invitedUser = invitation.user;
  if (inviteError || !invitedUser) {
    const detail = inviteError?.message.toLowerCase() ?? "";
    if (detail.includes("already") || detail.includes("registered") || detail.includes("exists")) {
      return respond(409, { message: "An account with this email already exists. Use User access to assign another role." });
    }
    return respond(502, { message: "The invitation email could not be sent. Check the project email settings and try again." });
  }

  const { error: assignmentError } = await adminClient.from("user_roles").insert({
    user_id: invitedUser.id,
    role_code: roleCode,
    permissions: [],
    scopes: [],
    isactive: true,
    issuspended: false,
    ismfaenabled: true,
  });
  if (assignmentError) {
    await adminClient.auth.admin.deleteUser(invitedUser.id);
    if (assignmentError.code === "23505") {
      return respond(409, { message: "That designated role already has an active account. Deactivate or replace its current account first." });
    }
    return respond(500, { message: "The account could not be assigned its initial role. The registration was cancelled." });
  }

  return respond(201, { userId: invitedUser.id, message: "Invitation sent." });
});
