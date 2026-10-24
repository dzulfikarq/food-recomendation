import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login?callbackURL=%2Fadmin");
  if (session.user.role !== "ADMIN") redirect("/?error=forbidden");
  return session.user;
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login?callbackURL=%2Fmy-ratings");
  if (session.user.role !== "USER") redirect("/admin");
  return session.user;
}

export async function redirectAuthenticatedUser() {
  const session = await getSession();
  if (session) redirect(session.user.role === "ADMIN" ? "/admin" : "/");
}
