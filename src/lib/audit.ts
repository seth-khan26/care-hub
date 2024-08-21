import { db } from "./db";

export type AuditAction =
  | "patient.created"
  | "patient.viewed"
  | "patient.updated"
  | "patient.deleted"
  | "clinical_note.viewed"
  | "clinical_note.created"
  | "clinical_note.updated"
  | "clinical_note.finalized"
  | "clinical_note.amended"
  | "document.accessed"
  | "document.uploaded"
  | "document.deleted"
  | "appointment.created"
  | "appointment.modified"
  | "appointment.cancelled"
  | "appointment.checked_in"
  | "encounter.created"
  | "user.invited"
  | "user.role_changed"
  | "user.login"
  | "user.logout"
  | "organization.created"
  | "organization.updated";

interface AuditParams {
  organizationId: string;
  actorUserId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  // Never log sensitive clinical content — only IDs and non-sensitive metadata
  await db.auditLog
    .create({
      data: {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        requestId: params.requestId,
        ipAddress: params.ipAddress,
        metadata: (params.metadata ?? {}) as Parameters<typeof db.auditLog.create>[0]["data"]["metadata"],
      },
    })
    .catch((err) => {
      // Audit logging must never crash the main request
      console.error("[audit] Failed to write audit log:", err);
    });
}
