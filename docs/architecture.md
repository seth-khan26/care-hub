# Architecture

## Overview

CareHub is a multi-tenant healthcare practice management platform. Multiple independent medical practices (tenants) share a single PostgreSQL database, but data is isolated at the application layer on every request. There is no inter-tenant data leakage by design.

The stack is:

- **Next.js 16 App Router** — server components for data-fetching pages, API routes for mutations
- **Prisma 7** with `@prisma/adapter-pg` — ORM with driver-adapter pattern (no `url` in schema)
- **PostgreSQL 14+** — relational store; serializable transactions for conflict prevention
- **Tailwind CSS + custom shadcn-style components** — styling
- **bcryptjs** — password hashing (cost 12)
- **UUID v4** — session tokens

---

## Data Model

```
Organization ──< Membership >── User
     │                              │
     ├──< Location                  └──< Session
     ├──< Provider ──< ProviderAvailability
     ├──< Patient ──< PatientContact
     │          └──< PatientInsurance
     ├──< Appointment
     ├──< Encounter ──< ClinicalNote ──< ClinicalNoteVersion
     ├──< Document
     ├──< AuditLog
     ├──< Notification
     └──< Invitation
```

Every entity that belongs to a tenant carries `organizationId` as a non-nullable foreign key. This is the primary isolation boundary.

### Key Design Choices

**Membership as the join table.** A `User` can belong to multiple `Organization`s with different roles in each. The `(userId, organizationId)` pair is unique. A user who is a PROVIDER at one clinic and an ADMIN at another gets separate `Membership` rows.

**Provider ≠ User.** The `Provider` table stores clinical staff profiles (name, specialty, NPI, availability). A `Provider` may optionally link to a `User` via `userId`, but this is not required — a clinic can have providers in the system who do not have a login account.

**Encounter is the anchor for clinical work.** An `Encounter` groups a patient visit (optionally linked to an `Appointment`) and owns `ClinicalNote`s and `Document`s. This models the real-world separation between scheduling and clinical documentation.

**ClinicalNoteVersion for immutable history.** Rather than soft-deleting or overwriting finalized notes, amendments snapshot the current state into `ClinicalNoteVersion` before updating the note. The full audit trail of what a note said at every finalization point is always available.

---

## Request Lifecycle

### Page Request (Server Component)

```
Browser → Next.js Edge
  └─ app/(dashboard)/org/[orgSlug]/layout.tsx
       ├─ requireSession()        reads carehub_session cookie → DB lookup
       ├─ resolveTenantContext()  verifies userId ∈ org membership
       └─ renders <Sidebar> + children
            └─ page.tsx
                 └─ direct db.* queries (organizationId already verified by layout)
```

The layout gate means every page under `/org/[orgSlug]/` has both session and tenant verified before any page component runs.

### API Request

```
Browser → POST /api/appointments?orgSlug=downtown-family-clinic
  └─ route.ts
       ├─ getApiContext(req, orgSlug)
       │    ├─ getSession()              cookie → DB lookup
       │    └─ resolveTenantContext()    membership check
       ├─ authorize(ctx, "appointments.create")   RBAC check
       ├─ schema.parse(body)             Zod validation
       ├─ assertTenantOwnership()        resource ownership check
       ├─ db.$transaction(...)           serializable write
       └─ createAuditLog(...)            append-only audit record
```

Every API route follows this exact sequence. Skipping any step would be a bug caught in code review.

---

## Module Responsibilities

| File | Responsibility |
|---|---|
| `src/lib/db.ts` | Prisma 7 client singleton using `PrismaPg` adapter |
| `src/lib/session.ts` | Create, read, destroy cookie-based DB sessions |
| `src/lib/tenancy.ts` | Resolve tenant context; `authorize()`; `assertTenantOwnership()` |
| `src/lib/permissions.ts` | Role → permission mapping; `hasPermission()` |
| `src/lib/audit.ts` | `createAuditLog()` — never crashes main request |
| `src/lib/api-context.ts` | Bundles session + tenant into a single `ApiContext` for API routes |
| `src/lib/errors.ts` | `apiError()` and `handleApiError()` — consistent JSON error responses |
| `src/lib/mrn.ts` | MRN (Medical Record Number) generation — format `MRN-YYYYMMDD-XXXX` |

---

## Prisma 7 Driver Adapter Pattern

Prisma 7 removed the `url` property from the datasource block in `schema.prisma`. Connections are established through a driver adapter at runtime:

```typescript
// src/lib/db.ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const client = new PrismaClient({ adapter });
```

The singleton pattern using `globalThis` prevents connection pool exhaustion in development (where Next.js hot-reloads modules repeatedly).

---

## Defense in Depth

No single mechanism is trusted alone:

1. **Session cookie** — httpOnly, SameSite=lax, Secure in production. Prevents XSS token theft and CSRF.
2. **`resolveTenantContext()`** — verifies org membership on every request. A valid session for org A cannot access org B.
3. **`authorize()`** — checks RBAC permission before any data operation.
4. **`assertTenantOwnership()`** — verifies a fetched resource's `organizationId` matches the tenant in context before returning it. Prevents IDOR even if a bug in a query omits the `organizationId` filter.
5. **Serializable transactions** — prevents race conditions in appointment booking.
6. **Zod input validation** — rejects malformed input at the boundary before it reaches the database.

Layers 3 and 4 are independent — a bug in one does not compromise the other.

## Data Models

Core models: Organization, User, Patient, Appointment, ClinicalNote.
