import { requireSession } from "@/lib/session";
import { resolveTenantContext, authorize } from "@/lib/tenancy";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

const roleColors: Record<string, "default" | "success" | "warning" | "secondary"> = {
  OWNER: "default",
  ADMIN: "warning",
  PROVIDER: "success",
  STAFF: "secondary",
  PATIENT: "secondary",
};

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireSession();
  const tenant = await resolveTenantContext(session.user.id, orgSlug);
  authorize(tenant, "organization.settings");

  const org = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    include: {
      memberships: {
        where: { isActive: true },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      invitations: {
        where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!org) return null;

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium">{org.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Slug</span>
              <span className="font-mono">{org.slug}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Timezone</span>
              <span>{org.timezone}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Staff Members</CardTitle>
              <a
                href={`/org/${orgSlug}/settings/invite`}
                className="text-sm text-blue-600 hover:underline"
              >
                Invite staff →
              </a>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Joined</th>
                </tr>
              </thead>
              <tbody>
                {org.memberships.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100">
                    <td className="px-4 py-2">
                      {m.user.firstName} {m.user.lastName}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{m.user.email}</td>
                    <td className="px-4 py-2">
                      <Badge variant={roleColors[m.role] ?? "secondary"}>{m.role}</Badge>
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {formatDateTime(m.joinedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {org.invitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {org.invitations.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-100">
                      <td className="px-4 py-2">{inv.email}</td>
                      <td className="px-4 py-2">
                        <Badge variant={roleColors[inv.role] ?? "secondary"}>{inv.role}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">
                        {formatDateTime(inv.expiresAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
