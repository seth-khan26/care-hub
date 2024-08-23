import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { resolveTenantContext, TenantNotFoundError } from "@/lib/tenancy";
import { Sidebar } from "@/components/layout/sidebar";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireSession();

  let tenant;
  try {
    tenant = await resolveTenantContext(session.user.id, orgSlug);
  } catch (err) {
    if (err instanceof TenantNotFoundError) redirect("/select-org");
    throw err;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        orgSlug={orgSlug}
        orgName={tenant.organizationSlug}
        userEmail={session.user.email}
      />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
