import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize, assertTenantOwnership } from "@/lib/tenancy";
import { handleApiError, apiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";

const createSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.string().min(1),
  locationId: z.string().min(1).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "appointments.read");

    const date = req.nextUrl.searchParams.get("date");
    const providerId = req.nextUrl.searchParams.get("providerId");
    const patientId = req.nextUrl.searchParams.get("patientId");
    const status = req.nextUrl.searchParams.get("status");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId: ctx.tenant.organizationId };

    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      where.startTime = { gte: d, lt: nextDay };
    }
    if (providerId) where.providerId = providerId;
    if (patientId) where.patientId = patientId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (status) (where as any).status = status;

    const appointments = await db.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        provider: { select: { id: true, firstName: true, lastName: true, title: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json({ appointments });
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

    authorize(ctx, "appointments.create");

    const body = await req.json();
    const data = createSchema.parse(body);

    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (end <= start) {
      return apiError("End time must be after start time", 422);
    }

    // Verify patient belongs to this tenant
    const patient = await db.patient.findUnique({
      where: { id: data.patientId },
      select: { id: true, organizationId: true },
    });
    if (!patient) return apiError("Patient not found", 404);
    assertTenantOwnership(ctx, patient.organizationId);

    // Verify provider belongs to this tenant
    const provider = await db.provider.findUnique({
      where: { id: data.providerId },
      select: { id: true, organizationId: true },
    });
    if (!provider) return apiError("Provider not found", 404);
    assertTenantOwnership(ctx, provider.organizationId);

    // Prevent conflicting appointments — use a transaction with serializable isolation
    const appointment = await db.$transaction(
      async (tx) => {
        // Check for overlapping appointments for this provider
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

        return tx.appointment.create({
          data: {
            organizationId: ctx.tenant.organizationId,
            patientId: data.patientId,
            providerId: data.providerId,
            locationId: data.locationId,
            startTime: start,
            endTime: end,
            reason: data.reason,
            notes: data.notes,
            status: "SCHEDULED",
          },
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
            provider: { select: { id: true, firstName: true, lastName: true } },
            location: true,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "appointment.created",
      resourceType: "Appointment",
      resourceId: appointment.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });

    return NextResponse.json(appointment, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("CONFLICT:")) {
      return apiError("Provider has a scheduling conflict at this time", 409);
    }
    return handleApiError(err);
  }
}
