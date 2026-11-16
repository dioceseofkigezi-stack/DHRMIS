# Administrator onboarding

## Apply database migrations

Before granting access, apply the migrations to the intended Supabase project using a trusted operator environment. Confirm the linked project and review the pending migration list before running `supabase db push`. Do not put database credentials or a service-role key in the browser application.

## Provision the first administrator

There is intentionally no public administrator bootstrap. First create the operator's account through Supabase Auth, then open the SQL Editor in the trusted Supabase dashboard and run the following statement after replacing the UUID with that account's Auth user ID:

```sql
INSERT INTO public.user_roles (
  user_id,
  role_code,
  permissions,
  scopes,
  "isActive",
  "isSuspended"
)
VALUES (
  'REPLACE_WITH_AUTH_USER_UUID'::uuid,
  'SuperAdministrator',
  '[]'::jsonb,
  '[]'::jsonb,
  TRUE,
  FALSE
);
```

Use the Auth user ID from the Supabase dashboard, not an email address supplied by an untrusted client. Only trusted database operators should run this statement. Avoid granting this role to multiple users unless required by the organization's administration policy.

After signing in, use **User access** to provision additional existing Auth accounts with the least-privilege role they need. Link an employee record when the account needs employee self-service, and add organizational scopes only where needed. Role and scope assignments are enforced by database policies; hiding a page in the frontend is not an authorization control.

If the initial administrator cannot sign in, verify that the Auth account exists, the role row references its exact Auth user ID, the migrations were applied successfully, and the role is active and not suspended or expired.
