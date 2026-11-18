import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const roleCodes = new Set([
  "SUPER_SYSTEM_ADMIN", "SECRETARIAT_USER", "MISSION_BOARD_USER",
  "EDUCATION_BOARD_USER", "HEALTH_BOARD_USER", "LAND_FINANCE_BOARD_USER",
  "PLANNING_DEVELOPMENT_BOARD_USER", "ICT_BOARD_USER",
]);

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomIndex(length: number) {
  const range = Math.floor(256 / length) * length;
  const byte = new Uint8Array(1);
  do crypto.getRandomValues(byte); while (byte[0] >= range);
  return byte[0] % length;
}

function randomCharacter(characters: string) {
  return characters[randomIndex(characters.length)];
}

function createTemporaryPassword() {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*+-_=.?";
  const all = lower + upper + digits + symbols;
  const characters = [randomCharacter(lower), randomCharacter(upper), randomCharacter(digits), randomCharacter(symbols)];
  while (characters.length < 24) characters.push(randomCharacter(all));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

function creationFailure(error: { code?: string; status?: number; message?: string }) {
  const detail = (error.message ?? "").toLowerCase();
  const reference = error.code ? ` Reference: ${error.code}.` : "";
  if (detail.includes("already") || detail.includes("registered") || detail.includes("exists")) {
    return respond(409, { message: "An account with this email already exists. Use User access to assign another role." });
  }
  if (detail.includes("invalid email") || detail.includes("email is invalid")) {
    return respond(400, { message: "Supabase Auth rejected this email address. Check the address and try again." });
  }
  if (error.status === 429 || detail.includes("rate limit") || detail.includes("too many")) {
    return respond(429, { message: "The account creation limit has been reached. Wait a while and try again." });
  }
  return respond(502, { message: `Supabase Auth could not create the account. Check the project's Auth logs.${reference}` });
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
  if (request.method !== "POST") return respond(405, { message: "Use POST to create an account." });

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
  if (callerData.user.app_metadata?.must_change_password === true) {
    return respond(403, { message: "Change your temporary password before using account administration." });
  }
  const { data: roleRows, error: roleError } = await adminClient
    .from("user_roles")
    .select("*")
    .eq("user_id", callerData.user.id)
    .eq("role_code", "SUPER_SYSTEM_ADMIN");
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
  if (!trackedSession || !(roleRows ?? []).some((row) => isCurrentActiveSuperAdmin(row as Record<string, unknown>))) {
    return respond(403, { message: "Only an active Super System Administrator session can create accounts." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { message: "Enter a valid account request." });
  }
  if (!body || typeof body !== "object") return respond(400, { message: "Enter a valid account request." });

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

  const temporaryPassword = createTemporaryPassword();
  let creationResult: Awaited<ReturnType<typeof adminClient.auth.admin.createUser>>;
  try {
    creationResult = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, name: fullName },
      app_metadata: { must_change_password: true },
    });
  } catch (reason) {
    console.error("register-user: Supabase Auth account creation request failed", reason);
    return respond(502, { message: "The account service could not reach Supabase Auth. Check the Edge Function logs and try again." });
  }
  const newUser = creationResult.data?.user;
  if (creationResult.error || !newUser) {
    if (creationResult.error) console.error("register-user: Supabase Auth rejected an account", {
      code: creationResult.error.code,
      status: creationResult.error.status,
      message: creationResult.error.message,
    });
    return creationResult.error
      ? creationFailure(creationResult.error)
      : respond(502, { message: "Supabase Auth did not return the new account. Check the Auth settings." });
  }

  const { data: assignment, error: assignmentError } = await adminClient.from("user_roles").insert({
    user_id: newUser.id,
    role_code: roleCode,
    permissions: [],
    scopes: [],
    isactive: true,
    issuspended: false,
  }).select("id").single();
  if (assignmentError) {
    await adminClient.auth.admin.deleteUser(newUser.id);
    if (assignmentError.code === "23505") {
      return respond(409, { message: "That designated role already has an active account. Deactivate or replace its current account first." });
    }
    return respond(500, { message: "The account could not be assigned its initial role. The registration was cancelled." });
  }

  const actorName = callerData.user.user_metadata?.full_name || callerData.user.user_metadata?.name || callerData.user.email || null;
  const { data: auditEntry, error: auditError } = assignment
    ? await adminClient.from("audit_log").update({
      user_id: callerData.user.id,
      user_name: actorName,
      action: "USER_ACCOUNT_CREATED",
      purpose: `Created ${email} with role ${roleCode} and a required first-login password change.`,
    }).eq("record_id", assignment.id).eq("module", "user_roles").is("user_id", null).select("id").maybeSingle()
    : { data: null, error: new Error("The role assignment audit record is unavailable.") };

  return respond(201, {
    userId: newUser.id,
    temporaryPassword,
    message: "Account created. The temporary password must be changed at first sign-in.",
    auditLogged: !auditError && Boolean(auditEntry),
  });
});
