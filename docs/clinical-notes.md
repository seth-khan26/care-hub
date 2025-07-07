# Clinical Note Lifecycle

## States

Clinical notes follow a strict one-way state machine:

```
DRAFT ──► FINALIZED ──► AMENDED
```

- **DRAFT**: The note is being written. Fields can be edited freely via `PATCH` with content fields.
- **FINALIZED**: The note has been signed off. No direct edits are possible. `finalizedAt` is set.
- **AMENDED**: The note was corrected after finalization. A `ClinicalNoteVersion` snapshot of the finalized content was created before the update, preserving the complete audit trail.

There is no "deleted" state. Clinical notes are never deleted — only amended or left as-is.

---

## API Design

The note lifecycle is driven by a single `PATCH /api/encounters/[encounterId]/notes/[noteId]` endpoint using a discriminated union body:

```typescript
// Regular edit (DRAFT only)
PATCH { chiefComplaint: "...", observations: "..." }

// Finalize (DRAFT → FINALIZED)
PATCH { action: "finalize" }

// Amend (FINALIZED → AMENDED)
PATCH { action: "amend", amendReason: "...", plan: "corrected plan text" }
```

The `action` field is the discriminator. Its presence routes the request to the lifecycle handler; its absence routes to the plain edit handler. Zod's `discriminatedUnion` ensures each action shape is validated independently.

---

## Finalization

```typescript
if (action.action === "finalize") {
  authorize(ctx, "clinical_notes.finalize");  // STAFF cannot finalize

  if (existing.status !== "DRAFT") {
    return apiError("Only DRAFT notes can be finalized", 422);
  }

  const note = await db.clinicalNote.update({
    where: { id: noteId },
    data: { status: "FINALIZED", finalizedAt: new Date() },
  });

  await createAuditLog({ action: "clinical_note.finalized", ... });
}
```

Only roles with `clinical_notes.finalize` (OWNER, ADMIN, PROVIDER) can finalize. The status check prevents double-finalization.

---

## Amendment

The amendment path is the most sensitive:

```typescript
if (action.action === "amend") {
  authorize(ctx, "clinical_notes.finalize");

  if (existing.status !== "FINALIZED") {
    return apiError("Only FINALIZED notes can be amended", 422);
  }

  const versionCount = await db.clinicalNoteVersion.count({
    where: { clinicalNoteId: noteId },
  });

  const note = await db.$transaction(async (tx) => {
    // 1. Snapshot the current finalized content
    await tx.clinicalNoteVersion.create({
      data: {
        clinicalNoteId: noteId,
        organizationId: ctx.tenant.organizationId,
        versionNumber: versionCount + 1,
        chiefComplaint: existing.chiefComplaint,
        observations: existing.observations,
        assessment: existing.assessment,
        plan: existing.plan,
        providerNotes: existing.providerNotes,
        amendReason: action.amendReason,
        createdById: ctx.session.user.id,
      },
    });

    // 2. Update the live note with new content
    return tx.clinicalNote.update({
      where: { id: noteId },
      data: {
        status: "AMENDED",
        chiefComplaint: action.chiefComplaint ?? existing.chiefComplaint,
        // ... merge new values with existing, defaulting to existing when not provided
      },
    });
  });
}
```

The snapshot and update run in a single transaction. If either fails, neither commits. The `amendReason` is required and stored both in the `ClinicalNoteVersion` row and in the audit log metadata.

---

## Version History

`ClinicalNoteVersion` stores:

| Field | Purpose |
|---|---|
| `versionNumber` | Sequential counter per note (1, 2, 3…) |
| `chiefComplaint` / `observations` / `assessment` / `plan` / `providerNotes` | Full copy of the note content at finalization time |
| `amendReason` | Required explanation of why the amendment was made |
| `createdById` | The user who triggered the amendment |
| `createdAt` | When the version was snapshotted |

To reconstruct the complete history of a note:
1. Read the current `ClinicalNote` (the most recent state)
2. Read all `ClinicalNoteVersion` rows ordered by `versionNumber` (each represents a previous finalized state)

---

## Who Can Do What

| Action | OWNER | ADMIN | PROVIDER | STAFF |
|---|:---:|:---:|:---:|:---:|
| Create (DRAFT) | ✓ | ✓ | ✓ | |
| Edit (DRAFT) | ✓ | ✓ | ✓ | |
| Finalize (DRAFT → FINALIZED) | ✓ | ✓ | ✓ | |
| Amend (FINALIZED → AMENDED) | ✓ | ✓ | ✓ | |
| Read | ✓ | ✓ | ✓ | |

STAFF (front-desk) have no clinical note access at all. They can create and manage appointments and patient demographics, but cannot view or touch clinical documentation.

---

## Invariants the Code Enforces

1. A FINALIZED note cannot be directly edited (`PATCH` without `action` returns 422 if status ≠ DRAFT)
2. An AMENDED note cannot be re-amended directly — the UI must create a new amendment against the current AMENDED state (same code path; FINALIZED check would need to be relaxed to allow this — a known extension point)
3. Every amendment requires a non-empty `amendReason`
4. The `finalizedAt` timestamp is set exactly once, at finalization; it is never updated on amendment
5. `ClinicalNoteVersion` rows are written in the same transaction as the note update — no orphaned snapshots, no missing snapshots

## Note States

DRAFT → IN_REVIEW → SIGNED → AMENDED → LOCKED

## Drafts

Drafts auto-save every 30 seconds. Resumable from dashboard.
