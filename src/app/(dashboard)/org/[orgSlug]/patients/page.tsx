import { requireSession } from "@/lib/session";
import { resolveTenantContext, authorize } from "@/lib/tenancy";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const { search = "", page = "1" } = await searchParams;
  const session = await requireSession();
  const tenant = await resolveTenantContext(session.user.id, orgSlug);
  authorize(tenant, "patients.read");

  const pageNum = Math.max(1, Number(page));
  const limit = 20;

  const where = {
    organizationId: tenant.organizationId,
    isActive: true,
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { mrn: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [patients, total] = await Promise.all([
    db.patient.findMany({
      where,
      include: { contact: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (pageNum - 1) * limit,
      take: limit,
    }),
    db.patient.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <PageHeader
        title="Patients"
        description={`${total} patient${total !== 1 ? "s" : ""}`}
        action={
          <Link href={`/org/${orgSlug}/patients/new`}>
            <Button>Add Patient</Button>
          </Link>
        }
      />

      <div className="mb-4">
        <form method="GET" className="flex gap-3">
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by name or MRN..."
            className="flex h-10 w-full max-w-sm rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {patients.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              {search ? "No patients found for this search" : "No patients registered yet"}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">MRN</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">DOB</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Phone</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-mono text-gray-500">{p.mrn}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/org/${orgSlug}/patients/${p.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {p.lastName}, {p.firstName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(p.dateOfBirth)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.contact?.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.isActive ? "success" : "secondary"}>
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <p>
            Page {pageNum} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link
                href={`?search=${search}&page=${pageNum - 1}`}
                className="rounded border px-3 py-1 hover:bg-gray-100"
              >
                Previous
              </Link>
            )}
            {pageNum < totalPages && (
              <Link
                href={`?search=${search}&page=${pageNum + 1}`}
                className="rounded border px-3 py-1 hover:bg-gray-100"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
