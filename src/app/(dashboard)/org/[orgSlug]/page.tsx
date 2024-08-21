import { requireSession } from "@/lib/session";
import { resolveTenantContext } from "@/lib/tenancy";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, appointmentStatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireSession();
  const tenant = await resolveTenantContext(session.user.id, orgSlug);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    todayAppointments,
    patientCount,
    providerCount,
    pendingAppointments,
  ] = await Promise.all([
    db.appointment.findMany({
      where: {
        organizationId: tenant.organizationId,
        startTime: { gte: today, lt: tomorrow },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        provider: { select: { firstName: true, lastName: true, title: true } },
      },
      orderBy: { startTime: "asc" },
      take: 10,
    }),
    db.patient.count({
      where: { organizationId: tenant.organizationId, isActive: true },
    }),
    db.provider.count({
      where: { organizationId: tenant.organizationId, isActive: true },
    }),
    db.appointment.count({
      where: {
        organizationId: tenant.organizationId,
        status: "SCHEDULED",
        startTime: { gte: today },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${session.user.firstName}`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-gray-500">Total Patients</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{patientCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-gray-500">Active Providers</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{providerCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-gray-500">Upcoming Appointments</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{pendingAppointments}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Today&apos;s Appointments</CardTitle>
            <Link
              href={`/org/${orgSlug}/appointments`}
              className="text-sm text-blue-600 hover:underline"
            >
              View all →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {todayAppointments.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No appointments scheduled for today
            </p>
          ) : (
            <div className="space-y-3">
              {todayAppointments.map((appt) => (
                <Link
                  key={appt.id}
                  href={`/org/${orgSlug}/appointments/${appt.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-sm">
                      <p className="font-medium text-gray-900">
                        {appt.patient.firstName} {appt.patient.lastName}
                      </p>
                      <p className="text-gray-500">
                        {appt.provider.title} {appt.provider.firstName}{" "}
                        {appt.provider.lastName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-gray-500">
                      {formatDateTime(appt.startTime)}
                    </p>
                    <Badge variant={appointmentStatusBadge(appt.status)}>
                      {appt.status.replace("_", " ")}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
