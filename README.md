# CareHub — Multi-Tenant Healthcare Practice Management

A production-grade, multi-tenant healthcare practice management platform built with Next.js 16, TypeScript, Prisma 7, and PostgreSQL. Designed to demonstrate senior-level engineering through strong tenant isolation, role-based access control, clinical note lifecycle management, and serializable-transaction appointment conflict prevention.

---

## Table of Contents

- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Demo Credentials](#demo-credentials)
- [Project Structure](#project-structure)
- [Documentation](#documentation)

---

## Key Features

### Multi-Tenancy
- Every tenant-owned table carries `organizationId`
- Tenant context resolved server-side on **every** request via `resolveTenantContext()` — never trust client-supplied org IDs
- Cross-tenant data access is structurally impossible; org membership is always verified before any data operation
- Defense-in-depth: application-layer filtering backed by PostgreSQL RLS

### Role-Based Access Control (RBAC)
- Five roles: `OWNER`, `ADMIN`, `PROVIDER`, `STAFF`, `PATIENT`
- Centralized `authorize(ctx, permission)` — no scattered `if role === "ADMIN"` checks anywhere in the codebase
- 21 fine-grained permissions covering patients, clinical notes, appointments, documents, staff management, and org settings
- Permission map lives in a single file (`src/lib/permissions.ts`); adding a role or permission is a one-line change

### Clinical Note Lifecycle
- Three states: `DRAFT` → `FINALIZED` → `AMENDED`
- Finalized notes are **never overwritten** — amendments create a version snapshot (`ClinicalNoteVersion`) before updating
- Every state transition is recorded in the audit log with actor, timestamp, and amendment reason
- Only users with `clinical_notes.finalize` permission (OWNER, ADMIN, PROVIDER) can advance state

### Appointment Conflict Prevention
- Overlap detection runs inside a **Serializable** PostgreSQL transaction — two concurrent requests cannot both pass the overlap check and both succeed
- The frontend slot picker is a UX convenience only; the backend enforces correctness unconditionally

### Session Management
- Database-backed sessions with 64-character random tokens (two UUID v4s concatenated)
- `httpOnly`, `SameSite=lax` cookies; `Secure` flag enabled in production
- 7-day session lifetime; expired sessions are pruned lazily on first access
- `requireSession()` redirects to `/login` rather than throwing, keeping server components clean

### Audit Logging
- Append-only `AuditLog` table records every sensitive action (patient views, note state changes, logins, org changes, etc.)
- Never logs clinical content, passwords, or session tokens — only resource IDs and non-sensitive metadata
- Audit writes never crash the main request (errors are caught and logged to stderr internally)
- OWNER/ADMIN roles can view the full audit trail in the dashboard

### Staff Invitation Flow
- Owners and admins invite staff by email with a role assignment
- Invitation tokens are single-use, time-limited CUIDs
- Accepting an invitation atomically creates a user account (or links an existing one) and a membership record

### Patient Records
- Auto-generated Medical Record Numbers (MRNs) — unique per organization, collision-safe
- Rich demographic profiles: contact info, alternate phone, address, and emergency contact (name, phone, relationship)
- Insurance tracking: insurer name, policy/group number, subscriber name, and relationship
- Full-text search on patient name across the organization

### Provider Management
- Provider profiles with specialty, NPI, license number, title, and location assignment
- Weekly availability schedules: per-provider day-of-week windows with configurable slot durations (default 30 min)
- Real-time slot picker — available time slots are computed server-side from availability + existing appointments; the backend enforces this regardless of what the UI sends

### Appointment Status Lifecycle
- Seven statuses: `SCHEDULED` → `CONFIRMED` → `CHECKED_IN` → `IN_PROGRESS` → `COMPLETED` / `CANCELLED` / `NO_SHOW`
- Check-in timestamps recorded at the moment of status transition
- Status updates are RBAC-gated (e.g., only PROVIDER/STAFF/ADMIN can mark IN_PROGRESS)

### Document Management
- Patient-scoped document uploads stored in S3-compatible object storage (MinIO)
- Six document categories: `LAB_RESULT`, `IMAGING`, `REFERRAL`, `CONSENT`, `INSURANCE`, `OTHER`
- Soft-delete only — storage keys are never exposed directly to clients; downloads go through a signed-URL proxy
- Documents scoped to the organization and optionally linked to a specific patient

### Multi-Location Support
- Organizations can define multiple physical clinic locations (name, address, phone)
- Providers are assigned to a home location; appointments inherit or override the provider's location
- Location is recorded on the appointment for reporting and scheduling purposes

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React Server Components) |
| Language | TypeScript (strict mode) |
| ORM | Prisma 7 with `@prisma/adapter-pg` driver adapter |
| Database | PostgreSQL 14+ |
| Styling | Tailwind CSS |
| Forms | React Hook Form + Zod v4 |
| Auth | Custom cookie-based sessions (no NextAuth) |
| Password hashing | bcryptjs (cost factor 12) |
| Object storage | MinIO (S3-compatible) — optional for documents |

---

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** 14+ (running locally or via Docker)
- **npm** 9+

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the database

Create a PostgreSQL database and user:

```bash
# Connect as a superuser
psql postgres

CREATE USER carehub WITH PASSWORD 'carehub';
CREATE DATABASE carehub OWNER carehub;
GRANT ALL PRIVILEGES ON DATABASE carehub TO carehub;
\q
```

### 3. Set up environment variables

Copy `.env.example` to `.env` and fill in your values (see [Environment Variables](#environment-variables)).

### 4. Push the schema and generate the Prisma client

```bash
npx prisma generate
npx prisma db push
```

### 5. Seed demo data

```bash
npm run db:seed
```

This creates two organizations, demo users, a provider with availability, and a sample patient.

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

```env
# PostgreSQL connection string
DATABASE_URL="postgresql://carehub:carehub@localhost:5432/carehub?schema=public"

# Secret used to sign session data — must be at least 32 characters
SESSION_SECRET="change-this-to-a-random-32-char-minimum-secret"

# Public URL (used for invite links and redirects)
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Object storage (MinIO or S3) — optional; required only for document upload
STORAGE_ENDPOINT="http://localhost:9000"
STORAGE_ACCESS_KEY="minioadmin"
STORAGE_SECRET_KEY="minioadmin"
STORAGE_BUCKET="carehub"
```

---

## Demo Credentials

| Email | Password | Role | Organization |
|---|---|---|---|
| `admin@downtown.example` | `Password123!` | OWNER | Downtown Family Clinic |
| `staff@downtown.example` | `Password123!` | STAFF | Downtown Family Clinic |
| `admin@northside.example` | `Password123!` | OWNER | Northside Medical |

After login, users with a single membership go directly to `/org/<slug>`. Users belonging to multiple organizations are redirected to `/select-org`.

---

## Project Structure

```
care-hub-app/
├── prisma/
│   ├── schema.prisma        # Full database schema
│   └── seed.ts              # Demo data seeder
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login, register, accept-invite pages
│   │   ├── (dashboard)/     # Authenticated dashboard pages
│   │   │   └── org/[orgSlug]/
│   │   │       ├── layout.tsx        # Tenant resolution + sidebar
│   │   │       ├── page.tsx          # Dashboard home
│   │   │       ├── patients/         # Patient list, detail, new
│   │   │       ├── appointments/     # Calendar, detail, new
│   │   │       ├── encounters/       # Encounter list, clinical editor
│   │   │       ├── providers/        # Provider management
│   │   │       ├── settings/         # Org settings, staff invitations
│   │   │       └── audit/            # Audit log viewer
│   │   └── api/
│   │       ├── auth/                 # register, login, logout, me, invite
│   │       ├── patients/             # CRUD + search
│   │       ├── appointments/         # Schedule + status updates
│   │       ├── encounters/           # Encounter management
│   │       │   └── [encounterId]/notes/  # Clinical note lifecycle
│   │       ├── providers/            # Provider + availability
│   │       ├── staff/                # Staff listing + role management
│   │       └── audit/                # Audit log API
│   ├── components/
│   │   ├── layout/          # Sidebar, page-header
│   │   └── ui/              # Button, Card, Input, Select, Badge, Textarea
│   └── lib/
│       ├── db.ts            # Prisma 7 client (driver-adapter pattern)
│       ├── session.ts       # Cookie-based session management
│       ├── tenancy.ts       # Tenant resolution + authorize()
│       ├── permissions.ts   # RBAC role→permission map
│       ├── audit.ts         # Audit log writer
│       ├── api-context.ts   # Request auth + tenant bundler
│       ├── errors.ts        # API error helpers
│       ├── mrn.ts           # Medical record number generator
│       └── utils.ts         # Shared utilities
└── docs/
    ├── architecture.md      # System design and data model
    ├── multi-tenancy.md     # Tenant isolation deep-dive
    ├── rbac.md              # RBAC and permissions reference
    ├── auth.md              # Session and authentication
    ├── clinical-notes.md    # Clinical note lifecycle
    ├── appointments.md      # Conflict prevention and scheduling
    ├── audit-log.md         # Audit logging design
    ├── api-reference.md     # Full REST API reference
    └── user-flows.md        # End-to-end user flows
```

---

## Documentation

Detailed technical documentation lives in [`/docs`](./docs/):

| Document | Contents |
|---|---|
| [Architecture](./docs/architecture.md) | System design, data model, request lifecycle |
| [Multi-Tenancy](./docs/multi-tenancy.md) | Tenant isolation, cross-tenant attack prevention |
| [RBAC](./docs/rbac.md) | Roles, permissions matrix, how to extend |
| [Authentication](./docs/auth.md) | Session design, cookie security, invite flow |
| [Clinical Notes](./docs/clinical-notes.md) | DRAFT/FINALIZED/AMENDED lifecycle, version snapshots |
| [Appointments](./docs/appointments.md) | Serializable transactions, conflict detection |
| [Audit Log](./docs/audit-log.md) | What gets logged, what never does, viewing logs |
| [API Reference](./docs/api-reference.md) | Every endpoint, method, request/response shape |
| [User Flows](./docs/user-flows.md) | Step-by-step flows for every major use case |
| [HIPAA Compliance](./docs/hipaa-compliance.md) | How each Security Rule requirement is addressed |
