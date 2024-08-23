import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getUserMemberships } from "@/lib/tenancy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SelectOrgPage() {
  const session = await requireSession();
  const memberships = await getUserMemberships(session.user.id);

  if (memberships.length === 0) redirect("/login");
  if (memberships.length === 1) {
    redirect(`/org/${memberships[0].organization.slug}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">CareHub</h1>
          <p className="text-gray-500 text-sm mt-1">
            Select an organization to continue
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Your Organizations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {memberships.map((m) => (
              <Link
                key={m.organizationId}
                href={`/org/${m.organization.slug}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {m.organization.name}
                  </p>
                  <p className="text-sm text-gray-500">{m.role}</p>
                </div>
                <span className="text-gray-400">→</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
