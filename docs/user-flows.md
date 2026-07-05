# User Flows

End-to-end walkthroughs of every major use case in CareHub.

---

## 1. Practice Registration

**Actor:** New practice owner

1. Navigate to `/register`
2. Fill in name, email, password, clinic name, and a URL slug (e.g. `downtown-family-clinic`)
3. Submit → `POST /api/auth/register`
   - Server validates input with Zod
   - Checks email uniqueness and slug uniqueness
   - In a single transaction: creates `User`, creates `Organization`, creates `Membership` (role=OWNER)
   - Records `organization.created` in audit log
   - Creates session and sets cookie
4. Redirected to `/org/downtown-family-clinic`

The practice is ready to use immediately. The owner is the sole user and can invite staff, add providers, and register patients.

---

## 2. Login

**Actor:** Any registered user

1. Navigate to `/login`
2. Enter email and password
3. Submit → `POST /api/auth/login`
   - Constant-time bcrypt comparison (prevents timing-based user enumeration)
   - Creates session, sets `carehub_session` cookie
   - Looks up all active memberships for the user
4. If **1 membership** → redirect to `/org/<slug>`
5. If **2+ memberships** → redirect to `/select-org`, where the user picks which clinic to enter

---

## 3. Inviting a Staff Member

**Actor:** OWNER or ADMIN

1. Navigate to `/org/[slug]/settings/invite`
2. Enter the invitee's email and select their role (STAFF, PROVIDER, ADMIN, etc.)
3. Submit → `POST /api/auth/invite`
   - Creates `Invitation` record with a CUID token and 72-hour expiry
   - Records `user.invited` in audit log
   - (Production: sends an email with the invitation link)
4. Invitee receives link: `https://app.carehub.example/accept-invite/<token>`
5. Invitee visits the link → `/accept-invite/[token]`
   - `GET /api/auth/invite/[token]` pre-fills the org name and email
   - Invitee enters their name and password
6. Submit → `POST /api/auth/invite/[token]/accept`
   - Validates token is not expired and not already used
   - Creates `User` (or finds existing user by email)
   - Creates `Membership` with the invited role
   - Marks `invitation.acceptedAt = now()`
   - Creates session and sets cookie
7. Invitee lands on `/org/<slug>` with the appropriate role

---

## 4. Registering a Patient

**Actor:** STAFF or ADMIN

1. Navigate to `/org/[slug]/patients/new`
2. Fill in: name, date of birth, sex, contact info, emergency contact, insurance details
3. Submit → `POST /api/patients?orgSlug=...`
   - Auto-generates a MRN in the format `MRN-YYYYMMDD-XXXX`
   - Creates `Patient`, `PatientContact`, and `PatientInsurance` in a transaction
   - Records `patient.created` in audit log
4. Redirected to the patient's detail page `/org/[slug]/patients/[patientId]`

---

## 5. Scheduling an Appointment

**Actor:** STAFF or ADMIN

1. Navigate to `/org/[slug]/appointments/new`
2. Select patient (typeahead search by name or MRN)
3. Select provider from dropdown
4. Pick a date → `GET /api/providers/[providerId]/slots?date=YYYY-MM-DD` returns available slots based on the provider's availability minus existing bookings
5. Select a time slot
6. Optionally add a reason and notes
7. Submit → `POST /api/appointments?orgSlug=...`
   - Validates patient and provider belong to this org
   - Runs conflict check inside a Serializable transaction
   - If a conflict is detected (e.g., concurrent booking of the same slot) → returns `409 Conflict`
   - On success: creates `Appointment` with status `SCHEDULED`, records audit log
8. Redirected to the appointment detail page

---

## 6. Patient Check-In

**Actor:** STAFF

