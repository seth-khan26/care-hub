import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, clearSessionCookie } from "@/lib/session";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("carehub_session")?.value;
  if (token) {
    await destroySession(token);
  }
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
