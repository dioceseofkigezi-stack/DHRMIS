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

  return respond(200, { changed: true });
});
