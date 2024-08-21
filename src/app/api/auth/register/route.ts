import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/session";
import { handleApiError } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  organizationName: z.string().min(2).max(200),
  organizationSlug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = schema.parse(body);

    const existingUser = await db.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }

    const existingOrg = await db.organization.findUnique({
      where: { slug: data.organizationSlug },
    });
    if (existingOrg) {
      return NextResponse.json(
        { error: "Organization slug already taken" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user + organization + membership atomically
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });

      const org = await tx.organization.create({
        data: {
          name: data.organizationName,
          slug: data.organizationSlug,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: "OWNER",
        },
      });

      return { user, org };
    });

    await createAuditLog({
      organizationId: result.org.id,
      actorUserId: result.user.id,
      action: "organization.created",
      resourceType: "Organization",
      resourceId: result.org.id,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown",
    });

    const token = await createSession(result.user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
