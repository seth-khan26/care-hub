import { requireSession } from "@/lib/session";
import { resolveTenantContext, authorize, assertTenantOwnership } from "@/lib/tenancy";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, appointmentStatusBadge, noteStatusBadge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; patientId: string }>;
}) {
  const { orgSlug, patientId } = await params;
  const session = await requireSession();
  const tenant = await resolveTenantContext(session.user.id, orgSlug);
  authorize(tenant, "patients.read");

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    include: {
      contact: true,
      insurance: true,
      appointments: {
        where: { organizationId: tenant.organizationId },
        orderBy: { startTime: "desc" },
        take: 20,
        include: {
          provider: { select: { firstName: true, lastName: true, title: true } },
          location: { select: { name: true } },
        },
      },
      encounters: {
        where: { organizationId: tenant.organizationId },
        orderBy: { encounterDate: "desc" },
        take: 20,
        include: {
          provider: { select: { firstName: true, lastName: true, title: true } },
          clinicalNotes: { select: { id: true, status: true, createdAt: true } },
        },
      },
    },
  });

  if (!patient) notFound();
  assertTenantOwnership(tenant, patient.organizationId);

  await createAuditLog({
    organizationId: tenant.organizationId,
    actorUserId: session.user.id,
    action: "patient.viewed",
    resourceType: "Patient",
    resourceId: patient.id,
  });

  return (
    <div>
      <PageHeader
        title={`${patient.firstName} ${patient.lastName}`}
        description={`MRN: ${patient.mrn} · DOB: ${formatDate(patient.dateOfBirth)}`}
        action={
          <Link href={`/org/${orgSlug}/appointments/new?patientId=${patient.id}`}>
            <Button>Schedule Appointment</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Demographics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span>{patient.firstName} {patient.lastName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">DOB</span>
                <span>{formatDate(patient.dateOfBirth)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Sex</span>
                <span>{patient.sex ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">MRN</span>
                <span className="font-mono">{patient.mrn}</span>
              </div>
            </CardContent>
          </Card>

          {patient.contact && (
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone</span>
                  <span>{patient.contact.phone ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span>{patient.contact.email ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Address</span>
                  <span className="text-right max-w-[180px]">
                    {[patient.contact.address, patient.contact.city, patient.contact.state, patient.contact.zip]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </span>
                </div>
                {patient.contact.emergencyName && (
                  <>
                    <div className="border-t pt-2 mt-2">
                      <p className="text-gray-500 text-xs mb-1">Emergency Contact</p>
                      <p>{patient.contact.emergencyName}</p>
                      <p className="text-gray-500">{patient.contact.emergencyPhone}</p>
                      <p className="text-gray-500">{patient.contact.emergencyRel}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {patient.insurance && patient.insurance.insurerName && (
            <Card>
              <CardHeader>
                <CardTitle>Insurance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Insurer</span>
                  <span>{patient.insurance.insurerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Policy #</span>
                  <span>{patient.insurance.policyNumber ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Group #</span>
                  <span>{patient.insurance.groupNumber ?? "—"}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              {patient.appointments.length === 0 ? (
                <p className="text-sm text-gray-500">No appointments</p>
              ) : (
                <div className="space-y-2">
                  {patient.appointments.map((appt) => (
                    <Link
                      key={appt.id}
                      href={`/org/${orgSlug}/appointments/${appt.id}`}
                      className="flex items-center justify-between rounded border border-gray-100 p-3 hover:bg-gray-50 text-sm"
                    >
                      <div>
                        <p className="font-medium">{formatDateTime(appt.startTime)}</p>
                        <p className="text-gray-500">
                          {appt.provider.title} {appt.provider.firstName}{" "}
                          {appt.provider.lastName}
                          {appt.location ? ` · ${appt.location.name}` : ""}
                        </p>
                      </div>
                      <Badge variant={appointmentStatusBadge(appt.status)}>
                        {appt.status.replace("_", " ")}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Encounters & Clinical Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {patient.encounters.length === 0 ? (
                <p className="text-sm text-gray-500">No encounters</p>
              ) : (
                <div className="space-y-2">
                  {patient.encounters.map((enc) => (
                    <Link
                      key={enc.id}
                      href={`/org/${orgSlug}/encounters/${enc.id}`}
                      className="flex items-center justify-between rounded border border-gray-100 p-3 hover:bg-gray-50 text-sm"
                    >
                      <div>
                        <p className="font-medium">{formatDate(enc.encounterDate)}</p>
                        <p className="text-gray-500">
                          {enc.provider.title} {enc.provider.firstName}{" "}
                          {enc.provider.lastName}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {enc.clinicalNotes.map((note) => (
                          <Badge key={note.id} variant={noteStatusBadge(note.status)}>
                            {note.status}
                          </Badge>
                        ))}
                        {enc.clinicalNotes.length === 0 && (
                          <Badge variant="secondary">No notes</Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
