import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize, assertTenantOwnership } from "@/lib/tenancy";
import { handleApiError, apiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";

const updateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sex: z.enum(["male", "female", "other", "unknown"]).optional(),
  phone: z.string().max(30).optional(),
  alternatePhone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip: z.string().max(20).optional(),
  emergencyName: z.string().max(100).optional(),
  emergencyPhone: z.string().max(30).optional(),
  emergencyRel: z.string().max(50).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  try {
    const { patientId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "patients.read");

    const patient = await db.patient.findUnique({
      where: { id: patientId },
      include: {
        contact: true,
        insurance: true,
        appointments: {
          where: { organizationId: ctx.tenant.organizationId },
          orderBy: { startTime: "desc" },
          take: 10,
          include: { provider: true, location: true },
        },
        encounters: {
          where: { organizationId: ctx.tenant.organizationId },
          orderBy: { encounterDate: "desc" },
          take: 10,
          include: { provider: true, clinicalNotes: true },
        },
      },
    });

    if (!patient) return apiError("Patient not found", 404);
    assertTenantOwnership(ctx, patient.organizationId);

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "patient.viewed",
      resourceType: "Patient",
      resourceId: patient.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });

    return NextResponse.json(patient);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  try {
    const { patientId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "patients.update");

    const existing = await db.patient.findUnique({
      where: { id: patientId },
      select: { id: true, organizationId: true },
    });
    if (!existing) return apiError("Patient not found", 404);
    assertTenantOwnership(ctx, existing.organizationId);

    const body = await req.json();
    const data = updateSchema.parse(body);

    const patient = await db.$transaction(async (tx) => {
      const updated = await tx.patient.update({
        where: { id: patientId },
        data: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.dateOfBirth && { dateOfBirth: new Date(data.dateOfBirth) }),
          ...(data.sex && { sex: data.sex }),
        },
      });

      await tx.patientContact.upsert({
        where: { patientId },
        create: {
          patientId,
          phone: data.phone,
          alternatePhone: data.alternatePhone,
          email: data.email || undefined,
          address: data.address,
          city: data.city,
          state: data.state,
          zip: data.zip,
          emergencyName: data.emergencyName,
          emergencyPhone: data.emergencyPhone,
          emergencyRel: data.emergencyRel,
        },
        update: {
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.email !== undefined && { email: data.email || null }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.city !== undefined && { city: data.city }),
          ...(data.state !== undefined && { state: data.state }),
          ...(data.zip !== undefined && { zip: data.zip }),
          ...(data.emergencyName !== undefined && {
            emergencyName: data.emergencyName,
          }),
          ...(data.emergencyPhone !== undefined && {
            emergencyPhone: data.emergencyPhone,
          }),
          ...(data.emergencyRel !== undefined && {
            emergencyRel: data.emergencyRel,
          }),
        },
      });

      return updated;
    });

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "patient.updated",
      resourceType: "Patient",
      resourceId: patient.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });

    return NextResponse.json(patient);
  } catch (err) {
    return handleApiError(err);
  }
}
