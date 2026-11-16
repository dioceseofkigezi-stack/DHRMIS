import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const roleCodes = new Set([
  "SuperAdministrator", "SystemAdministrator", "CentralHR", "BoardHR",
  "ArchdeaconryAdmin", "ParishAdmin", "InstitutionAdmin", "FinanceOfficer",
  "RegistryOfficer", "SafeguardingOfficer", "ICTAdministrator", "Auditor",
  "Employee", "ReadOnly",
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
    .eq("role_code", "SuperAdministrator");
  if (roleError) return respond(500, { message: "Administrator access could not be checked." });
  if (!(roleRows ?? []).some((row) => isCurrentActiveSuperAdmin(row as Record<string, unknown>))) {
    return respond(403, { message: "Only an active SuperAdministrator can register users." });
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
  });
  if (assignmentError) {
    await adminClient.auth.admin.deleteUser(invitedUser.id);
    return respond(500, { message: "The account could not be assigned its initial role. The registration was cancelled." });
  }

  return respond(201, { userId: invitedUser.id, message: "Invitation sent." });
});
