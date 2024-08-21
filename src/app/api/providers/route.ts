import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize } from "@/lib/tenancy";
import { handleApiError } from "@/lib/errors";
import { db } from "@/lib/db";

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  title: z.string().max(50).optional(),
  specialty: z.string().max(100).optional(),
  licenseNumber: z.string().max(50).optional(),
  npi: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  locationId: z.string().min(1).optional(),
  availability: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        slotDuration: z.number().int().min(15).max(120).default(30),
      })
    )
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "appointments.read");

    const providers = await db.provider.findMany({
      where: { organizationId: ctx.tenant.organizationId, isActive: true },
      include: { availability: true, location: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json({ providers });
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

    authorize(ctx, "providers.manage");

    const body = await req.json();
    const data = createSchema.parse(body);

    const provider = await db.$transaction(async (tx) => {
      const p = await tx.provider.create({
        data: {
          organizationId: ctx.tenant.organizationId,
          firstName: data.firstName,
          lastName: data.lastName,
          title: data.title,
          specialty: data.specialty,
          licenseNumber: data.licenseNumber,
          npi: data.npi,
          phone: data.phone,
          email: data.email || undefined,
          locationId: data.locationId,
        },
      });

      if (data.availability?.length) {
        await tx.providerAvailability.createMany({
          data: data.availability.map((a) => ({
            providerId: p.id,
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
            slotDuration: a.slotDuration,
          })),
        });
      }

      return p;
    });

    return NextResponse.json(provider, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
