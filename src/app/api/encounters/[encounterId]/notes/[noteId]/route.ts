import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize, assertTenantOwnership } from "@/lib/tenancy";
import { handleApiError, apiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";

const updateSchema = z.object({
  chiefComplaint: z.string().max(2000).optional(),
  observations: z.string().max(5000).optional(),
  assessment: z.string().max(5000).optional(),
  plan: z.string().max(5000).optional(),
  providerNotes: z.string().max(5000).optional(),
});

const finalizeSchema = z.object({
  action: z.literal("finalize"),
});

const amendSchema = z.object({
  action: z.literal("amend"),
  amendReason: z.string().min(1).max(500),
  chiefComplaint: z.string().max(2000).optional(),
  observations: z.string().max(5000).optional(),
  assessment: z.string().max(5000).optional(),
  plan: z.string().max(5000).optional(),
  providerNotes: z.string().max(5000).optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  finalizeSchema,
  amendSchema,
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ encounterId: string; noteId: string }> }
) {
  try {
    const { encounterId, noteId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "clinical_notes.read");

    const note = await db.clinicalNote.findUnique({
      where: { id: noteId },
      include: {
        versions: { orderBy: { versionNumber: "asc" } },
        encounter: { select: { id: true, organizationId: true } },
      },
    });

    if (!note || note.encounterId !== encounterId) {
      return apiError("Clinical note not found", 404);
    }
    assertTenantOwnership(ctx, note.organizationId);

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "clinical_note.viewed",
      resourceType: "ClinicalNote",
      resourceId: note.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });

    return NextResponse.json(note);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ encounterId: string; noteId: string }> }
) {
  try {
    const { encounterId, noteId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    const existing = await db.clinicalNote.findUnique({
      where: { id: noteId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        encounterId: true,
        chiefComplaint: true,
        observations: true,
        assessment: true,
        plan: true,
        providerNotes: true,
      },
    });

    if (!existing || existing.encounterId !== encounterId) {
      return apiError("Clinical note not found", 404);
    }
    assertTenantOwnership(ctx, existing.organizationId);

    const body = await req.json();

    // Handle action-based operations (finalize, amend)
    if (body.action) {
      const action = actionSchema.parse(body);

      if (action.action === "finalize") {
        authorize(ctx, "clinical_notes.finalize");

        if (existing.status !== "DRAFT") {
          return apiError("Only DRAFT notes can be finalized", 422);
        }

        const note = await db.clinicalNote.update({
          where: { id: noteId },
          data: { status: "FINALIZED", finalizedAt: new Date() },
        });

        await createAuditLog({
          organizationId: ctx.tenant.organizationId,
          actorUserId: ctx.session.user.id,
          action: "clinical_note.finalized",
          resourceType: "ClinicalNote",
          resourceId: note.id,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
        });

        return NextResponse.json(note);
      }

      if (action.action === "amend") {
        authorize(ctx, "clinical_notes.finalize");

        if (existing.status !== "FINALIZED") {
          return apiError("Only FINALIZED notes can be amended", 422);
        }

        // Create version snapshot of current finalized note, then update
        const versionCount = await db.clinicalNoteVersion.count({
          where: { clinicalNoteId: noteId },
        });

        const note = await db.$transaction(async (tx) => {
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

          return tx.clinicalNote.update({
            where: { id: noteId },
            data: {
              status: "AMENDED",
              chiefComplaint: action.chiefComplaint ?? existing.chiefComplaint,
              observations: action.observations ?? existing.observations,
              assessment: action.assessment ?? existing.assessment,
              plan: action.plan ?? existing.plan,
              providerNotes: action.providerNotes ?? existing.providerNotes,
            },
          });
        });

        await createAuditLog({
          organizationId: ctx.tenant.organizationId,
          actorUserId: ctx.session.user.id,
          action: "clinical_note.amended",
          resourceType: "ClinicalNote",
          resourceId: note.id,
          requestId: ctx.requestId,
          ipAddress: ctx.ipAddress,
          metadata: { amendReason: action.amendReason, version: versionCount + 1 },
        });

        return NextResponse.json(note);
      }
    }

    // Regular update — only allowed on DRAFT notes
    authorize(ctx, "clinical_notes.update");

    if (existing.status !== "DRAFT") {
      return apiError("Only DRAFT notes can be edited directly", 422);
    }

    const data = updateSchema.parse(body);

    const note = await db.clinicalNote.update({
      where: { id: noteId },
      data,
    });

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "clinical_note.updated",
      resourceType: "ClinicalNote",
      resourceId: note.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });

    return NextResponse.json(note);
  } catch (err) {
    return handleApiError(err);
  }
}
