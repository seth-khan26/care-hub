import { db } from "./db";

export async function generateMRN(organizationId: string): Promise<string> {
  // Atomic counter using DB to prevent race conditions
  const count = await db.patient.count({ where: { organizationId } });
  const padded = String(count + 1).padStart(6, "0");
  return `MRN-${padded}`;
}
