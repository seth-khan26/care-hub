import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserMemberships } from "@/lib/tenancy";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await getUserMemberships(session.user.id);
  if (memberships.length === 0) redirect("/login");
  if (memberships.length === 1) {
    redirect(`/org/${memberships[0].organization.slug}`);
  }
  redirect("/select-org");
}
