import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-context";
import { authorize } from "@/lib/tenancy";
import { handleApiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "PROVIDER", "STAFF"]),
});

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "staff.manage");

    const members = await db.membership.findMany({
      where: {
        organizationId: ctx.tenant.organizationId,
        isActive: true,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({ members });
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

    authorize(ctx, "staff.invite");

    const body = await req.json();
    const data = inviteSchema.parse(body);

    // Create invitation token (expires in 7 days)
    const invitation = await db.invitation.create({
      data: {
        organizationId: ctx.tenant.organizationId,
        email: data.email.toLowerCase(),
        role: data.role,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: ctx.session.user.id,
      },
    });

    await createAuditLog({
      organizationId: ctx.tenant.organizationId,
      actorUserId: ctx.session.user.id,
      action: "user.invited",
      resourceType: "Invitation",
      resourceId: invitation.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { role: data.role, email: data.email },
    });

    // In production, send invitation email here
    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
