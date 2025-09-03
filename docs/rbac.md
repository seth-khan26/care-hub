# Role-Based Access Control

## Design Philosophy

Permissions are checked through a single function:

```typescript
authorize(ctx, "resource.action")
```

There are no scattered `if (role === "ADMIN")` checks in route handlers or page components. Every permission check goes through `authorize()`, which throws `TenantAuthorizationError` on failure. This means:

- Adding a new role means adding one entry to the permission map
- Auditing what a role can do means reading one file (`src/lib/permissions.ts`)
- A forgotten permission check is a reviewable gap, not a hidden conditional

---

## Roles

| Role | Description |
|---|---|
| `OWNER` | Full access to everything including org settings, billing, and audit logs. Only one OWNER per org initially (the founder); more can be promoted. |
| `ADMIN` | Same permissions as OWNER. Intended for practice managers. |
| `PROVIDER` | Clinical access: read patients and records, create/finalize clinical notes, view appointments. Cannot manage staff or org settings. |
| `STAFF` | Front-desk access: register and update patients, schedule/cancel appointments, view encounters. Cannot create or view clinical notes. |
| `PATIENT` | Portal access: view their own appointments and documents. Minimal permissions. |

---

## Permissions Matrix

| Permission | OWNER | ADMIN | PROVIDER | STAFF | PATIENT |
|---|:---:|:---:|:---:|:---:|:---:|
| `patients.read` | ✓ | ✓ | ✓ | ✓ | |
| `patients.create` | ✓ | ✓ | | ✓ | |
| `patients.update` | ✓ | ✓ | | ✓ | |
| `clinical_notes.read` | ✓ | ✓ | ✓ | | |
| `clinical_notes.create` | ✓ | ✓ | ✓ | | |
| `clinical_notes.update` | ✓ | ✓ | ✓ | | |
| `clinical_notes.finalize` | ✓ | ✓ | ✓ | | |
| `appointments.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `appointments.create` | ✓ | ✓ | | ✓ | |
| `appointments.update` | ✓ | ✓ | ✓ | ✓ | |
| `appointments.cancel` | ✓ | ✓ | | ✓ | |
| `encounters.read` | ✓ | ✓ | ✓ | ✓ | |
| `encounters.create` | ✓ | ✓ | ✓ | | |
| `staff.manage` | ✓ | ✓ | | | |
| `staff.invite` | ✓ | ✓ | | | |
| `providers.manage` | ✓ | ✓ | | | |
| `locations.manage` | ✓ | ✓ | | | |
| `audit_logs.read` | ✓ | ✓ | | | |
| `documents.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `documents.upload` | ✓ | ✓ | ✓ | ✓ | |
| `documents.delete` | ✓ | ✓ | | | |
| `organization.settings` | ✓ | ✓ | | | |

---

## Implementation

### `src/lib/permissions.ts`

The permission map is a plain TypeScript object:

```typescript
const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  OWNER: [ /* all permissions */ ],
  ADMIN: [ /* same as OWNER */ ],
  PROVIDER: ["patients.read", "clinical_notes.*", "appointments.read", "appointments.update", "encounters.*", "documents.read", "documents.upload"],
  STAFF: ["patients.*", "appointments.*", "encounters.read", "documents.read", "documents.upload"],
  PATIENT: ["appointments.read", "documents.read"],
};
```

`hasPermission(role, permission)` does a simple array lookup. There is no inheritance chain or hierarchical role system — this is deliberate. A flat explicit map is easier to audit than implicit hierarchies.

### `src/lib/tenancy.ts`

```typescript
export function authorize(ctx: CtxOrTenant, permission: Permission): void {
  const t = asTenant(ctx);
  if (!hasPermission(t.role, permission)) {
    throw new TenantAuthorizationError(
      `Role ${t.role} does not have permission: ${permission}`
    );
  }
}
```

`authorize()` accepts either a `TenantContext` directly or an object with a `.tenant` property (like `ApiContext`). This removes the need for callers to destructure `ctx.tenant` every time.

### Error Handling

`TenantAuthorizationError` is caught by `handleApiError()` in `src/lib/errors.ts` and mapped to a 403 response. On pages, it surfaces as a redirect or an error boundary. Clinical-note access by STAFF produces the same 403 as a cross-tenant request — the error message in the body clarifies the role constraint, but the HTTP status is identical.

---

## Extending the System

### Adding a new permission

1. Add the permission string to the `Permission` union type in `src/lib/permissions.ts`
2. Add it to the appropriate role arrays in `ROLE_PERMISSIONS`
3. Call `authorize(ctx, "new.permission")` in the route handler

### Adding a new role

1. Add the role to the `MembershipRole` enum in `schema.prisma` and run `prisma db push`
2. Add a new entry to `ROLE_PERMISSIONS` with the desired permission list
3. Update the invitation flow (`src/app/api/staff/route.ts`) to allow the new role to be assigned

### Checking permissions in UI

For conditional UI rendering (e.g., hiding the "Finalize" button for STAFF), read the user's role from the session and check it against a helper:

```typescript
import { hasPermission } from "@/lib/permissions";
// In a server component:
const canFinalize = hasPermission(tenant.role, "clinical_notes.finalize");
```

This is the only acceptable place to check roles in the UI. Do not inline role comparisons (`role === "ADMIN"`) in component code.

## Roles

OWNER, ADMIN, PROVIDER, STAFF, PATIENT — each with distinct permissions.

## Authorization

`authorize(ctx, permission)` is the single gate for all access decisions.
