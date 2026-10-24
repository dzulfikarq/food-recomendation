import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { readApplicationEnvironment } from "@/lib/env";

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

export function validationError(error: ZodError) {
  return apiError(422, "VALIDATION_ERROR", "Periksa kembali data yang dikirim.", error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message
  })));
}

export function parseFoodId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function hasTrustedOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(readApplicationEnvironment().AUTH_URL).origin;
  } catch {
    return false;
  }
}

export async function requireAdminRequest(request: Request) {
  if (!hasTrustedOrigin(request)) return { user: null, response: apiError(403, "UNTRUSTED_ORIGIN", "Origin request tidak diizinkan.") };
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { user: null, response: apiError(401, "UNAUTHENTICATED", "Silakan masuk.") };
  if (session.user.role !== "ADMIN") return { user: null, response: apiError(403, "FORBIDDEN", "Akses administrator diperlukan.") };
  return { user: session.user, response: null };
}

export async function requireUserRequest(request: Request) {
  if (!hasTrustedOrigin(request)) return { user: null, response: apiError(403, "UNTRUSTED_ORIGIN", "Origin request tidak diizinkan.") };
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { user: null, response: apiError(401, "UNAUTHENTICATED", "Silakan masuk untuk memberi rating.") };
  if (session.user.role !== "USER") return { user: null, response: apiError(403, "FORBIDDEN", "Fitur ini hanya tersedia untuk akun USER.") };
  return { user: session.user, response: null };
}

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isForeignKeyViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

export function isMissingRecord(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
