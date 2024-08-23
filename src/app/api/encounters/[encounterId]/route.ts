import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/api-context";
import { authorize, assertTenantOwnership } from "@/lib/tenancy";
import { handleApiError, apiError } from "@/lib/errors";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ encounterId: string }> }
) {
  try {
    const { encounterId } = await params;
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "encounters.read");

    const encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            title: true,
          },
        },
        clinicalNotes: {
          include: {
            versions: {
              orderBy: { versionNumber: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!encounter) return apiError("Encounter not found", 404);
    assertTenantOwnership(ctx, encounter.organizationId);

    return NextResponse.json(encounter);
  } catch (err) {
    return handleApiError(err);
  }
}
