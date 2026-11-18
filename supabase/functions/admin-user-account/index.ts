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

function editableDetails(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}, username: string) {
  const userMetadata = user.user_metadata ?? {};
  return {
    email: user.email ?? "",
    username,
    fullName: typeof userMetadata.full_name === "string"
      ? userMetadata.full_name
      : typeof userMetadata.name === "string" ? userMetadata.name : "",
    phone: typeof userMetadata.phone === "string"
      ? userMetadata.phone
      : typeof userMetadata.telephone === "string" ? userMetadata.telephone : "",
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { message: "Use POST to manage account details." });

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
    return respond(403, { message: "Only an active Super/System Administrator session can edit account details." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { message: "Enter a valid account request." });
  }
  if (!body || typeof body !== "object") return respond(400, { message: "Enter a valid account request." });
  const input = body as Record<string, unknown>;
  const action = input.action;
  const userId = typeof input.userId === "string" ? input.userId : "";
  if (action !== "get" && action !== "update" && action !== "delete") return respond(400, { message: "Choose a valid account action." });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return respond(400, { message: "Choose a valid user account." });
  }
  if (action === "delete" && userId === callerData.user.id) {
    return respond(403, { message: "You cannot delete the account you are currently using." });
  }

  const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(userId);
  const targetUser = targetData.user;
  if (targetError || !targetUser) return respond(404, { message: "The selected account could not be found." });
  if (action === "delete") {
    const { data: targetRoles, error: targetRolesError } = await adminClient.from("user_roles")
      .select("role_code,isactive,issuspended,accountexpiry,lockeduntil")
      .eq("user_id", userId);
    if (targetRolesError) return respond(500, { message: "The account's role assignments could not be checked." });
    const targetIsActiveSystemAdmin = (targetRoles ?? []).some((role) =>
      role.role_code === "SUPER_SYSTEM_ADMIN" && isCurrentActiveSuperAdmin(role as Record<string, unknown>));
    if (targetIsActiveSystemAdmin) {
      const { data: adminRows, error: adminRowsError } = await adminClient.from("user_roles")
        .select("user_id,isactive,issuspended,accountexpiry,lockeduntil")
        .eq("role_code", "SUPER_SYSTEM_ADMIN");
      if (adminRowsError) return respond(500, { message: "The active administrator account could not be checked." });
      const activeAdminCount = (adminRows ?? []).filter((row) => isCurrentActiveSuperAdmin(row as Record<string, unknown>)).length;
      if (activeAdminCount <= 1) {
        return respond(409, { message: "The last active Super/System Administrator account cannot be deleted. Assign another active administrator first." });
      }
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      const detail = deleteError.message.toLowerCase();
      if (deleteError.code === "23503" || detail.includes("foreign key constraint") ||
          detail.includes("violates foreign key") || detail.includes("database error deleting user")) {
        return respond(409, { message: "This account is linked to records that must be reassigned before it can be deleted." });
      }
      console.error("admin-user-account: account deletion failed", {
        code: deleteError.code,
        status: deleteError.status,
        message: deleteError.message,
      });
      return respond(502, { message: "The account could not be deleted. Check the Auth and database logs, then try again." });
    }

    const actorMetadata = callerData.user.user_metadata ?? {};
    const actorName = (typeof actorMetadata.full_name === "string" && actorMetadata.full_name) ||
      (typeof actorMetadata.name === "string" && actorMetadata.name) || callerData.user.email || null;
    const { error: auditError } = await adminClient.from("audit_log").insert({
      user_id: callerData.user.id,
      user_name: actorName,
      action: "USER_ACCOUNT_DELETED",
      module: "user_accounts",
      record_id: userId,
      record_type: "auth.users",
      result: "Success",
      before_values: {
        email: targetUser.email ?? null,
        full_name: targetUser.user_metadata?.full_name ?? targetUser.user_metadata?.name ?? null,
        role_codes: (targetRoles ?? []).map((role) => role.role_code),
      },
      after_values: { deleted: true },
      purpose: "Super/System Administrator deleted a user account.",
      context: "Deleted the Auth account and its cascading access assignments.",
      session_id: trackedSession.id,
    });
    return respond(200, { deleted: true, auditLogged: !auditError });
  }

  const { data: usernameRecord, error: usernameReadError } = await adminClient.from("admin_usernames")
    .select("username")
    .eq("user_id", userId)
    .maybeSingle();
  if (usernameReadError) return respond(500, { message: "The account username could not be loaded." });
  const storedUsername = typeof usernameRecord?.username === "string" ? usernameRecord.username : "";
  if (action === "get") return respond(200, editableDetails(targetUser, storedUsername));

  const username = typeof input.username === "string" ? input.username.trim() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (username && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/.test(username)) {
    return respond(400, { message: "Use 3 to 40 characters for the username: letters, numbers, periods, underscores, or hyphens." });
  }
  if (!fullName || fullName.length > 120 || /[\r\n\0]/.test(fullName)) {
    return respond(400, { message: "Enter a name of 1 to 120 characters." });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(400, { message: "Enter a valid email address." });
  }
  const phoneDigits = phone.replace(/\D/g, "");
  if (phone && (!/^[+0-9().\s-]+$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15)) {
    return respond(400, { message: "Enter a valid contact phone number, including its country code if needed." });
  }

  const before = editableDetails(targetUser, storedUsername);
  const after = { username, fullName, email, phone };
  const changedFields = (Object.keys(after) as Array<keyof typeof after>)
    .filter((field) => before[field] !== after[field]);
  if (changedFields.length === 0) return respond(200, { changed: false, auditLogged: true });

  let reservedUsernameVersion: number | null = null;
  if (before.username !== username) {
    const { data: reserveData, error: reserveError } = await adminClient.rpc("admin_set_user_username", {
      p_user_id: userId,
      p_username: username || null,
      p_expected_version: null,
    });
    if (reserveError) {
      if (reserveError.code === "23505" || reserveError.message.includes("admin_usernames_username_unique_idx")) {
        return respond(409, { message: "That username is already in use." });
      }
      return respond(500, { message: "The username could not be saved." });
    }
    const parsedVersion = typeof reserveData === "number" ? reserveData : Number(reserveData);
    if (!Number.isSafeInteger(parsedVersion) || parsedVersion <= 0) {
      return respond(409, { message: "This account changed while you were editing it. Reload the account details and try again." });
    }
    reservedUsernameVersion = parsedVersion;
  }

  const userMetadata = { ...(targetUser.user_metadata ?? {}) };
  userMetadata.full_name = fullName;
  userMetadata.name = fullName;
  delete userMetadata.username;
  delete userMetadata.telephone;
  if (phone) userMetadata.phone = phone;
  else delete userMetadata.phone;

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (updateError) {
    const message = updateError.message.toLowerCase();
    if (reservedUsernameVersion !== null) {
      const { data: rollbackVersion, error: rollbackError } = await adminClient.rpc("admin_set_user_username", {
        p_user_id: userId,
        p_username: before.username || null,
        p_expected_version: reservedUsernameVersion,
      });
      if (rollbackError || Number(rollbackVersion) === 0) {
        return respond(500, { message: "The account details could not be updated, and the username changed concurrently. Reload the account details and try again." });
      }
    }
    if (message.includes("already been registered") || message.includes("already exists")) {
      return respond(409, { message: "That email address is already in use." });
    }
    return respond(502, { message: "The account details could not be updated. Check the details and try again." });
  }

  const actorMetadata = callerData.user.user_metadata ?? {};
  const actorName = (typeof actorMetadata.full_name === "string" && actorMetadata.full_name) ||
    (typeof actorMetadata.name === "string" && actorMetadata.name) || callerData.user.email || null;
  const beforeValues = Object.fromEntries(changedFields.map((field) => [field, before[field]]));
  const afterValues = Object.fromEntries(changedFields.map((field) => [field, after[field]]));
  const { error: auditError } = await adminClient.from("audit_log").insert({
    user_id: callerData.user.id,
    user_name: actorName,
    action: "USER_ACCOUNT_UPDATED",
    module: "user_accounts",
    record_id: userId,
    record_type: "auth.users",
    result: "Success",
    before_values: beforeValues,
    after_values: afterValues,
    purpose: "Super/System Administrator updated account details.",
    context: `Updated: ${changedFields.join(", ")}.`,
    session_id: trackedSession.id,
  });

  return respond(200, { changed: true, auditLogged: !auditError });
});
