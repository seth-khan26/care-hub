# Authentication and Sessions

## Overview

CareHub uses custom database-backed sessions with HTTP-only cookies. There is no JWT, no NextAuth, and no third-party auth provider. This keeps the session lifecycle fully under application control: sessions can be listed, inspected, and invalidated at any time.

---

## Session Token Design

A session token is two UUID v4s concatenated, producing a 72-character random hex string:

```typescript
const token = uuidv4() + uuidv4(); // e.g. "550e8400-e29b-41d4-a716-446655440000f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

Using two UUIDs rather than one:
- Doubles the entropy (256 bits vs. 128 bits)
- Makes token collision or brute-force attack computationally infeasible even at scale

The token is stored as a unique column in the `Session` table and set as the cookie value.

---

## Cookie Security

```typescript
cookieStore.set(SESSION_COOKIE, token, {
  httpOnly: true,        // Not accessible to JavaScript — prevents XSS theft
  secure: process.env.NODE_ENV === "production",  // HTTPS-only in production
  sameSite: "lax",       // Sent on top-level navigations, not cross-site subrequests — CSRF protection
  maxAge: SESSION_DURATION_MS / 1000,  // 7 days
  path: "/",
});
```

Cookie name: `carehub_session`.

`SameSite=lax` prevents the cookie from being sent on cross-origin POST requests (the most common CSRF vector) while still allowing navigation links from external sites to work.

---

## Session Lifecycle

### Creation

On successful login or registration, `createSession(userId, meta)` is called:

1. Generates a 72-char random token
2. Inserts a `Session` row with `expiresAt = now() + 7 days` and optional IP/user-agent metadata
3. Returns the token
4. `setSessionCookie(token)` writes it to the response cookies

### Validation

`getSession()` is called on every authenticated request:

1. Reads the `carehub_session` cookie
2. Does a `db.session.findUnique({ where: { token } })` — indexed lookup
3. If found and not expired → returns `ActiveSession`
4. If expired → deletes the row lazily and returns `null`
5. If no cookie or no row → returns `null`

Sessions are validated against the database on every request. There is no in-memory cache for sessions. This means:
- Revoking a session (e.g., force-logout of a compromised account) takes effect immediately on the next request
- A server restart does not log anyone out
- Multiple browser tabs / devices all have independent sessions

### Expiry

Sessions expire after 7 days from creation. Expired sessions are deleted lazily when the next request from that session is attempted. There is no background job that purges sessions — in production, a scheduled task or a cron job should periodically clean `WHERE expiresAt < NOW()` to prevent unbounded table growth.

### Destruction

On logout (`/api/auth/logout`):
1. Reads the current session cookie
2. Calls `destroySession(token)` — deletes the `Session` row
3. Calls `clearSessionCookie()` — removes the cookie from the response
4. Records `user.logout` in the audit log

---

## Password Security

Passwords are hashed with `bcryptjs` at cost factor 12:

```typescript
const passwordHash = await bcrypt.hash(data.password, 12);
```

Cost factor 12 means ~250ms per hash on a modern CPU — slow enough to make brute-force attacks expensive, fast enough not to noticeably impact login UX.

### User Enumeration Prevention

The login route uses a constant-time comparison regardless of whether the user exists:

```typescript
const dummyHash = "$2a$12$dummy.hash.for.timing.safety.padding.here.12345";
const valid = user
  ? await bcrypt.compare(data.password, user.passwordHash)
  : await bcrypt.compare(data.password, dummyHash).then(() => false);
```

When the user is not found, bcrypt still runs a comparison (against a dummy hash) so the response time is the same whether the email exists or not. An attacker cannot distinguish "email not found" from "wrong password" by timing the response.

The response message is also identical in both cases: "Invalid email or password".

---

## Staff Invitation Flow

Owners and admins can invite staff by email via `POST /api/auth/invite`:

1. **Create invitation**: An `Invitation` row is created with a CUID token, the target email, role, and an expiry (`now() + 72h` by default)
2. **Email delivery**: The system would send an email containing `NEXT_PUBLIC_APP_URL/accept-invite/<token>` (email sending is a production integration point)
3. **Accept invitation**: The invited user visits `/accept-invite/<token>`
   - If not logged in → shown a registration form to create an account
   - If logged in with a different email → shown an error
   - On submit → `POST /api/auth/invite/<token>/accept`
4. **Atomic acceptance**: The accept handler runs a transaction that:
   - Validates the token is not expired and not already accepted
   - Creates the `User` if they don't have an account, or finds them by email
   - Creates a `Membership` with the invited role
   - Sets `invitation.acceptedAt = now()`
5. **Session creation**: After acceptance, the user is logged in automatically

Invitation tokens are single-use: `acceptedAt` is set on first use and the handler rejects subsequent uses.

---

## `requireSession()` in Server Components

```typescript
export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return session as ActiveSession;
}
```

`redirect()` in Next.js throws a special error that the framework catches and turns into a 307 response. It never returns, so the `return session as ActiveSession` cast is always reached with a valid session — the `as` cast is a TypeScript hint, not a runtime coercion.

This pattern keeps page components clean — they call `requireSession()` and destructure the result without needing null checks.

## Authentication

NextAuth.js credentials provider, bcrypt hashing, JWT sessions.

### JWT Sessions

Tokens rotate on every request. Refresh tokens stored httpOnly.

### Password Hashing

bcrypt cost 12. Plaintext passwords never stored.

### Session Management

Logout invalidates session server-side. Idle timeout 30 min.

### Protected Routes

`requireAuth()` guards all patient and provider endpoints.
