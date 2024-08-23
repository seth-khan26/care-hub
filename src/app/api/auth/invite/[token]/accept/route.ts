import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/session";
import { handleApiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";

const schema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invitation = await db.invitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt < new Date()
    ) {
      return NextResponse.json(
        { error: "Invitation is invalid or expired" },
        { status: 410 }
      );
    }

    const body = await req.json();
    const data = schema.parse(body);

    const passwordHash = await bcrypt.hash(data.password, 12);

    const result = await db.$transaction(async (tx) => {
      // Check if user with this email already exists
      let user = await tx.user.findUnique({
        where: { email: invitation.email },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
          },
        });
      }

      // Upsert membership
      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: invitation.organizationId,
          },
        },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
        update: {
          role: invitation.role,
          isActive: true,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return user;
    });

    await createAuditLog({
      organizationId: invitation.organizationId,
      actorUserId: result.id,
      action: "user.invited",
      resourceType: "User",
      resourceId: result.id,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown",
      metadata: { role: invitation.role },
    });

    const sessionToken = await createSession(result.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined,
    });
    await setSessionCookie(sessionToken);

    return NextResponse.json({
      redirectTo: `/org/${invitation.organization.slug}`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
