import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/food/http";
import { readWorkerEnvironment } from "@/lib/env";

const workerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function authorizeWorker(request: Request) {
  let secret: string;
  try {
    secret = readWorkerEnvironment().FOODREC_WORKER_SECRET;
  } catch {
    return apiError(503, "WORKER_AUTH_NOT_CONFIGURED", "Internal worker authentication is not configured.");
  }
  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) return apiError(401, "WORKER_UNAUTHENTICATED", "Worker authentication required.");
  const expected = createHash("sha256").update(secret, "utf8").digest();
  const provided = createHash("sha256").update(match[1]!, "utf8").digest();
  if (!timingSafeEqual(provided, expected)) {
    return apiError(401, "WORKER_UNAUTHENTICATED", "Worker authentication required.");
  }
  return null;
}

export function workerIdentity(request: Request) {
  const workerId = request.headers.get("x-foodrec-worker-id") ?? "";
  const leaseToken = request.headers.get("x-foodrec-lease-token") ?? "";
  if (!workerIdPattern.test(workerId) || !uuidPattern.test(leaseToken)) {
    return { error: apiError(422, "INVALID_WORKER_LEASE", "Worker ID or lease token is invalid.") };
  }
  return { workerId, leaseToken };
}

export function validWorkerId(value: unknown): value is string {
  return typeof value === "string" && workerIdPattern.test(value);
}
