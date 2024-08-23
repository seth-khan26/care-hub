# Multi-Tenancy

## Model

CareHub uses a **shared database, shared schema** multi-tenancy model. All tenants (medical practices) share the same PostgreSQL instance and the same tables. Isolation is enforced at the application layer through `organizationId` on every tenant-owned row, combined with mandatory membership verification on every request.

This model offers simpler operations and easier cross-tenant analytics compared to schema-per-tenant or database-per-tenant approaches, at the cost of needing discipline in the application layer — which is addressed through the patterns described below.

---

## The `organizationId` Invariant

Every table that holds tenant data carries `organizationId`:

```
Membership, Location, Provider, ProviderAvailability, Patient,
PatientContact, PatientInsurance, Appointment, Encounter,
ClinicalNote, ClinicalNoteVersion, Document, AuditLog, Notification, Invitation
```

No query against a tenant-owned table should omit `organizationId` in its `where` clause. The `assertTenantOwnership()` check is a safety net for cases where a query is driven by a resource ID rather than a list query.

---

## Tenant Resolution

The entry point is `resolveTenantContext()` in `src/lib/tenancy.ts`:

```typescript
export async function resolveTenantContext(
  userId: string,
  orgSlug: string
): Promise<TenantContext>
```

It performs a single database query that:
1. Looks up the `Membership` row for `(userId, orgSlug)`
2. Requires `membership.isActive = true`
3. Requires `organization.isActive = true`

If no matching membership exists the function throws `TenantNotFoundError`, which the caller maps to a 404 (API) or redirect to `/select-org` (page layout).

This means:
- A user with no membership in an org cannot access it, even if they guess the slug
- A deactivated user (membership.isActive = false) is immediately locked out
- A deactivated organization (organization.isActive = false) is inaccessible to all its members

The returned `TenantContext` is:

```typescript
interface TenantContext {
  organizationId: string;   // The UUID used in all DB queries
  organizationSlug: string;
  userId: string;
  role: MembershipRole;
  membershipId: string;
}
```

This is the single source of truth for the request's identity and permissions. It is never constructed from client-supplied values.

---

## Where Tenant Context is Established

### Dashboard Pages

`src/app/(dashboard)/org/[orgSlug]/layout.tsx` is a Next.js server component that runs before any page under `/org/[orgSlug]/`. It:

1. Calls `requireSession()` — redirects to `/login` if no valid session
2. Calls `resolveTenantContext(session.user.id, orgSlug)` — redirects to `/select-org` if not a member

Every child page component can trust that both checks have passed.

### API Routes

`src/lib/api-context.ts` exports `getApiContext(req, orgSlug)` which performs the same two checks and returns a typed `ApiContext`:

```typescript
interface ApiContext {
  session: ActiveSession;
  tenant: TenantContext;
  requestId: string;
  ipAddress: string;
}
```

Every API route calls this at the top:

```typescript
const result = await getApiContext(req, orgSlug);
if ("error" in result) return result.error;
const { ctx } = result;
```

The pattern of returning `{ error: NextResponse } | { ctx: ApiContext }` forces the caller to handle the error case before the `ctx` variable is in scope.

---

## Cross-Tenant Attack Prevention

### The IDOR Problem

Without `assertTenantOwnership()`, a malicious user at Org A could POST `{ patientId: "<id of Org B's patient>" }` to create an appointment. The API might fetch that patient by ID, find it, and proceed — leaking the fact that the patient exists in the system, or worse, creating records that reference cross-tenant data.

`assertTenantOwnership()` closes this:

```typescript
const patient = await db.patient.findUnique({ where: { id: data.patientId } });
if (!patient) return apiError("Patient not found", 404);
assertTenantOwnership(ctx, patient.organizationId);  // Throws if wrong tenant
```

The function compares `patient.organizationId` against `ctx.tenant.organizationId`. If they differ it throws `TenantAuthorizationError` which the error handler maps to a 403. From the attacker's perspective, the response is indistinguishable from a legitimate 404 or 403.

### Slug Guessing

The `orgSlug` in the URL is not a secret — it's a human-readable identifier like `downtown-family-clinic`. Knowing the slug gives nothing; the membership check will fail for any user not enrolled in that org.

### Session Fixation

Sessions are created fresh on login with a newly generated token. There is no mechanism to "fix" a session before login. `requireSession()` reads the cookie and validates against the database, so even a forged cookie with a valid-looking UUID will fail the DB lookup.

---

## Multiple Org Memberships

A user can belong to multiple organizations (e.g., a provider who works at two clinics). After login:

- If the user has **1 membership** → redirect to `/org/<slug>` directly
- If the user has **2+ memberships** → redirect to `/select-org` where they pick which org to enter

Once inside `/org/<slug>`, all operations are scoped to that organization for the duration of the browser session in that tab. Switching orgs means navigating to a different slug URL.

---

## PostgreSQL RLS (Defense-in-Depth)

While the application layer enforces all tenant isolation, the schema is designed to be compatible with PostgreSQL Row Level Security as a second layer of defense. RLS policies would add the `organizationId` check at the database driver level, so a SQL injection or a misconfigured query that bypasses the application layer would still fail.

Enabling RLS is left as a production hardening step — the application works correctly without it, and enabling it requires setting the `organizationId` on the Postgres session for each request, which is straightforward to add with a Prisma middleware or a pool `connect` hook.
