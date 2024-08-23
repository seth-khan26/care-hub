import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserMemberships } from "@/lib/tenancy";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await getUserMemberships(session.user.id);

  return NextResponse.json({
    user: session.user,
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      organizationSlug: m.organization.slug,
      role: m.role,
    })),
  });
}
