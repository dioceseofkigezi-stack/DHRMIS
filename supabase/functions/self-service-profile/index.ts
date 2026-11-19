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

function profileDetails(user: { email?: string; user_metadata?: Record<string, unknown> }, username: string) {
  const metadata = user.user_metadata ?? {};
  return {
    email: user.email ?? "",
    username,
    fullName: typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string" ? metadata.name : "",
    phone: typeof metadata.phone === "string"
      ? metadata.phone
      : typeof metadata.telephone === "string" ? metadata.telephone : "",
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { message: "Use POST to manage your account profile." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond(500, { message: "The profile service is not configured." });

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
    return respond(403, { message: "Change your temporary password before updating your profile." });
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
  if (!trackedSession) return respond(403, { message: "Sign in again to update your account profile." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { message: "Enter a valid profile request." });
  }
  if (!body || typeof body !== "object") return respond(400, { message: "Enter a valid profile request." });
  const input = body as Record<string, unknown>;
  if (input.action !== "get" && input.action !== "update") return respond(400, { message: "Choose a valid profile action." });

  const { data: usernameRecord, error: usernameReadError } = await adminClient.from("admin_usernames")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();
  if (usernameReadError) return respond(500, { message: "Your username could not be loaded." });
  const storedUsername = typeof usernameRecord?.username === "string" ? usernameRecord.username : "";
  const before = profileDetails(user, storedUsername);
  if (input.action === "get") return respond(200, before);

  const username = typeof input.username === "string" ? input.username.trim() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (username && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/.test(username)) {
    return respond(400, { message: "Use 3 to 40 characters for the username: letters, numbers, periods, underscores, or hyphens." });
  }
  if (!fullName || fullName.length > 120 || /[\r\n\0]/.test(fullName)) {
    return respond(400, { message: "Enter a name of 1 to 120 characters." });
  }
  const phoneDigits = phone.replace(/\D/g, "");
  if (phone && (!/^[+0-9().\s-]+$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15)) {
    return respond(400, { message: "Enter a valid phone number with 7 to 15 digits." });
  }

  const after = { username, fullName, phone };
  const changedFields = (Object.keys(after) as Array<keyof typeof after>)
    .filter((field) => before[field] !== after[field]);
  if (changedFields.length === 0) return respond(200, { changed: false });

  let reservedUsernameVersion: number | null = null;
  if (before.username !== username) {
    const { data, error } = await adminClient.rpc("admin_set_user_username", {
      p_user_id: user.id,
      p_username: username || null,
      p_expected_version: null,
    });
    if (error) {
      if (error.code === "23505" || error.message.includes("admin_usernames_username_unique_idx")) {
        return respond(409, { message: "That username is already in use." });
      }
      return respond(500, { message: "Your username could not be saved." });
    }
    const version = typeof data === "number" ? data : Number(data);
    if (!Number.isSafeInteger(version) || version <= 0) {
      return respond(409, { message: "Your account changed while you were editing it. Reload the page and try again." });
    }
    reservedUsernameVersion = version;
  }

  const metadata = { ...(user.user_metadata ?? {}) };
  metadata.full_name = fullName;
  metadata.name = fullName;
  delete metadata.telephone;
  if (phone) metadata.phone = phone;
  else delete metadata.phone;
  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, { user_metadata: metadata });
  if (updateError) {
    if (reservedUsernameVersion !== null) {
      const { data: rollbackVersion, error: rollbackError } = await adminClient.rpc("admin_set_user_username", {
        p_user_id: user.id,
        p_username: before.username || null,
        p_expected_version: reservedUsernameVersion,
      });
      if (rollbackError || Number(rollbackVersion) === 0) {
        return respond(500, { message: "Your profile details could not be updated, and the username changed concurrently. Reload your details and try again." });
      }
    }
    return respond(502, { message: "Your profile details could not be updated. Try again." });
  }

  const actorMetadata = user.user_metadata ?? {};
  const actorName = (typeof actorMetadata.full_name === "string" && actorMetadata.full_name) || user.email || null;
  const beforeValues = Object.fromEntries(changedFields.map((field) => [field, before[field]]));
  const afterValues = Object.fromEntries(changedFields.map((field) => [field, after[field]]));
  const { error: auditError } = await adminClient.from("audit_log").insert({
    user_id: user.id,
    user_name: actorName,
    action: "USER_PROFILE_UPDATED",
    module: "user_accounts",
    record_id: user.id,
    record_type: "auth.users",
    result: "Success",
    before_values: beforeValues,
    after_values: afterValues,
    purpose: "User updated their own account profile.",
    context: `Updated: ${changedFields.join(", ")}.`,
    session_id: trackedSession.id,
  });

  return respond(200, { changed: true, auditLogged: !auditError });
});
