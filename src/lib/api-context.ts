import { NextRequest } from "next/server";
import { getSession, ActiveSession } from "./session";
import { resolveTenantContext, TenantContext } from "./tenancy";
import { apiError } from "./errors";

export interface ApiContext {
  session: ActiveSession;
  tenant: TenantContext;
  requestId: string;
  ipAddress: string;
}

export async function getApiContext(
  req: NextRequest,
  orgSlug: string
): Promise<{ ctx: ApiContext } | { error: ReturnType<typeof apiError> }> {
  const { v4: uuidv4 } = await import("uuid");
  const requestId = uuidv4();

  const session = await getSession();
  if (!session) {
    return { error: apiError("Unauthorized", 401) };
  }

  try {
    const tenant = await resolveTenantContext(session.user.id, orgSlug);
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    return {
      ctx: { session, tenant, requestId, ipAddress },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "TenantNotFoundError") {
      return { error: apiError("Organization not found", 404) };
    }
    return { error: apiError("Forbidden", 403) };
  }
}
