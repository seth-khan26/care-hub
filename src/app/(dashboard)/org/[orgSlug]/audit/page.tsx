import { requireSession } from "@/lib/session";
import { resolveTenantContext, authorize } from "@/lib/tenancy";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string; resourceType?: string }>;
}) {
  const { orgSlug } = await params;
  const { page = "1", resourceType } = await searchParams;
  const session = await requireSession();
  const tenant = await resolveTenantContext(session.user.id, orgSlug);
  authorize(tenant, "audit_logs.read");

  const pageNum = Math.max(1, Number(page));
  const limit = 50;

  const where = {
    organizationId: tenant.organizationId,
    ...(resourceType ? { resourceType } : {}),
  };

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: {
        actor: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * limit,
      take: limit,
    }),
    db.auditLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  const resourceTypes = await db.auditLog
    .findMany({
      where: { organizationId: tenant.organizationId },
      select: { resourceType: true },
      distinct: ["resourceType"],
    })
    .then((rows) => rows.map((r) => r.resourceType));

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Security and access audit trail — append-only record of all sensitive actions"
      />

      <div className="mb-4 flex gap-2 flex-wrap">
        <Link
          href="?"
          className={`text-sm rounded px-3 py-1 border ${
            !resourceType
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          All
        </Link>
        {resourceTypes.map((rt) => (
          <Link
            key={rt}
            href={`?resourceType=${rt}`}
            className={`text-sm rounded px-3 py-1 border ${
              resourceType === rt
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {rt}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">No audit logs</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actor</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Resource</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      {log.actor ? (
                        <span className="text-gray-700">
                          {log.actor.firstName} {log.actor.lastName}
                        </span>
                      ) : (
                        <span className="text-gray-400">System</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {log.action}
                      </code>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      <span className="text-gray-400">{log.resourceType}</span>
                      <span className="text-gray-300 mx-1">/</span>
                      <span className="font-mono text-xs">{log.resourceId.slice(0, 8)}…</span>
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs font-mono">
                      {log.ipAddress ?? "—"}
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
          <p>Page {pageNum} of {totalPages} ({total} total)</p>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link
                href={`?${resourceType ? `resourceType=${resourceType}&` : ""}page=${pageNum - 1}`}
                className="rounded border px-3 py-1 hover:bg-gray-100"
              >
                Previous
              </Link>
            )}
            {pageNum < totalPages && (
              <Link
                href={`?${resourceType ? `resourceType=${resourceType}&` : ""}page=${pageNum + 1}`}
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
