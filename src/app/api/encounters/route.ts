import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize, assertTenantOwnership } from "@/lib/tenancy";
import { handleApiError, apiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";

const createSchema = z.object({
  appointmentId: z.string().min(1).optional(),
  patientId: z.string().min(1),
  providerId: z.string().min(1),
  encounterDate: z.string().datetime(),
});

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "encounters.read");

    const patientId = req.nextUrl.searchParams.get("patientId");

    const encounters = await db.encounter.findMany({
      where: {
        organizationId: ctx.tenant.organizationId,
        ...(patientId ? { patientId } : {}),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        provider: { select: { id: true, firstName: true, lastName: true, title: true } },
        clinicalNotes: { select: { id: true, status: true, createdAt: true } },
      },
      orderBy: { encounterDate: "desc" },
    });

    return NextResponse.json({ encounters });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "encounters.create");

    const body = await req.json();
    const data = createSchema.parse(body);

    // Verify patient belongs to tenant
    const patient = await db.patient.findUnique({
      where: { id: data.patientId },
      select: { id: true, organizationId: true },
    });
    if (!patient) return apiError("Patient not found", 404);
    assertTenantOwnership(ctx, patient.organizationId);

    const encounter = await db.encounter.create({
      data: {
        organizationId: ctx.tenant.organizationId,
        appointmentId: data.appointmentId,
        patientId: data.patientId,
        providerId: data.providerId,
        encounterDate: new Date(data.encounterDate),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "encounter.created",
      resourceType: "Encounter",
      resourceId: encounter.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });

    return NextResponse.json(encounter, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
