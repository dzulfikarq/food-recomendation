import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "@/tests/helpers/test-database";

test("rating revisions, locked scheduler, config gate, worker status, and stale result monitoring", async () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  Reflect.set(process.env, "AUTH_URL", "http://127.0.0.1:3106");
  Reflect.set(process.env, "FOODREC_WORKER_SECRET", "test-worker-secret-32-characters-minimum-000");
  const [{ default: next }, { hashPassword }, { readApplicationEnvironment }, { prisma }] = await Promise.all([
    import("next"),
    import("better-auth/crypto"),
    import("@/lib/env"),
    import("@/lib/prisma")
  ]);
  const env = readApplicationEnvironment();
  const baseUrl = env.AUTH_URL;
  const app = next({ dev: false, hostname: "127.0.0.1", port: 3106 });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3106, "127.0.0.1", resolve);
  });

  const api = (url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}${url}`, {
    method,
    headers: { origin: baseUrl, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual"
  });
  const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  const workerHeaders = (workerId: string, leaseToken?: string) => ({
    authorization: "Bearer test-worker-secret-32-characters-minimum-000",
    "x-foodrec-worker-id": workerId,
    ...(leaseToken ? { "x-foodrec-lease-token": leaseToken } : {})
  });
  const workerApi = (url: string, method: string, body: unknown, workerId: string, leaseToken?: string) =>
    api(url, method, body, workerHeaders(workerId, leaseToken));

  let userIds: number[] = [];
  let foodIds: number[] = [];
  try {
    await prisma.recommendationEngineConfig.update({
      where: { id: 1 },
      data: { autoProcessingEnabled: false, automaticPublicationEnabled: false, validationStatus: "PENDING_VALIDATION", kNeighbors: 3, topN: 5, scheduleIntervalMinutes: 30, nextScheduleAt: new Date(0) }
    });

    const adminLogin = await api("/api/auth/sign-in/email", "POST", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(adminLogin.status, 200, await adminLogin.clone().text());
    const adminCookie = cookiesFrom(adminLogin);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: env.ADMIN_EMAIL } });

    const configResponse = await api("/api/admin/recommendation-engine", "GET", undefined, { cookie: adminCookie });
    assert.equal(configResponse.status, 200);
    const initialStatus = (await configResponse.json()).data;
    assert.equal(initialStatus.configuration.autoProcessingEnabled, false);
    assert.equal(initialStatus.configuration.automaticPublicationEnabled, false);
    assert.equal(initialStatus.configuration.kNeighbors, 3);
    assert.equal(initialStatus.configuration.topN, 5);
    assert.equal(initialStatus.configuration.scheduleIntervalMinutes, 30);
    assert.equal(initialStatus.configuration.engineVersion, "python-ubcf-v1");
    assert.equal(initialStatus.configuration.validationStatus, "PENDING_VALIDATION");
    assert.equal(initialStatus.configuration.parameterDefaultsAreResearchOptimized, false);
    assert.equal(initialStatus.validationGate.open, false);

    const updatedConfig = await api("/api/admin/recommendation-engine", "PATCH", { kNeighbors: 4, topN: 2, scheduleIntervalMinutes: 45 }, { cookie: adminCookie });
    assert.equal(updatedConfig.status, 200);
    const configured = (await updatedConfig.json()).data;
    assert.equal(configured.kNeighbors, 4);
    assert.equal(configured.topN, 2);
    assert.equal(configured.scheduleIntervalMinutes, 45);
    assert.equal(configured.autoProcessingEnabled, false);
    assert.equal((await api("/api/admin/recommendation-engine", "PATCH", { autoProcessingEnabled: true }, { cookie: adminCookie })).status, 422);
    assert.equal((await api("/api/admin/recommendation-engine", "PATCH", { automaticPublicationEnabled: true }, { cookie: adminCookie })).status, 422);
    assert.equal((await api("/api/admin/recommendation-engine", "PATCH", { validationStatus: "VALIDATED" }, { cookie: adminCookie })).status, 422);
    await assert.rejects(prisma.recommendationEngineConfig.update({ where: { id: 1 }, data: { autoProcessingEnabled: true } }));
    await assert.rejects(prisma.recommendationEngineConfig.update({ where: { id: 1 }, data: { automaticPublicationEnabled: true } }));
    await assert.rejects(prisma.recommendationEngineConfig.update({ where: { id: 1 }, data: { validationStatus: "VALIDATED" } }));
    await prisma.recommendationEngineConfig.update({ where: { id: 1 }, data: { kNeighbors: 3, topN: 5, scheduleIntervalMinutes: 30, nextScheduleAt: new Date(0) } });

    const userA = await prisma.user.create({ data: { name: "Automation user A", email: `auto-a-${randomUUID()}@example.test` } });
    const userB = await prisma.user.create({ data: { name: "Automation user B", email: `auto-b-${randomUUID()}@example.test` } });
    userIds = [userA.id, userB.id];
    await Promise.all([userA, userB].map(async (user) => prisma.account.create({
      data: { accountId: String(user.id), providerId: "credential", userId: user.id, password: await hashPassword("automation-integration-password") }
    })));
    const userLogin = await api("/api/auth/sign-in/email", "POST", { email: userA.email, password: "automation-integration-password" });
    assert.equal(userLogin.status, 200);
    const userCookie = cookiesFrom(userLogin);
    const ratedFood = await prisma.food.create({ data: {
      foodCode: `AUTO-${randomUUID().slice(0, 8)}`,
      name: "Automation rated food",
      category: "Test",
      taste: "Test",
      origin: "Indonesia"
    } });
    const candidateFood = await prisma.food.create({ data: {
      foodCode: `AUTO-${randomUUID().slice(0, 8)}`,
      name: "Automation candidate food",
      category: "Test",
      taste: "Test",
      origin: "Indonesia"
    } });
    foodIds = [ratedFood.id, candidateFood.id];
    await prisma.rating.createMany({ data: [
      { userId: userB.id, foodId: ratedFood.id, rating: 5 },
      { userId: userB.id, foodId: candidateFood.id, rating: 4 }
    ] });
    const createdRating = await api(`/api/foods/${ratedFood.id}/rating`, "PUT", { rating: 5 }, { cookie: userCookie });
    assert.equal(createdRating.status, 200);
    const revisionBeforeScheduler = (await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision;
    assert.ok(revisionBeforeScheduler > (await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).processedRevision);

    const [scheduleA, scheduleB] = await Promise.all([
      workerApi("/api/internal/recommendation-jobs/schedule", "POST", { workerId: "schedule-worker-a", engineVersion: "python-ubcf-v1" }, "schedule-worker-a"),
      workerApi("/api/internal/recommendation-jobs/schedule", "POST", { workerId: "schedule-worker-b", engineVersion: "python-ubcf-v1" }, "schedule-worker-b")
    ]);
    assert.equal(scheduleA.status, 200);
    assert.equal(scheduleB.status, 200);
    const outcomes = [(await scheduleA.json()).data, (await scheduleB.json()).data];
    assert.deepEqual(outcomes.map((outcome) => outcome.reason).sort(), ["NOT_DUE", "VALIDATION_GATE_CLOSED"]);
    assert.equal(outcomes.filter((outcome) => outcome.scheduled).length, 0);
    assert.equal(await prisma.recommendationJob.count({ where: { trigger: "AUTO_RATING_CHANGE" } }), 0);

    const exportResponse = await api("/api/admin/rating-datasets", "POST", undefined, { cookie: adminCookie });
    assert.equal(exportResponse.status, 201, await exportResponse.clone().text());
    const dataset = (await exportResponse.json()).data;
    assert.equal(dataset.ratingRevision, revisionBeforeScheduler.toString());
    await assert.rejects(prisma.recommendationJob.create({
      data: {
        datasetExportId: dataset.id,
        createdByAdminId: admin.id,
        trigger: "AUTO_RATING_CHANGE",
        idempotencyKey: randomUUID(),
        automaticDedupeKey: "a".repeat(64),
        engineVersion: "python-ubcf-v1",
        parameters: { kNeighbors: 3, topN: 1, minCommonRatings: 1, similarityStrategy: "overlap", activeFoodIds: foodIds },
        maxAttempts: 3,
        timeoutSeconds: 900
      }
    }));
    const createJob = await api("/api/admin/recommendation-jobs", "POST", {
      datasetExportId: dataset.id,
      kNeighbors: 3,
      topN: 1,
      idempotencyKey: randomUUID()
    }, { cookie: adminCookie });
    assert.equal(createJob.status, 201, await createJob.clone().text());
    const jobId = (await createJob.json()).data.id as string;
    const claimResponse = await workerApi("/api/internal/recommendation-jobs/claim", "POST", { workerId: "stale-result-worker" }, "stale-result-worker");
    assert.equal(claimResponse.status, 200);
    const claim = (await claimResponse.json()).data;
    assert.equal(claim.id, jobId);

    const changedRating = await api(`/api/foods/${ratedFood.id}/rating`, "PUT", { rating: 4 }, { cookie: userCookie });
    assert.equal(changedRating.status, 200);
    const changedRevision = (await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision;
    assert.equal(changedRevision, revisionBeforeScheduler + BigInt(1));
    const batchCount = await prisma.recommendationBatch.count();
    const resultResponse = await workerApi(`/api/internal/recommendation-jobs/${jobId}/result`, "POST", {
      recommendations: [{ userId: userA.id, foodId: candidateFood.id, rank: 1, predictedRating: 4 }]
    }, "stale-result-worker", claim.leaseToken);
    assert.equal(resultResponse.status, 201, await resultResponse.clone().text());
    const result = (await resultResponse.json()).data;
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.verificationStatus, "UNVERIFIED");
    assert.equal(result.isStale, true, JSON.stringify(result));
    assert.equal(result.sourceRatingRevision, revisionBeforeScheduler.toString());
    assert.equal(result.currentRatingRevision, changedRevision.toString());
    assert.equal(await prisma.recommendationBatch.count(), batchCount);
    const automaticPublish = await api(`/api/admin/recommendation-batches/${result.artifactId}/publish`, "POST", {}, { cookie: adminCookie });
    assert.equal(automaticPublish.status, 400);
    assert.ok(await prisma.recommendationEngineConfig.findUniqueOrThrow({ where: { id: 1 } }).then((config) => config.lastSuccessfulProcessingAt));

    const nextSchedulerCheck = await workerApi("/api/internal/recommendation-jobs/schedule", "POST", { workerId: "schedule-worker-c", engineVersion: "python-ubcf-v1" }, "schedule-worker-c");
    assert.equal(nextSchedulerCheck.status, 200);
    const notDueOutcome = (await nextSchedulerCheck.json()).data;
    assert.equal(notDueOutcome.reason, "NOT_DUE");
    const afterResultState = await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(
      notDueOutcome.datasetDirty,
      true,
      `scheduler reports dirty dataset: ${JSON.stringify({ currentRevision: afterResultState.currentRevision.toString(), processedRevision: afterResultState.processedRevision.toString() })}`
    );
    assert.equal(await prisma.recommendationJob.count({ where: { trigger: "AUTO_RATING_CHANGE" } }), 0);

    await prisma.recommendationWorker.update({ where: { workerId: "schedule-worker-a" }, data: { lastSeenAt: new Date(Date.now() - 120_000) } });
    const monitorResponse = await api("/api/admin/recommendation-engine", "GET", undefined, { cookie: adminCookie });
    assert.equal(monitorResponse.status, 200);
    const monitor = (await monitorResponse.json()).data;
    assert.equal(monitor.dataset.dirty, true, "admin monitor reports dirty dataset");
    assert.equal(monitor.validationGate.status, "PENDING_VALIDATION");
    assert.equal(monitor.validationGate.open, false);
    assert.equal(monitor.validationGate.reasons.includes("MATHEMATICAL_PARITY_PENDING_VALIDATION"), true, "monitor explains pending parity gate");
    assert.equal(monitor.workers.find((worker: { workerId: string }) => worker.workerId === "schedule-worker-a").online, false);
    assert.equal(monitor.workers.find((worker: { workerId: string }) => worker.workerId === "schedule-worker-c").online, true, "recent scheduler worker heartbeat is online");
    assert.equal(typeof monitor.jobs.pending, "number");
    assert.equal(typeof monitor.jobs.running, "number");
    assert.equal(typeof monitor.jobs.failed, "number");

    await prisma.ratingDatasetState.update({ where: { id: 1 }, data: { processedRevision: changedRevision } });
    await prisma.recommendationEngineConfig.update({ where: { id: 1 }, data: { nextScheduleAt: new Date(0) } });
    const cleanScheduler = await workerApi("/api/internal/recommendation-jobs/schedule", "POST", { workerId: "clean-scheduler-worker", engineVersion: "python-ubcf-v1" }, "clean-scheduler-worker");
    assert.equal(cleanScheduler.status, 200);
    const cleanOutcome = (await cleanScheduler.json()).data;
    assert.equal(cleanOutcome.reason, "DATASET_CLEAN");
    assert.equal(cleanOutcome.datasetDirty, false);
    assert.equal(await prisma.recommendationJob.count({ where: { trigger: "AUTO_RATING_CHANGE" } }), 0);
  } finally {
    if (userIds.length && foodIds.length) {
      await prisma.rating.deleteMany({ where: { userId: { in: userIds }, foodId: { in: foodIds } } });
      await prisma.food.updateMany({ where: { id: { in: foodIds } }, data: { firstUsedAt: null } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (foodIds.length) await prisma.food.deleteMany({ where: { id: { in: foodIds } } });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    await prisma.$disconnect();
  }
});
