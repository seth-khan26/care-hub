import { MembershipRole } from "@prisma/client";

export type Permission =
  | "patients.read"
  | "patients.create"
  | "patients.update"
  | "clinical_notes.read"
  | "clinical_notes.create"
  | "clinical_notes.update"
  | "clinical_notes.finalize"
  | "appointments.read"
  | "appointments.create"
  | "appointments.update"
  | "appointments.cancel"
  | "encounters.read"
  | "encounters.create"
  | "staff.manage"
  | "staff.invite"
  | "providers.manage"
  | "locations.manage"
  | "audit_logs.read"
  | "documents.read"
  | "documents.upload"
  | "documents.delete"
  | "organization.settings";

const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  OWNER: [
    "patients.read",
    "patients.create",
    "patients.update",
    "clinical_notes.read",
    "clinical_notes.create",
    "clinical_notes.update",
    "clinical_notes.finalize",
    "appointments.read",
    "appointments.create",
    "appointments.update",
    "appointments.cancel",
    "encounters.read",
    "encounters.create",
    "staff.manage",
    "staff.invite",
    "providers.manage",
    "locations.manage",
    "audit_logs.read",
    "documents.read",
    "documents.upload",
    "documents.delete",
    "organization.settings",
  ],
  ADMIN: [
    "patients.read",
    "patients.create",
    "patients.update",
    "clinical_notes.read",
    "clinical_notes.create",
    "clinical_notes.update",
    "clinical_notes.finalize",
    "appointments.read",
    "appointments.create",
    "appointments.update",
    "appointments.cancel",
    "encounters.read",
    "encounters.create",
    "staff.manage",
    "staff.invite",
    "providers.manage",
    "locations.manage",
    "audit_logs.read",
    "documents.read",
    "documents.upload",
    "documents.delete",
    "organization.settings",
  ],
  PROVIDER: [
    "patients.read",
    "clinical_notes.read",
    "clinical_notes.create",
    "clinical_notes.update",
    "clinical_notes.finalize",
    "appointments.read",
    "appointments.update",
    "encounters.read",
    "encounters.create",
    "documents.read",
    "documents.upload",
  ],
  STAFF: [
    "patients.read",
    "patients.create",
    "patients.update",
    "appointments.read",
    "appointments.create",
    "appointments.update",
    "appointments.cancel",
    "encounters.read",
    "documents.read",
    "documents.upload",
  ],
  PATIENT: [
    "appointments.read",
    "documents.read",
  ],
};

export function hasPermission(
  role: MembershipRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissionsForRole(role: MembershipRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
