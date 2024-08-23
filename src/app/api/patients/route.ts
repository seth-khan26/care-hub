import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize } from "@/lib/tenancy";
import { handleApiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { generateMRN } from "@/lib/mrn";

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  insurerName: z.string().max(100).optional(),
  policyNumber: z.string().max(100).optional(),
  groupNumber: z.string().max(100).optional(),
  subscriberName: z.string().max(100).optional(),
  relationship: z.string().max(50).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "patients.read");

    const search = req.nextUrl.searchParams.get("search") ?? "";
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const limit = 20;

    const where = {
      organizationId: ctx.tenant.organizationId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { mrn: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [patients, total] = await Promise.all([
      db.patient.findMany({
        where,
        include: { contact: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.patient.count({ where }),
    ]);

    return NextResponse.json({ patients, total, page, limit });
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

    authorize(ctx, "patients.create");

    const body = await req.json();
    const data = createSchema.parse(body);

    const mrn = await generateMRN(ctx.tenant.organizationId);

    const patient = await db.$transaction(async (tx) => {
      const p = await tx.patient.create({
        data: {
          organizationId: ctx.tenant.organizationId,
          mrn,
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: new Date(data.dateOfBirth),
          sex: data.sex,
          contact: {
            create: {
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
          },
          insurance: data.insurerName
            ? {
                create: {
                  insurerName: data.insurerName,
                  policyNumber: data.policyNumber,
                  groupNumber: data.groupNumber,
                  subscriberName: data.subscriberName,
                  relationship: data.relationship,
                },
              }
            : undefined,
        },
        include: { contact: true, insurance: true },
      });
      return p;
    });

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "patient.created",
      resourceType: "Patient",
      resourceId: patient.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { mrn: patient.mrn },
    });

    return NextResponse.json(patient, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
