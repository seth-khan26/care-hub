import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/api-context";
import { authorize } from "@/lib/tenancy";
import { handleApiError } from "@/lib/errors";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "";
    const result = await getApiContext(req, orgSlug);
    if ("error" in result) return result.error;
    const { ctx } = result;

    authorize(ctx, "audit_logs.read");

    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const limit = 50;
    const resourceType = req.nextUrl.searchParams.get("resourceType");
    const action = req.nextUrl.searchParams.get("action");

    const where = {
      organizationId: ctx.tenant.organizationId,
      ...(resourceType ? { resourceType } : {}),
      ...(action ? { action } : {}),
    };

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, limit });
  } catch (err) {
    return handleApiError(err);
  }
}
