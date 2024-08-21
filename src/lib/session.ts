import { cookies } from "next/headers";
import { db } from "./db";

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface ActiveSession {
  user: SessionUser;
  sessionId: string;
}

const SESSION_COOKIE = "carehub_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getSession(): Promise<ActiveSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
    },
  };
}

export async function createSession(
  userId: string,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<string> {
  const { v4: uuidv4 } = await import("uuid");
  const token = uuidv4() + uuidv4(); // 64-char random token

  await db.session.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    },
  });

  return token;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { token } }).catch(() => {});
}

export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return session as ActiveSession;
}
