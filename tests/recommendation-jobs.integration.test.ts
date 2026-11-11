import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import "@/tests/helpers/test-database";

test("recommendation jobs enforce auth, atomic leases, retries, immutable snapshots, and unverified staging", async () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  Reflect.set(process.env, "AUTH_URL", "http://127.0.0.1:3105");
  Reflect.set(process.env, "FOODREC_WORKER_SECRET", "test-worker-secret-32-characters-minimum-000");
  const [{ default: next }, { readApplicationEnvironment }, { prisma }, { createRatingDatasetExport }, { readRatingExport }] = await Promise.all([
    import("next"),
    import("@/lib/env"),
    import("@/lib/prisma"),
    import("@/lib/food/rating-export"),
    import("@/lib/food/storage"),
  ]);
  const env = readApplicationEnvironment();
  const baseUrl = env.AUTH_URL;
  await prisma.recommendationJob.updateMany({
    where: { status: { in: ["PENDING", "RUNNING"] } },
    data: {
      status: "CANCELLED",
      finishedAt: new Date(),
      leaseExpiresAt: null,
      timeoutAt: null,
      errorSummary: "Cancelled by isolated integration test setup."
    }
  });
  const app = next({ dev: false, hostname: "127.0.0.1", port: 3105 });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3105, "127.0.0.1", resolve);
  });

  const api = (url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}${url}`, {
    method,
    headers: { origin: baseUrl, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual"
  });
  const workerHeaders = (workerId: string, leaseToken?: string, secret = "test-worker-secret-32-characters-minimum-000") => ({
    authorization: `Bearer ${secret}`,
    ...(leaseToken ? { "x-foodrec-lease-token": leaseToken } : {}),
    "x-foodrec-worker-id": workerId
  });
  const workerApi = (url: string, method: string, body: unknown, workerId: string, leaseToken?: string, secret?: string) =>
    api(url, method, body, workerHeaders(workerId, leaseToken, secret));
  const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  let snapshotFile: string | null = null;
  let originalSnapshot: Buffer | null = null;

  try {
    const unauthorized = await api("/api/internal/recommendation-jobs/claim", "POST", { workerId: "no-auth" });
    assert.equal(unauthorized.status, 401);
    const badSecret = await workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "bad-secret" }, "bad-secret", undefined, "wrong-secret-value-that-is-long-enough-000");
    assert.equal(badSecret.status, 401);

    const adminLogin = await api("/api/auth/sign-in/email", "POST", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(adminLogin.status, 200, await adminLogin.clone().text());
    const adminCookie = cookiesFrom(adminLogin);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: env.ADMIN_EMAIL } });
    const guestCreate = await api("/api/admin/recommendation-jobs", "POST", { datasetExportId: 1, kNeighbors: 3, topN: 1, idempotencyKey: randomUUID() });
    assert.equal(guestCreate.status, 401);

    const userA = await prisma.user.create({ data: { name: "Job fixture user A", email: `job-a-${randomUUID()}@example.test` } });
    const userB = await prisma.user.create({ data: { name: "Job fixture user B", email: `job-b-${randomUUID()}@example.test` } });
    const ratedFood = await prisma.food.create({ data: { foodCode: `JOB-${randomUUID().slice(0, 8)}`, name: "Job rated food", category: "Test", taste: "Test", origin: "Indonesia" } });
    const candidateFood = await prisma.food.create({ data: { foodCode: `JOB-${randomUUID().slice(0, 8)}`, name: "Job candidate food", category: "Test", taste: "Test", origin: "Indonesia" } });
    await prisma.rating.createMany({ data: [
      { userId: userA.id, foodId: ratedFood.id, rating: 5 },
      { userId: userB.id, foodId: ratedFood.id, rating: 5 },
      { userId: userB.id, foodId: candidateFood.id, rating: 4 }
    ] });
    const datasetExport = await createRatingDatasetExport(admin.id);
    const datasetMetadata = await prisma.datasetExport.findUniqueOrThrow({ where: { id: datasetExport.id }, select: { filePath: true } });
    originalSnapshot = await readRatingExport(datasetMetadata.filePath);
    const storageRoot = path.resolve(process.cwd(), "storage", env.FOODREC_STORAGE_DIR ?? "storage-test");
    snapshotFile = path.join(storageRoot, "rating-exports", datasetMetadata.filePath);
    const beforeBatches = await prisma.recommendationBatch.count();

    const idempotencyKey = randomUUID();
    const createPayload = { datasetExportId: datasetExport.id, kNeighbors: 3, topN: 1, idempotencyKey };
    const created = await api("/api/admin/recommendation-jobs", "POST", createPayload, { cookie: adminCookie });
    assert.equal(created.status, 201, await created.clone().text());
    const jobId = (await created.json()).data.id as string;
    const duplicate = await api("/api/admin/recommendation-jobs", "POST", createPayload, { cookie: adminCookie });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).data.id, jobId);
    const reusedKey = await api("/api/admin/recommendation-jobs", "POST", { ...createPayload, topN: 2 }, { cookie: adminCookie });
    assert.equal(reusedKey.status, 409);

    const incompatibleWorker = await workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "old-engine", engineVersion: "unsupported-engine" }, "old-engine");
    assert.equal(incompatibleWorker.status, 204);
    const [claimA, claimB] = await Promise.all([
      workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "worker-a" }, "worker-a"),
      workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "worker-b" }, "worker-b")
    ]);
    assert.deepEqual([claimA.status, claimB.status].sort(), [200, 204], `${await claimA.clone().text()} | ${await claimB.clone().text()}`);
    const claimResponse = claimA.status === 200 ? claimA : claimB;
    const workerId = claimA.status === 200 ? "worker-a" : "worker-b";
    const claim = (await claimResponse.json()).data;
    assert.equal(claim.id, jobId);
    assert.equal(claim.attemptCount, 1);
    assert.equal(claim.datasetChecksum, datasetExport.fileChecksum);
    const leaseToken = claim.leaseToken as string;

    const wrongLease = await workerApi(`/api/internal/recommendation-jobs/${jobId}/snapshot`, "GET", undefined, "other-worker", leaseToken);
    assert.equal(wrongLease.status, 409);
    const snapshotResponse = await workerApi(`/api/internal/recommendation-jobs/${jobId}/snapshot`, "GET", undefined, workerId, leaseToken);
    assert.equal(snapshotResponse.status, 200);
    assert.equal(snapshotResponse.headers.get("x-foodrec-snapshot-sha256"), datasetExport.fileChecksum);
    assert.deepEqual(Buffer.from(await snapshotResponse.arrayBuffer()), originalSnapshot);

    await writeFile(snapshotFile, Buffer.from("corrupt snapshot"));
    const corruptSnapshot = await workerApi(`/api/internal/recommendation-jobs/${jobId}/snapshot`, "GET", undefined, workerId, leaseToken);
    assert.equal(corruptSnapshot.status, 409);
    assert.equal((await corruptSnapshot.json()).error.code, "SNAPSHOT_CHECKSUM_MISMATCH");
    await writeFile(snapshotFile, originalSnapshot);

    const heartbeat = await workerApi(`/api/internal/recommendation-jobs/${jobId}/heartbeat`, "POST", {}, workerId, leaseToken);
    assert.equal(heartbeat.status, 200);
    const invalidResult = await workerApi(`/api/internal/recommendation-jobs/${jobId}/result`, "POST", {
      recommendations: [{ userId: userA.id, foodId: ratedFood.id, rank: 1, predictedRating: 5 }]
    }, workerId, leaseToken);
    assert.equal(invalidResult.status, 422);

    const resultPayload = { recommendations: [{ userId: userA.id, foodId: candidateFood.id, rank: 1, predictedRating: 4 }] };
    const result = await workerApi(`/api/internal/recommendation-jobs/${jobId}/result`, "POST", resultPayload, workerId, leaseToken);
    assert.equal(result.status, 201, await result.clone().text());
    const artifact = (await result.json()).data;
    assert.equal(artifact.status, "SUCCEEDED");
    assert.equal(artifact.verificationStatus, "UNVERIFIED");
    const duplicateResult = await workerApi(`/api/internal/recommendation-jobs/${jobId}/result`, "POST", resultPayload, workerId, leaseToken);
    assert.equal(duplicateResult.status, 200);
    assert.equal((await duplicateResult.json()).data.artifactId, artifact.artifactId);
    const status = await workerApi(`/api/internal/recommendation-jobs/${jobId}`, "GET", undefined, workerId, leaseToken);
    assert.equal((await status.json()).data.status, "SUCCEEDED");
    assert.equal(await prisma.recommendationBatch.count(), beforeBatches);
    await assert.rejects(prisma.recommendationJobArtifact.update({ where: { id: artifact.artifactId }, data: { verificationStatus: "PUBLISHED" } }));
    const publishAttempt = await api(`/api/admin/recommendation-batches/${artifact.artifactId}/publish`, "POST", {}, { cookie: adminCookie });
    assert.equal(publishAttempt.status, 400);

    const recoveryCreated = await api("/api/admin/recommendation-jobs", "POST", {
      datasetExportId: datasetExport.id,
      idempotencyKey: randomUUID(),
      kNeighbors: 3,
      topN: 1
    }, { cookie: adminCookie });
    assert.equal(recoveryCreated.status, 201, await recoveryCreated.clone().text());
    const recoveryJob = (await recoveryCreated.json()).data;
    const firstAttemptResponse = await workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "restart-worker-1" }, "restart-worker-1");
    const firstAttempt = (await firstAttemptResponse.json()).data;
    assert.equal(firstAttempt.id, recoveryJob.id);
    await prisma.recommendationJob.update({ where: { id: firstAttempt.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    const recoveredResponse = await workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "restart-worker-2" }, "restart-worker-2");
    const recovered = (await recoveredResponse.json()).data;
    assert.equal(recovered.id, recoveryJob.id);
    assert.equal(recovered.attemptCount, 2);
    assert.notEqual(recovered.leaseToken, firstAttempt.leaseToken);
    const staleHeartbeat = await workerApi(`/api/internal/recommendation-jobs/${recovered.id}/heartbeat`, "POST", {}, "restart-worker-1", firstAttempt.leaseToken);
    assert.equal(staleHeartbeat.status, 409);

    const retry = await workerApi(`/api/internal/recommendation-jobs/${recovered.id}/fail`, "POST", { code: "ENGINE_ERROR" }, "restart-worker-2", recovered.leaseToken);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).data.status, "PENDING");
    await prisma.recommendationJob.update({ where: { id: recovered.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    const thirdAttemptResponse = await workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "restart-worker-3" }, "restart-worker-3");
    const thirdAttempt = (await thirdAttemptResponse.json()).data;
    assert.equal(thirdAttempt.id, recoveryJob.id);
    assert.equal(thirdAttempt.attemptCount, 3);
    await prisma.recommendationJob.update({ where: { id: thirdAttempt.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000), timeoutAt: new Date(Date.now() - 1000) } });
    const timeout = await workerApi(`/api/internal/recommendation-jobs/${thirdAttempt.id}/fail`, "POST", { code: "TIMEOUT" }, "restart-worker-3", thirdAttempt.leaseToken);
    assert.equal(timeout.status, 200);
    assert.equal((await timeout.json()).data.status, "FAILED");
    assert.equal(await prisma.recommendationJob.count({ where: { id: thirdAttempt.id, status: "FAILED", attemptCount: 3 } }), 1);
    const failedMonitorResponse = await api("/api/admin/recommendation-engine", "GET", undefined, { cookie: adminCookie });
    assert.equal(failedMonitorResponse.status, 200);
    const failedJob = (await failedMonitorResponse.json()).data.recentJobs.find((job: { id: string }) => job.id === thirdAttempt.id);
    assert.equal(failedJob.status, "FAILED");
    assert.equal(failedJob.errorSummary, "Worker attempt timed out.");
    assert.doesNotMatch(failedJob.errorSummary, /[A-Z]:\\|\/home\/|traceback|exception:/i);

    const noPendingWork = await workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "idle-worker" }, "idle-worker");
    assert.equal(noPendingWork.status, 204);

    const cancelCreated = await api("/api/admin/recommendation-jobs", "POST", {
      datasetExportId: datasetExport.id,
      idempotencyKey: randomUUID(),
      kNeighbors: 3,
      topN: 1
    }, { cookie: adminCookie });
    assert.equal(cancelCreated.status, 201);
    const cancelJobId = (await cancelCreated.json()).data.id as string;
    const cancelled = await api(`/api/admin/recommendation-jobs/${cancelJobId}/cancel`, "POST", {}, { cookie: adminCookie });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).data.status, "CANCELLED");
    const cancelledDuplicate = await api(`/api/admin/recommendation-jobs/${cancelJobId}/cancel`, "POST", {}, { cookie: adminCookie });
    assert.equal((await cancelledDuplicate.json()).data.idempotent, true);
  } finally {
    if (snapshotFile && originalSnapshot) await writeFile(snapshotFile, originalSnapshot).catch(() => undefined);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    await prisma.$disconnect();
  }
});
