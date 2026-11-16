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
  isactive,
  issuspended
)
VALUES (
  'REPLACE_WITH_AUTH_USER_UUID'::uuid,
  'SUPER_ADMIN',
  '[]'::jsonb,
  '[]'::jsonb,
  TRUE,
  FALSE
);
```

Use the Auth user ID from the Supabase dashboard, not an email address supplied by an untrusted client. Only trusted database operators should run this statement. The database permits one active account per designated role.

After signing in, use **Personnel domains** to review the Secretariat domain and the six Board domains. Use **User access** to invite a named person into an available designated role. The database assigns the matching PersonnelDomain scope automatically:

- `SECRETARIAT_USER` is scoped to `SECRETARIAT` and manages Secretariat personnel and the ecclesiastical structure.
- Each Board role is scoped to its matching Board personnel domain.
- Archdeaconries, parishes and local churches remain organizational records under the Secretariat. They do not receive independent accounts.
- `SYSTEM_ADMIN` receives technical configuration and monitoring privileges, without HR-record access.

Keep the Super Administrator account protected and use it to invite, suspend or replace the one named account holder for each role. Super Admins and System Admins can review recorded sign-ins and revoke a session from **Session management**. Role, scope and session status are enforced by database policies; hiding a page in the frontend is not an authorization control.

After applying the decentralized-workspace migration, review historical rows that could not be mapped safely before granting access:

```sql
SELECT 'assignments' AS source, COUNT(*) AS unmapped
FROM public.assignments WHERE personnel_domain_id IS NULL
UNION ALL
SELECT 'employee_roles', COUNT(*)
FROM public.employee_roles WHERE personnel_domain_id IS NULL
UNION ALL
SELECT 'vacancies', COUNT(*)
FROM public.vacancies WHERE personnel_domain_id IS NULL;
```

The migration leaves records with ambiguous or unknown ownership unmapped rather than assigning them to a Board or Secretariat by guesswork. Resolve those rows against the Diocese's approved records before enabling the corresponding workspace.

Legacy role assignments that do not map safely to the nine-role model are retained as inactive history. In particular, review old ICT Administrator accounts and invite the named ICT Board User separately where that person is responsible for ICT personnel.

If the initial administrator cannot sign in, verify that the Auth account exists, the role row references its exact Auth user ID, the migrations were applied successfully, and the role is active and not suspended or expired.
