# API Reference

All API routes live under `/api/`. Tenant-scoped routes accept `?orgSlug=<slug>` as a query parameter (or it is embedded in the path for some routes). All responses are JSON. Authentication is via the `carehub_session` cookie.

Error responses follow:
```json
{ "error": "Human-readable message" }
```

---

## Authentication

### `POST /api/auth/register`

Create a new user and organization. The caller becomes the OWNER.

**Body:**
```json
{
  "email": "admin@example.com",
  "password": "Password123!",
  "firstName": "Jane",
  "lastName": "Smith",
  "organizationName": "Example Clinic",
  "organizationSlug": "example-clinic"
}
```

**Response `200`:**
```json
{
  "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "..." },
  "organization": { "id": "...", "name": "...", "slug": "..." }
}
```

**Errors:** `409` email or slug already taken.

---

### `POST /api/auth/login`

Authenticate and create a session.

**Body:**
```json
{ "email": "admin@example.com", "password": "Password123!" }
```

**Response `200`:**
```json
{
  "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "..." },
  "memberships": [
    { "organizationId": "...", "organizationName": "...", "organizationSlug": "...", "role": "OWNER" }
  ],
  "redirectTo": "/org/example-clinic"
}
```

`redirectTo` is `/select-org` for users with multiple memberships.

**Errors:** `401` invalid credentials. `403` no active memberships.

---

### `POST /api/auth/logout`

Destroy the current session.

**Response `200`:** `{ "ok": true }`

---

### `GET /api/auth/me`

Return the current session's user info.

**Response `200`:**
```json
{ "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "..." } }
```

**Errors:** `401` if not authenticated.

---

### `POST /api/auth/invite`

Send a staff invitation. Requires `staff.invite` permission.

**Body:**
```json
{ "email": "nurse@example.com", "role": "STAFF" }
```

**Response `201`:** `{ "invitation": { "id": "...", "email": "...", "role": "...", "expiresAt": "..." } }`

---

### `GET /api/auth/invite/[token]`

Fetch invitation details by token (used to pre-fill the accept-invite form).

**Response `200`:** `{ "invitation": { "email": "...", "role": "...", "organizationName": "..." } }`

**Errors:** `404` token not found. `410` token expired or already accepted.

---

### `POST /api/auth/invite/[token]/accept`

Accept an invitation. Creates a user account if needed.

**Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "password": "Password123!"
}
```

**Response `200`:** Session is created and cookie is set. Returns user and org info.

---

## Patients

All endpoints require `?orgSlug=<slug>`.

### `GET /api/patients`

List patients. Requires `patients.read`.

**Query params:** `?search=<name or MRN>`

**Response `200`:** `{ "patients": [...] }`

---

### `POST /api/patients`

Register a new patient. Requires `patients.create`.

**Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1985-03-15",
  "sex": "M",
  "phone": "555-1234",
  "email": "john@example.com",
  "address": "123 Main St",
  "city": "Springfield",
  "state": "IL",
  "zip": "62701"
}
```

**Response `201`:** Full patient object with auto-generated MRN.

---

### `GET /api/patients/[patientId]`

Fetch a patient by ID. Requires `patients.read`. Records `patient.viewed` in audit log.

**Response `200`:** Patient with contact and insurance info.

---

### `PATCH /api/patients/[patientId]`

Update patient demographics or contact info. Requires `patients.update`.

---

## Appointments

### `GET /api/appointments`

List appointments. Requires `appointments.read`.

**Query params:** `?date=YYYY-MM-DD`, `?providerId=`, `?patientId=`, `?status=`

**Response `200`:** `{ "appointments": [...] }` with patient, provider, and location info included.

---

### `POST /api/appointments`

Book an appointment. Requires `appointments.create`. Runs conflict check in a Serializable transaction.

**Body:**
```json
{
  "patientId": "...",
  "providerId": "...",
  "locationId": "...",
  "startTime": "2026-08-20T09:00:00.000Z",
  "endTime": "2026-08-20T09:30:00.000Z",
  "reason": "Annual check-up",
  "notes": ""
}
```

**Response `201`:** Appointment with patient, provider, and location.

**Errors:** `409` scheduling conflict. `422` end time before start time. `404` patient or provider not found. `403` resource belongs to another tenant.

---

### `GET /api/appointments/[appointmentId]`

Fetch a single appointment. Requires `appointments.read`.

---

### `PATCH /api/appointments/[appointmentId]`

Update appointment status or details. Requires `appointments.update`. Status transitions to `CANCELLED` require `appointments.cancel`.

---

## Encounters

### `GET /api/encounters`

List encounters. Requires `encounters.read`.

**Query params:** `?patientId=`

---

### `POST /api/encounters`

Create an encounter. Requires `encounters.create`.

**Body:**
```json
{
  "patientId": "...",
  "providerId": "...",
  "encounterDate": "2026-08-20T09:00:00.000Z",
  "appointmentId": "..."
}
```

---

### `GET /api/encounters/[encounterId]`

Fetch an encounter with its clinical notes.

---

### `GET /api/encounters/[encounterId]/notes`

List clinical notes for an encounter. Requires `clinical_notes.read`.

---

### `POST /api/encounters/[encounterId]/notes`

Create a new DRAFT clinical note. Requires `clinical_notes.create`.

**Body:** Any combination of `chiefComplaint`, `observations`, `assessment`, `plan`, `providerNotes`.

---

### `GET /api/encounters/[encounterId]/notes/[noteId]`

Fetch a clinical note with its version history. Records `clinical_note.viewed` in audit log.

---

### `PATCH /api/encounters/[encounterId]/notes/[noteId]`

Edit, finalize, or amend a clinical note. Behavior depends on the body:

**Edit DRAFT:**
```json
{ "chiefComplaint": "Headache", "plan": "Rest and fluids" }
```

**Finalize:**
```json
{ "action": "finalize" }
```

**Amend:**
```json
{
  "action": "amend",
  "amendReason": "Incorrect medication dosage recorded",
  "plan": "Corrected plan text"
}
```

**Errors:** `422` wrong state for the requested action. `403` insufficient role.

---

## Providers

### `GET /api/providers`

List active providers with availability. Requires `appointments.read`.

### `POST /api/providers`

Create a provider with optional availability windows. Requires `providers.manage`.

### `GET /api/providers/[providerId]/slots`

Get available booking slots for a provider on a specific date.

**Query params:** `?date=YYYY-MM-DD`

**Response `200`:**
```json
{
  "slots": [
    { "start": "2026-08-20T09:00:00.000Z", "end": "2026-08-20T09:30:00.000Z" },
    { "start": "2026-08-20T09:30:00.000Z", "end": "2026-08-20T10:00:00.000Z" }
  ]
}
```

---

## Staff

### `GET /api/staff`

List org members. Requires `staff.manage`.

### `PATCH /api/staff/[membershipId]`

Update a membership's role or active status. Requires `staff.manage`. Cannot modify the last OWNER.

---

## Audit Log

### `GET /api/audit`

Fetch audit log entries. Requires `audit_logs.read`.

**Query params:** `?resourceType=`, `?resourceId=`, `?actorUserId=`, `?from=`, `?to=`, `?limit=`, `?offset=`

**Response `200`:** `{ "logs": [...], "total": 42 }`

## Error Handling

All routes return structured `{ code, message }` errors.

## Error Handling

All routes return structured `{ code, message }` errors.
