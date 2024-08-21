import { db } from "./db";
import { MembershipRole } from "@prisma/client";
import { Permission, hasPermission } from "./permissions";

export interface TenantContext {
  organizationId: string;
  organizationSlug: string;
  userId: string;
  role: MembershipRole;
  membershipId: string;
}

export class TenantAuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "TenantAuthorizationError";
  }
}

export class TenantNotFoundError extends Error {
  constructor(message = "Organization not found") {
    super(message);
    this.name = "TenantNotFoundError";
  }
}

/**
 * Resolve and verify the tenant context for a request.
 * Never trust client-supplied organizationId without verifying membership.
 */
export async function resolveTenantContext(
  userId: string,
  orgSlug: string
): Promise<TenantContext> {
  const membership = await db.membership.findFirst({
    where: {
      userId,
      isActive: true,
      organization: {
        slug: orgSlug,
        isActive: true,
      },
    },
    include: {
      organization: { select: { id: true, slug: true } },
    },
  });

  if (!membership) {
    throw new TenantNotFoundError();
  }

  return {
    organizationId: membership.organization.id,
    organizationSlug: membership.organization.slug,
    userId,
    role: membership.role,
    membershipId: membership.id,
  };
}

type CtxOrTenant = TenantContext | { tenant: TenantContext };

function asTenant(c: CtxOrTenant): TenantContext {
  return "tenant" in c ? c.tenant : c;
}

/**
 * Centralized authorization check — prefer this over scattered role checks.
 */
export function authorize(ctx: CtxOrTenant, permission: Permission): void {
  const t = asTenant(ctx);
  if (!hasPermission(t.role, permission)) {
    throw new TenantAuthorizationError(
      `Role ${t.role} does not have permission: ${permission}`
    );
  }
}

/**
 * Verify that a resource belongs to the current tenant.
 * Call this before returning any tenant-owned resource.
 */
export function assertTenantOwnership(
  ctx: CtxOrTenant,
  resourceTenantId: string
): void {
  const t = asTenant(ctx);
  if (resourceTenantId !== t.organizationId) {
    throw new TenantAuthorizationError("Resource belongs to another tenant");
  }
}

/**
 * Get all memberships for a user (for org selection after login).
 */
export async function getUserMemberships(userId: string) {
  return db.membership.findMany({
    where: { userId, isActive: true },
    include: {
      organization: {
        select: { id: true, name: true, slug: true, isActive: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
}