1. Navigate to `/org/[slug]/appointments` (today's view)
2. Find the appointment and open it
3. Click "Check In" → `PATCH /api/appointments/[id]?orgSlug=...` with `{ "status": "CHECKED_IN" }`
   - Sets `checkedInAt = now()`
   - Records `appointment.checked_in` in audit log
4. The provider can see checked-in patients in their queue

---

## 7. Clinical Encounter: Full Flow

**Actor:** PROVIDER

### Opening an Encounter

1. Provider opens an appointment from their schedule
2. Clicks "Start Encounter" → `POST /api/encounters?orgSlug=...`
   - Creates `Encounter` linked to the appointment and patient
   - Records `encounter.created` in audit log
3. Redirected to `/org/[slug]/encounters/[encounterId]` — the clinical editor

### Writing a Clinical Note

1. In the encounter editor, click "New Note"
2. `POST /api/encounters/[encounterId]/notes?orgSlug=...` — creates a DRAFT note
3. Provider types into the Chief Complaint, Observations, Assessment, and Plan fields
4. Auto-save (or explicit save) → `PATCH /api/encounters/.../notes/[noteId]` with content fields
5. Note remains in `DRAFT` state — can be edited freely

### Finalizing the Note

1. Provider reviews the note and clicks "Finalize"
2. `PATCH` with `{ "action": "finalize" }` → requires `clinical_notes.finalize` permission
3. Note transitions to `FINALIZED`:
   - `status = "FINALIZED"`
   - `finalizedAt = now()`
4. Edit button disappears; note is now read-only
5. Audit log records `clinical_note.finalized`

### Amending a Finalized Note

1. Provider notices an error in a finalized note and clicks "Amend"
2. A modal asks for the amendment reason (required)
3. Provider edits the relevant fields and submits
4. `PATCH` with `{ "action": "amend", "amendReason": "...", ...updatedFields }`
5. Server:
   - Snapshots current content to `ClinicalNoteVersion` (version N+1)
   - Updates the note with new content
   - Sets `status = "AMENDED"`
6. Note now shows "AMENDED" badge; version history is accessible
7. Audit log records `clinical_note.amended` with the amendment reason and version number

---

## 8. Adding a Provider

**Actor:** OWNER or ADMIN

1. Navigate to `/org/[slug]/providers/new`
2. Fill in: name, title (Dr./NP/PA), specialty, license number, NPI
3. Optionally assign to a location
4. Add availability windows: select days and time ranges, set slot duration (e.g. 30 min)
5. Submit → `POST /api/providers?orgSlug=...`
   - Creates `Provider` and `ProviderAvailability` rows in a transaction
6. Provider now appears in the scheduling flow

---

## 9. Viewing the Audit Log

**Actor:** OWNER or ADMIN

1. Navigate to `/org/[slug]/audit`
2. The page shows a paginated list of all audit actions for the organization
3. Can filter by resource type, actor, or date range
4. Each row shows: action, actor name, resource ID, timestamp, IP address
5. Useful for investigating "who accessed patient X's record last Tuesday"

---

## 10. Multi-Org User Flow

**Actor:** A provider who works at two clinics

1. Logs in → `POST /api/auth/login` returns 2 memberships
2. Redirected to `/select-org` — sees both orgs listed
3. Clicks on "Downtown Family Clinic" → navigated to `/org/downtown-family-clinic`
4. All data shown is scoped to Downtown Family Clinic
5. To switch orgs: navigate to `/select-org` (linked from the sidebar) and pick the other org
6. Each org tab is fully isolated — no data from one org appears in the other

---

## 11. Logout

**Actor:** Any user

1. Click "Logout" in the sidebar
2. `POST /api/auth/logout`
   - Deletes the `Session` row from the database
   - Clears the `carehub_session` cookie
   - Records `user.logout` in audit log
3. Redirected to `/login`
4. The old session token is now invalid — a replay attack with the old cookie returns `401`

## Role Guards

Components use `usePermission()` to conditionally render UI elements.

## Scheduling Dashboard

Calendar shows availability, bookings, and waitlist entries.

## Patient Portal

Patients view appointments, recent notes, and account info.
