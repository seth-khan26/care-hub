import { requireSession } from "@/lib/session";
import { resolveTenantContext, authorize } from "@/lib/tenancy";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ProvidersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireSession();
  const tenant = await resolveTenantContext(session.user.id, orgSlug);
  authorize(tenant, "appointments.read");

  const canManage = ["OWNER", "ADMIN"].includes(tenant.role);

  const providers = await db.provider.findMany({
    where: { organizationId: tenant.organizationId, isActive: true },
    include: {
      availability: { where: { isActive: true }, orderBy: { dayOfWeek: "asc" } },
      location: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Providers"
        description={`${providers.length} active provider${providers.length !== 1 ? "s" : ""}`}
        action={
          canManage ? (
            <Link href={`/org/${orgSlug}/providers/new`}>
              <Button>Add Provider</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((p) => (
          <Card key={p.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    {p.title} {p.firstName} {p.lastName}
                  </p>
                  {p.specialty && (
                    <p className="text-sm text-gray-500">{p.specialty}</p>
                  )}
                  {p.location && (
                    <p className="text-xs text-gray-400">{p.location.name}</p>
                  )}
                </div>
                <Badge variant="success">Active</Badge>
              </div>

              {p.availability.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Availability
                  </p>
                  <div className="space-y-1">
                    {p.availability.map((a) => (
                      <div
                        key={a.id}
                        className="flex justify-between text-xs text-gray-600"
                      >
                        <span>{DAYS[a.dayOfWeek]}</span>
                        <span>
                          {a.startTime} – {a.endTime}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 pt-3 border-t">
                <Link
                  href={`/org/${orgSlug}/appointments?providerId=${p.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  View appointments →
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}

        {providers.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-500">
            No providers yet.{" "}
            {canManage && (
              <Link
                href={`/org/${orgSlug}/providers/new`}
                className="text-blue-600 hover:underline"
              >
                Add the first provider.
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
