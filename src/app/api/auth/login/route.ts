import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/session";
import { handleApiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { getUserMemberships } from "@/lib/tenancy";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = schema.parse(body);

    const user = await db.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    // Constant-time comparison to prevent user enumeration
    const dummyHash =
      "$2a$12$dummy.hash.for.timing.safety.padding.here.12345";
    const valid = user
      ? await bcrypt.compare(data.password, user.passwordHash)
      : await bcrypt.compare(data.password, dummyHash).then(() => false);

    if (!user || !valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const memberships = await getUserMemberships(user.id);
    if (memberships.length === 0) {
      return NextResponse.json(
        { error: "No active organization memberships" },
        { status: 403 }
      );
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

    const token = await createSession(user.id, {
      ipAddress,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await setSessionCookie(token);

    // Audit login for each tenant (use first membership's org for simplicity)
    if (memberships[0]) {
      await createAuditLog({
        organizationId: memberships[0].organizationId,
        actorUserId: user.id,
        action: "user.login",
        resourceType: "User",
        resourceId: user.id,
        ipAddress,
      });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role,
      })),
      redirectTo:
        memberships.length === 1
          ? `/org/${memberships[0].organization.slug}`
          : "/select-org",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
