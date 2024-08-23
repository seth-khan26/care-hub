import { requireSession } from "@/lib/session";
import { resolveTenantContext, authorize } from "@/lib/tenancy";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, appointmentStatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ date?: string; status?: string }>;
}) {
  const { orgSlug } = await params;
  const { date, status } = await searchParams;
  const session = await requireSession();
  const tenant = await resolveTenantContext(session.user.id, orgSlug);
  authorize(tenant, "appointments.read");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filterDate = date ? new Date(date) : today;
  const nextDay = new Date(filterDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const appointments = await db.appointment.findMany({
    where: {
      organizationId: tenant.organizationId,
      startTime: { gte: filterDate, lt: nextDay },
      ...(status ? { status: status as never } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
      provider: { select: { id: true, firstName: true, lastName: true, title: true } },
      location: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const dateStr = filterDate.toISOString().split("T")[0];

  return (
    <div>
      <PageHeader
        title="Appointments"
        action={
          <Link href={`/org/${orgSlug}/appointments/new`}>
            <Button>New Appointment</Button>
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <form method="GET" className="flex gap-2">
          <input
            type="date"
            name="date"
            defaultValue={dateStr}
            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
        <div className="flex gap-2 text-sm">
          {["", "SCHEDULED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED"].map((s) => (
            <Link
              key={s}
              href={`?date=${dateStr}${s ? `&status=${s}` : ""}`}
              className={`rounded px-2 py-1 border ${
                status === s || (!status && !s)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {s || "All"}
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {appointments.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              No appointments for this date
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Patient</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Location</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Reason</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt) => (
                  <tr key={appt.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      <Link
                        href={`/org/${orgSlug}/appointments/${appt.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {formatDateTime(appt.startTime)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/org/${orgSlug}/patients/${appt.patient.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {appt.patient.lastName}, {appt.patient.firstName}
                      </Link>
                      <p className="text-gray-400 text-xs">{appt.patient.mrn}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {appt.provider.title} {appt.provider.firstName} {appt.provider.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{appt.location?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate">
                      {appt.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={appointmentStatusBadge(appt.status)}>
                        {appt.status.replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
