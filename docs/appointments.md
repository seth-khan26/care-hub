# Appointment Scheduling and Conflict Prevention

## The Problem

Appointment booking is a classic read-modify-write race condition:

1. Thread A checks for conflicts — none found
2. Thread B checks for conflicts — none found  
3. Thread A inserts the appointment
4. Thread B inserts the appointment
5. **Both succeed. The provider is now double-booked.**

Standard `READ COMMITTED` isolation (PostgreSQL's default) does not prevent this. Two concurrent transactions both read the same "no conflicts" state before either writes.

---

## The Solution: Serializable Isolation

Every appointment creation runs in a `Serializable` transaction:

```typescript
const appointment = await db.$transaction(
  async (tx) => {
    // 1. Check for overlap
    const conflict = await tx.appointment.findFirst({
      where: {
        organizationId: ctx.tenant.organizationId,
        providerId: data.providerId,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } },
        ],
      },
    });

    if (conflict) {
      throw new Error("CONFLICT: Provider has an overlapping appointment");
    }

    return tx.appointment.create({ data: { ... } });
  },
  { isolationLevel: "Serializable" }
);
```

With `Serializable` isolation, PostgreSQL guarantees that the final result is equivalent to running all transactions one at a time in some serial order. If two concurrent transactions both pass the overlap check, PostgreSQL detects the serialization anomaly and aborts one of them with a `40001` error (serialization failure). The application can retry the aborted transaction.

This moves the correctness guarantee to the database layer — no application-level locking, no advisory locks, no queue needed.

---

## Overlap Logic

Two time intervals `[startA, endA)` and `[startB, endB)` overlap if and only if:

```
startA < endB AND endA > startB
```

In Prisma:
```typescript
AND: [
  { startTime: { lt: end } },   // this appointment starts before the new one ends
  { endTime: { gt: start } },   // this appointment ends after the new one starts
]
```

This correctly handles all overlap cases: full containment, partial overlap from either side, and exact boundary matching (adjacent appointments with the same start/end time do not overlap).

---

## Status Filtering

Cancelled and no-show appointments are excluded from conflict detection:

```typescript
status: { notIn: ["CANCELLED", "NO_SHOW"] }
```

A cancelled slot is available for rebooking. An active slot with status `SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, or `COMPLETED` blocks the time.

---

## Appointment Statuses

```
SCHEDULED → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED
                                                  ↗
SCHEDULED → CANCELLED
SCHEDULED → NO_SHOW
```

| Status | Description |
|---|---|
| `SCHEDULED` | Initial state when booked |
| `CONFIRMED` | Patient has confirmed attendance |
| `CHECKED_IN` | Patient arrived and is in the waiting room; `checkedInAt` is set |
| `IN_PROGRESS` | Patient is with the provider |
| `COMPLETED` | Visit is complete; an `Encounter` should now exist |
| `CANCELLED` | Appointment was cancelled; slot is free for rebooking |
| `NO_SHOW` | Patient did not attend; slot is free for rebooking |

---

## Provider Availability

Providers have availability windows defined in `ProviderAvailability`:

```
Provider ──< ProviderAvailability
              ├── dayOfWeek (0=Sun … 6=Sat)
              ├── startTime ("09:00")
              ├── endTime   ("17:00")
              └── slotDuration (minutes, default 30)
```

The `GET /api/providers/[providerId]/slots` endpoint computes available booking slots for a given date:

1. Find the availability record matching the day of week
2. Generate all slots between `startTime` and `endTime` with `slotDuration` spacing
3. Query existing appointments for that provider on that date
4. Remove slots that overlap with existing appointments
5. Return the remaining slots

This is a pure read operation — no locking required. The serializable write transaction handles concurrent booking of the same slot.

---

## Error Handling

If the overlap check fails, the transaction throws:

```typescript
throw new Error("CONFLICT: Provider has an overlapping appointment");
```

The route handler catches this specifically:

```typescript
} catch (err) {
  if (err instanceof Error && err.message.startsWith("CONFLICT:")) {
    return apiError("Provider has a scheduling conflict at this time", 409);
  }
  return handleApiError(err);
}
```

The client receives a `409 Conflict` with a human-readable message. If PostgreSQL aborted the transaction due to a serialization failure, `handleApiError` catches the Prisma error and returns a `500`, which the client should treat as a retry signal.

---

## Index Strategy

The conflict query runs efficiently due to the composite index:

```prisma
@@index([organizationId, providerId, startTime])
```

This index allows PostgreSQL to quickly narrow the conflict scan to a single provider's upcoming appointments.

## Appointment Model

Fields: provider, patient, slot, type, duration, status.

## Conflict Prevention

SERIALIZABLE isolation prevents race-condition double-booking.

## Availability

Providers configure weekly templates with blocked slots and overrides.

## Status States

SCHEDULED→CONFIRMED→IN_PROGRESS→COMPLETED | CANCELLED | NO_SHOW
