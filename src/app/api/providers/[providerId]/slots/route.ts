import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/api-context";
import { authorize, assertTenantOwnership } from "@/lib/tenancy";
import { handleApiError, apiError } from "@/lib/errors";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { providerId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "appointments.read");

    const dateParam = req.nextUrl.searchParams.get("date");
    if (!dateParam) return apiError("date query param required", 422);

    const provider = await db.provider.findUnique({
      where: { id: providerId },
      include: { availability: { where: { isActive: true } } },
    });
    if (!provider) return apiError("Provider not found", 404);
    assertTenantOwnership(ctx, provider.organizationId);

    const date = new Date(dateParam);
    const dayOfWeek = date.getDay();

    const dayAvailability = provider.availability.find(
      (a) => a.dayOfWeek === dayOfWeek
    );

    if (!dayAvailability) {
      return NextResponse.json({ slots: [] });
    }

    // Build slots from availability window
    const [startH, startM] = dayAvailability.startTime.split(":").map(Number);
    const [endH, endM] = dayAvailability.endTime.split(":").map(Number);
    const duration = dayAvailability.slotDuration;

    const slots: { startTime: string; endTime: string; available: boolean }[] = [];
    let current = startH * 60 + startM;
    const end = endH * 60 + endM;

    while (current + duration <= end) {
      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(current / 60), current % 60, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + duration);
      slots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        available: true,
      });
      current += duration;
    }

    // Mark booked slots
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const existingAppointments = await db.appointment.findMany({
      where: {
        organizationId: ctx.tenant.organizationId,
        providerId,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        startTime: { gte: date, lt: nextDay },
      },
      select: { startTime: true, endTime: true },
    });

    for (const slot of slots) {
      const slotStart = new Date(slot.startTime);
      const slotEnd = new Date(slot.endTime);
      for (const appt of existingAppointments) {
        if (appt.startTime < slotEnd && appt.endTime > slotStart) {
          slot.available = false;
          break;
        }
      }
    }

    return NextResponse.json({ slots });
  } catch (err) {
    return handleApiError(err);
  }
}
