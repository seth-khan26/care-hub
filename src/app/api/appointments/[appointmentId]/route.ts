import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize, assertTenantOwnership } from "@/lib/tenancy";
import { handleApiError, apiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";

const updateSchema = z.object({
  status: z
    .enum([
      "SCHEDULED",
      "CONFIRMED",
      "CHECKED_IN",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
    ])
    .optional(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { appointmentId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "appointments.read");

    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        provider: true,
        location: true,
        encounter: { include: { clinicalNotes: true } },
      },
    });

    if (!appointment) return apiError("Appointment not found", 404);
    assertTenantOwnership(ctx, appointment.organizationId);

    return NextResponse.json(appointment);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { appointmentId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "appointments.update");

    const existing = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, organizationId: true, status: true, providerId: true },
    });
    if (!existing) return apiError("Appointment not found", 404);
    assertTenantOwnership(ctx, existing.organizationId);

    const body = await req.json();
    const data = updateSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.reason !== undefined) updateData.reason = data.reason;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime);
    if (data.endTime !== undefined) updateData.endTime = new Date(data.endTime);
    if (data.status === "CHECKED_IN") updateData.checkedInAt = new Date();

    const appointment = await db.appointment.update({
      where: { id: appointmentId },
      data: updateData as Parameters<typeof db.appointment.update>[0]["data"],
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { id: true, firstName: true, lastName: true } },
        location: true,
      },
    });

    const action =
      data.status === "CANCELLED"
        ? "appointment.cancelled"
        : data.status === "CHECKED_IN"
        ? "appointment.checked_in"
        : "appointment.modified";

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action,
      resourceType: "Appointment",
      resourceId: appointment.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { status: data.status },
    });

    return NextResponse.json(appointment);
  } catch (err) {
    return handleApiError(err);
  }
}
