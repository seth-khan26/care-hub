import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize, assertTenantOwnership } from "@/lib/tenancy";
import { handleApiError, apiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";

const createSchema = z.object({
  chiefComplaint: z.string().max(2000).optional(),
  observations: z.string().max(5000).optional(),
  assessment: z.string().max(5000).optional(),
  plan: z.string().max(5000).optional(),
  providerNotes: z.string().max(5000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ encounterId: string }> }
) {
  try {
    const { encounterId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "clinical_notes.create");

    const encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true, organizationId: true },
    });
    if (!encounter) return apiError("Encounter not found", 404);
    assertTenantOwnership(ctx, encounter.organizationId);

    const body = await req.json();
    const data = createSchema.parse(body);

    const note = await db.clinicalNote.create({
      data: {
        organizationId: ctx.tenant.organizationId,
        encounterId,
        status: "DRAFT",
        chiefComplaint: data.chiefComplaint,
        observations: data.observations,
        assessment: data.assessment,
        plan: data.plan,
        providerNotes: data.providerNotes,
      },
    });

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "clinical_note.created",
      resourceType: "ClinicalNote",
      resourceId: note.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });

    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
