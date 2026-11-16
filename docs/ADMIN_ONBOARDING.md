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

After signing in, use **Personnel domains** to review the Secretariat domain and the six Board domains. Use **User access** to provision existing Auth accounts with the least-privilege role they need, then add the matching scope under **User scopes**:

- Secretariat personnel managers need the `CentralHR` role and a `PersonnelDomain` scope for `SECRETARIAT`.
- Board personnel managers need the `BoardHR` role and a `Board` scope for their Board. A `PersonnelDomain` scope for the matching domain also works.
- Archdeaconry and Parish administrators keep their existing geographic scopes. Those scopes provide access to the ecclesiastical structure administered by the Secretariat.
- `SystemAdministrator` and `ICTAdministrator` do not grant HR-record access. Add a separate personnel role and matching organizational scope when the person is also authorized to manage HR.

The `scope_id` is the UUID of the selected Board or personnel domain. Assign scopes through the protected **User scopes** page or a trusted database operator. Role and scope assignments are enforced by database policies; hiding a page in the frontend is not an authorization control.

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

If the initial administrator cannot sign in, verify that the Auth account exists, the role row references its exact Auth user ID, the migrations were applied successfully, and the role is active and not suspended or expired.
