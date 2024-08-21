import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invitation = await db.invitation.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  });

  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt < new Date()
  ) {
    return NextResponse.json({ invitation: null }, { status: 404 });
  }

  return NextResponse.json({
    invitation: {
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organization.name,
    },
  });
}
