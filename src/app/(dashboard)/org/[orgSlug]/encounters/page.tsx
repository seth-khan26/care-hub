import { requireSession } from "@/lib/session";
import { resolveTenantContext, authorize } from "@/lib/tenancy";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, noteStatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function EncountersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireSession();
  const tenant = await resolveTenantContext(session.user.id, orgSlug);
  authorize(tenant, "encounters.read");

  const encounters = await db.encounter.findMany({
    where: { organizationId: tenant.organizationId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
      provider: { select: { firstName: true, lastName: true, title: true } },
      clinicalNotes: { select: { id: true, status: true } },
    },
    orderBy: { encounterDate: "desc" },
    take: 50,
  });

  return (
    <div>
      <PageHeader title="Encounters" description="Clinical encounters and notes" />

      <Card>
        <CardContent className="p-0">
          {encounters.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">No encounters yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Patient</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {encounters.map((enc) => (
                  <tr key={enc.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/org/${orgSlug}/encounters/${enc.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {formatDate(enc.encounterDate)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/org/${orgSlug}/patients/${enc.patient.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {enc.patient.lastName}, {enc.patient.firstName}
                      </Link>
                      <p className="text-xs text-gray-400">{enc.patient.mrn}</p>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {enc.provider.title} {enc.provider.firstName} {enc.provider.lastName}
                    </td>
                    <td className="px-4 py-2">
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
