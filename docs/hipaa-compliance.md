# HIPAA Compliance Notes

This document describes how CareHub's technical implementation addresses the HIPAA Security Rule requirements for electronic Protected Health Information (ePHI). These are engineering controls — a full HIPAA compliance program also requires administrative and physical safeguards outside the scope of this codebase.

---

## Access Controls (§164.312(a)(1))

**Requirement:** Implement technical policies and procedures to allow only authorized persons to access ePHI.

**How we meet it:**

- Every request to a tenant-scoped resource goes through `resolveTenantContext()`, which verifies the requesting user holds an active membership in that organization. A valid session for one clinic cannot access another clinic's data.
- `authorize(ctx, permission)` enforces role-based access at the operation level. A STAFF user cannot read clinical notes (`clinical_notes.read` is not in their permission set); a PATIENT role cannot access other patients' records.
- `assertTenantOwnership()` provides a second check: even if a query is written incorrectly and omits the `organizationId` filter, the ownership assertion catches cross-tenant resource access before the response is returned.
- Deactivating a membership (`isActive = false`) immediately revokes access on the next request — no cache to invalidate, no token to expire.

---

## Unique User Identification (§164.312(a)(2)(i))

**Requirement:** Assign a unique name and/or number for identifying and tracking user identity.

**How we meet it:**

- Every `User` record has a unique CUID primary key (`id`) and a unique email address.
- All `AuditLog` entries carry `actorUserId`, permanently linking every action to the individual who performed it.
- Sessions are per-user, per-device. A user with two browser sessions has two distinct `Session` rows, both traceable to the same `userId`.

---

## Automatic Logoff (§164.312(a)(2)(iii))

**Requirement:** Implement electronic procedures that terminate a session after a predetermined time of inactivity.

**How we meet it:**

- Sessions have a hard 7-day expiry (`expiresAt = now() + 7 days`). Any request after expiry is rejected and the session row is deleted.
- In production, this should be supplemented with a shorter inactivity timeout on the client side (e.g., auto-logout after 30 minutes of no user interaction) implemented via a client-side idle timer that calls `POST /api/auth/logout`.

---

## Encryption in Transit (§164.312(e)(2)(ii))

**Requirement:** Encrypt ePHI in transit when deemed appropriate.

**How we meet it:**

- The `SESSION_COOKIE` is set with `Secure: true` in production, ensuring it is only transmitted over HTTPS.
- All production traffic should be served over TLS (enforced at the load balancer or reverse proxy layer — nginx, Cloudflare, etc.).
- The `NEXT_PUBLIC_APP_URL` environment variable should always be an `https://` URL in production, which ensures invitation links and redirects use HTTPS.

---

## Encryption at Rest (§164.312(a)(2)(iv))

**Requirement:** Encrypt and decrypt ePHI at rest when deemed appropriate.

**How we meet it:**

- Passwords are hashed with bcrypt (cost factor 12) and never stored in plaintext. Even with full database access, passwords cannot be recovered.
- For full encryption at rest, the PostgreSQL data directory should be on an encrypted volume (e.g., AWS EBS with encryption enabled, or LUKS on self-hosted). This is a deployment/infrastructure concern, not an application concern.
- Document files (stored in object storage via MinIO/S3) should be stored in a bucket with server-side encryption (SSE-S3 or SSE-KMS) enabled.

---

## Audit Controls (§164.312(b))

**Requirement:** Implement hardware, software, and/or procedural mechanisms to record and examine activity in information systems that contain or use ePHI.

**How we meet it:**

- The `AuditLog` table is append-only. Every sensitive action is recorded with actor, timestamp, resource identifier, IP address, and a request correlation ID.
- Logged actions include: patient views, patient updates, clinical note creation/viewing/finalization/amendment, appointment creation/modification/cancellation, document access/upload/deletion, login, logout, and org changes.
- The audit log is never modified or deleted by application code — there are no `UPDATE` or `DELETE` operations anywhere in the codebase targeting `AuditLog`.
- OWNER and ADMIN roles can query the full audit trail via `GET /api/audit` and view it in the dashboard at `/org/[slug]/audit`.
- Amendment reasons are captured in both the `ClinicalNoteVersion` table and the audit log metadata, creating a clear paper trail for every change to finalized clinical records.

---

## Integrity Controls (§164.312(c)(1))

**Requirement:** Implement policies and procedures to protect ePHI from improper alteration or destruction.

**How we meet it:**

- Finalized clinical notes cannot be overwritten. The `FINALIZED` status blocks direct edits at the API level (returns 422). Corrections must go through the amendment flow, which preserves the original content in `ClinicalNoteVersion`.
- Every amendment creates an immutable snapshot before any change is applied, inside a database transaction. There is no path by which a finalized note can be changed without a version record being created.
- The `ClinicalNoteVersion` table has no delete mechanism in the application layer.
- Database-level integrity is enforced via foreign key constraints, unique constraints, and non-nullable `organizationId` columns throughout.

---

## Person or Entity Authentication (§164.312(d))

**Requirement:** Implement procedures to verify that a person or entity seeking access is the one claimed.

**How we meet it:**

- Authentication requires email + password. Passwords are verified with bcrypt's constant-time comparison.
- A constant-time dummy hash comparison runs even when the email is not found, preventing user enumeration attacks based on response timing.
- Sessions are validated against the database on every request — a forged, stolen, or expired token is rejected immediately.
- Session tokens are 256-bit random values (two UUID v4s concatenated), making brute-force or prediction attacks infeasible.

---

## Transmission Security (§164.312(e)(1))

**Requirement:** Implement technical security measures to guard against unauthorized access to ePHI transmitted over a network.

**How we meet it:**

- `httpOnly` cookies prevent JavaScript from reading the session token, mitigating XSS-based session theft.
- `SameSite=lax` prevents the session cookie from being sent on cross-site POST requests, mitigating CSRF attacks.
- API routes validate input with Zod schemas at the boundary, rejecting malformed or unexpected data before it reaches the database.
- SQL injection is not possible — all database access goes through Prisma's parameterized query builder. Raw SQL is not used anywhere in the codebase.

---

## Minimum Necessary Access (§164.514(d))

**Requirement:** Make reasonable efforts to limit ePHI access to the minimum necessary to accomplish the intended purpose.

**How we meet it:**

- The RBAC permission system enforces least privilege by role. STAFF cannot access clinical notes. PATIENT role cannot access other patients' records.
- `select` projections in Prisma queries return only the fields needed for each operation (e.g., patient list queries return names and MRNs, not insurance policy numbers).
- The audit log stores only resource identifiers and non-sensitive metadata — clinical content (chief complaint, assessment, plan) is never written to audit records.

---

## What This Implementation Does Not Cover

The following require additional work before claiming full HIPAA compliance:

- **Business Associate Agreements (BAAs):** Any third-party vendor (cloud hosting, email provider, object storage, logging service) that handles ePHI must have a signed BAA.
- **Breach notification procedures:** Administrative policy for identifying and reporting breaches within the 60-day HIPAA window.
- **Risk analysis and management:** A documented risk assessment of all ePHI flows, as required by §164.308(a)(1).
- **Workforce training:** HIPAA training records for all staff with access to the system.
- **Physical safeguards:** Controls over the physical servers or cloud console access.
- **Client-side inactivity timeout:** A JavaScript idle timer to complement the server-side session expiry.
- **MFA:** Multi-factor authentication is not implemented. For a production healthcare system, MFA is strongly recommended and may be required by cyber insurance providers.
- **Penetration testing:** Independent security assessment of the running application.

## Row-Level Security

PostgreSQL RLS added as secondary isolation layer behind app-layer.
