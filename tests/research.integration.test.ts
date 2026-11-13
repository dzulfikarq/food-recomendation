import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import "@/tests/helpers/test-database";

test("research consent, isolated rating, export snapshot, and withdrawal lifecycle", async () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  Reflect.set(process.env, "AUTH_URL", "http://127.0.0.1:3107");
  const [{ default: next }, { hashPassword }, { readApplicationEnvironment }, { prisma }] = await Promise.all([
    import("next"), import("better-auth/crypto"), import("@/lib/env"), import("@/lib/prisma")
  ]);
  const env = readApplicationEnvironment();
  const baseUrl = env.AUTH_URL;
  const suffix = randomUUID();
  const accounts = [
    { name: "Research Participant A", email: `research-a-${suffix}@example.test`, password: "research-integration-password" },
    { name: "Research Participant B", email: `research-b-${suffix}@example.test`, password: "research-integration-password" },
    { name: "Research Participant C", email: `research-c-${suffix}@example.test`, password: "research-integration-password" }
  ];
  let studyId: number | undefined;
  const app = next({ dev: false, hostname: "127.0.0.1", port: 3107 });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3107, "127.0.0.1", resolve);
  });
  const api = (path: string, method = "GET", body?: unknown, cookie?: string) => fetch(`${baseUrl}${path}`, {
    method,
    headers: { origin: baseUrl, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual"
  });
  const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");

  try {
    const beforeAppRatings = await prisma.rating.count();
    const beforeRevision = (await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision;
    assert.equal((await api("/api/research/participant/complete", "POST", { studyId: 1 })).status, 401);

    const cookies: string[] = [];
    for (const account of accounts) {
      const user = await prisma.user.create({ data: { name: account.name, email: account.email, emailVerified: true } });
      await prisma.account.create({ data: { accountId: String(user.id), providerId: "credential", userId: user.id, password: await hashPassword(account.password) } });
      const login = await api("/api/auth/sign-in/email", "POST", { email: account.email, password: account.password });
      assert.equal(login.status, 200);
      cookies.push(cookiesFrom(login));
    }
    const adminLogin = await api("/api/auth/sign-in/email", "POST", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(adminLogin.status, 200);
    const adminCookie = cookiesFrom(adminLogin);
    assert.equal((await api("/api/admin/research/dashboard", "GET", undefined, cookies[0])).status, 403);
    assert.equal((await api("/api/research/ratings?studyId=1", "GET", undefined, adminCookie)).status, 403);

    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const closesAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    const createdStudy = await api("/api/admin/research/studies", "POST", {
      title: `Studi Uji ${suffix.slice(0, 8)}`,
      description: "Pengumpulan rating secara sukarela untuk pengujian alur penelitian.",
      purpose: "Memvalidasi alur pengumpulan data penelitian.",
      dataCollected: "Rating makanan integer 1–5 dan waktu pengiriman.",
      dataUse: "Pengujian alur penelitian terisolasi.",
      withdrawalInstructions: "Tarik partisipasi dari halaman penelitian atau hubungi kontak.",
      consentVersion: "v1",
      consentDocument: "Saya memahami penjelasan penelitian dan bersedia ikut secara sukarela.",
      contactName: "Penanggung Jawab Uji",
      contactEmail: "research@example.test",
      startsAt,
      closesAt,
      retentionUntil: new Date(Date.now() + 370 * 24 * 60 * 60_000).toISOString(),
      retentionPolicy: "Data disimpan sampai batas retensi yang ditetapkan, lalu pemilik studi meninjau dan menghapus data sesuai kebijakan ini."
    }, adminCookie);
    assert.equal(createdStudy.status, 201, await createdStudy.clone().text());
    studyId = (await createdStudy.json()).data.id as number;
    assert.equal((await api(`/api/admin/research/studies/${studyId}/status`, "POST", { status: "OPEN" }, cookies[0])).status, 403);
    const opened = await api(`/api/admin/research/studies/${studyId}/status`, "POST", { status: "OPEN" }, adminCookie);
    assert.equal(opened.status, 200, await opened.clone().text());
    const conflictingStudyResponse = await api("/api/admin/research/studies", "POST", {
      title: `Concurrent Study ${suffix.slice(0, 8)}`,
      description: "Study used to verify single OPEN constraint.", purpose: "Verify the one-open-study guard.",
      dataCollected: "No responses are collected.", dataUse: "Constraint test only.",
      withdrawalInstructions: "No participant data is collected.", consentVersion: "v1",
      consentDocument: "Participation is voluntary.", contactName: "Test Contact", contactEmail: "research@example.test",
      startsAt, closesAt, retentionUntil: new Date(Date.now() + 370 * 24 * 60 * 60_000).toISOString(),
      retentionPolicy: "Test data retention policy."
    }, adminCookie);
    assert.equal(conflictingStudyResponse.status, 201);
    const conflictingStudyId = (await conflictingStudyResponse.json()).data.id as number;
    assert.equal((await api(`/api/admin/research/studies/${conflictingStudyId}/status`, "POST", { status: "OPEN" }, adminCookie)).status, 409);

    const foodA = await prisma.food.create({ data: { foodCode: `RESEARCH-A-${suffix.slice(0, 8)}`, name: "Research Food A", category: "Uji", taste: "Gurih", origin: "Uji" } });
    const foodB = await prisma.food.create({ data: { foodCode: `RESEARCH-B-${suffix.slice(0, 8)}`, name: "Research Food B", category: "Uji", taste: "Manis", origin: "Uji" } });

    assert.equal((await api("/api/research/consent", "POST", { studyId, version: "v1", accepted: true })).status, 401);
    assert.equal((await api("/api/research/ratings", "POST", { studyId, foodId: foodA.id, rating: 5, tried: true, idempotencyKey: randomUUID() }, cookies[0])).status, 403);
    assert.equal((await api("/api/research/consent", "POST", { studyId, version: "v1", accepted: false }, cookies[0])).status, 422);
    const acceptedA = await api("/api/research/consent", "POST", { studyId, version: "v1", accepted: true }, cookies[0]);
    assert.equal(acceptedA.status, 200, await acceptedA.clone().text());
    const participantA = (await acceptedA.json()).data.participantId as number;
    const consentEvidenceA = await prisma.researchConsent.findUniqueOrThrow({ where: { participantId_version: { participantId: participantA, version: "v1" } } });
    assert.match(consentEvidenceA.documentText, /sukarela/);
    assert.ok(consentEvidenceA.acceptedAt);

    const firstKey = randomUUID();
    const badRating = await api("/api/research/ratings", "POST", { studyId, foodId: foodA.id, rating: 6, tried: true, idempotencyKey: randomUUID() }, cookies[0]);
    assert.equal(badRating.status, 422);
    const untried = await api("/api/research/ratings", "POST", { studyId, foodId: foodA.id, rating: 5, tried: false, idempotencyKey: randomUUID() }, cookies[0]);
    assert.equal(untried.status, 422);
    const firstRating = await api("/api/research/ratings", "POST", { studyId, foodId: foodA.id, rating: 5, tried: true, idempotencyKey: firstKey }, cookies[0]);
    assert.equal(firstRating.status, 200, await firstRating.clone().text());
    const repeatedRating = await api("/api/research/ratings", "POST", { studyId, foodId: foodA.id, rating: 5, tried: true, idempotencyKey: firstKey }, cookies[0]);
    assert.equal(repeatedRating.status, 200);
    assert.equal((await prisma.researchRating.count({ where: { participantId: participantA, foodId: foodA.id } })), 1);
    assert.equal((await prisma.researchRating.findUniqueOrThrow({ where: { participantId_foodId: { participantId: participantA, foodId: foodA.id } } })).source, "CONSENTED_USER_ACTION");

    const wrongVersion = await api(`/api/admin/research/studies/${studyId}`, "PATCH", { title: "Judul berubah tanpa versi baru" }, adminCookie);
    assert.equal(wrongVersion.status, 422);
    const changedVersion = await api(`/api/admin/research/studies/${studyId}`, "PATCH", { title: `Studi Uji ${suffix.slice(0, 8)} v2`, consentVersion: "v2", consentDocument: "Versi v2: saya memahami perubahan dan setuju secara sukarela." }, adminCookie);
    assert.equal(changedVersion.status, 200, await changedVersion.clone().text());
    assert.equal((await api(`/api/research/ratings?studyId=${studyId}`, "GET", undefined, cookies[0])).status, 403, "v1 consent must not transfer to v2");
    const acceptedA2 = await api("/api/research/consent", "POST", { studyId, version: "v2", accepted: true }, cookies[0]);
    assert.equal(acceptedA2.status, 200);
    assert.equal((await api(`/api/research/ratings?studyId=${studyId}`, "GET", undefined, cookies[0])).status, 200);
    const participantBConsent = await api("/api/research/consent", "POST", { studyId, version: "v2", accepted: true }, cookies[1]);
    assert.equal(participantBConsent.status, 200);
    const participantB = (await participantBConsent.json()).data.participantId as number;
    const reusedConsentVersion = await api(`/api/admin/research/studies/${studyId}`, "PATCH", { consentVersion: "v1" }, adminCookie);
    assert.equal(reusedConsentVersion.status, 409, "a prior consent version must not silently reactivate old consent");

    const beforeConsentA = await api(`/api/research/ratings?studyId=${studyId}`, "GET", undefined, cookies[0]);
    const beforeConsentFoods = (await beforeConsentA.json()).data.foods as { id: number; rating: number | null }[];
    assert.equal(beforeConsentFoods.find((food) => food.id === foodA.id)?.rating, null, "prior-consent rating is not presented as v2 data");
    const rateA2 = await api("/api/research/ratings", "POST", { studyId, foodId: foodA.id, rating: 4, tried: true, idempotencyKey: randomUUID() }, cookies[0]);
    assert.equal(rateA2.status, 200);
    const rateA2Update = await api("/api/research/ratings", "POST", { studyId, foodId: foodA.id, rating: 3, tried: true, idempotencyKey: randomUUID() }, cookies[0]);
    assert.equal(rateA2Update.status, 200);
    const rateB = await api("/api/research/ratings", "POST", { studyId, foodId: foodB.id, rating: 2, tried: true, idempotencyKey: randomUUID() }, cookies[1]);
    assert.equal(rateB.status, 200);
    const ownRatingsB = await api(`/api/research/ratings?studyId=${studyId}`, "GET", undefined, cookies[1]);
    const bFoods = (await ownRatingsB.json()).data.foods as { id: number; rating: number | null }[];
    assert.equal(bFoods.find((food) => food.id === foodA.id)?.rating, null, "participant B cannot read participant A rating");
    assert.equal(bFoods.find((food) => food.id === foodB.id)?.rating, 2);

    const exportResponse = await api(`/api/admin/research/studies/${studyId}/exports`, "POST", undefined, adminCookie);
    assert.equal(exportResponse.status, 201, await exportResponse.clone().text());
    const exportOne = (await exportResponse.json()).data as { id: number; version: number; ratingCount: number; fileChecksum: string; participantCount: number };
    assert.equal(exportOne.version, 1);
    assert.equal(exportOne.ratingCount, 2);
    assert.equal(exportOne.participantCount, 2);
    const exportDownload = await api(`/api/admin/research/exports/${exportOne.id}/download`, "GET", undefined, adminCookie);
    assert.equal(exportDownload.status, 200);
    const csv = await exportDownload.text();
    assert.match(csv, /^user_id,food_id,rating\r\n/);
    assert.match(csv, new RegExp(`^${participantA},${foodA.id},3$`, "m"));
    assert.match(csv, new RegExp(`^${participantB},${foodB.id},2$`, "m"));
    assert.equal(csv.includes(accounts[0].email), false);
    assert.equal(csv.includes(accounts[1].email), false);
    assert.equal(csv.includes("Research Participant A"), false);
    const manifestResponse = await api(`/api/admin/research/exports/${exportOne.id}/manifest`, "GET", undefined, adminCookie);
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.data.sha256, exportOne.fileChecksum);
    assert.equal(manifest.data.ratingCount, 2);
    assert.equal(manifest.data.studyId, studyId);
    assert.match(manifest.data.sourceStatus, /not independently verified/);
    assert.equal("filePath" in manifest.data, false);
    assert.equal(createHash("sha256").update(csv).digest("hex"), exportOne.fileChecksum);
    assert.match(exportDownload.headers.get("cache-control") ?? "", /private, no-store/);
    assert.match(manifestResponse.headers.get("cache-control") ?? "", /private, no-store/);
    assert.equal((await api(`/api/admin/research/exports/${exportOne.id}/download`)).status, 401);
    assert.equal((await api(`/api/admin/research/exports/${exportOne.id}/manifest`, "GET", undefined, cookies[0])).status, 403);
    assert.equal((await api(`/api/admin/research/studies/${studyId}/exports`, "POST", undefined, cookies[0])).status, 403);
    const crossOriginConsent = await fetch(`${baseUrl}/api/research/consent`, {
      method: "POST",
      headers: { origin: "https://untrusted.example", "content-type": "application/json", cookie: cookies[2] },
      body: JSON.stringify({ studyId, version: "v2", accepted: true })
    });
    assert.equal(crossOriginConsent.status, 403);

    const appRatingsDuring = await prisma.rating.count();
    const revisionDuring = (await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision;
    assert.equal(appRatingsDuring, beforeAppRatings);
    assert.equal(revisionDuring, beforeRevision);
    assert.equal(await prisma.researchRatingChange.count({ where: { participantId: participantA, consentVersion: "v2" } }), 2);

    const withdrawal = await api("/api/research/participant/withdraw", "POST", { studyId }, cookies[0]);
    assert.equal(withdrawal.status, 200);
    const pendingExport = await prisma.researchExport.findUniqueOrThrow({ where: { id: exportOne.id } });
    assert.equal(pendingExport.status, "REVOCATION_REQUIRED");
    assert.equal((await api(`/api/admin/research/exports/${exportOne.id}/download`, "GET", undefined, adminCookie)).status, 410);
    assert.equal((await api("/api/admin/research/withdrawals/1/process", "POST", {}, cookies[0])).status, 403);

    const exportTwoResponse = await api(`/api/admin/research/studies/${studyId}/exports`, "POST", undefined, adminCookie);
    assert.equal(exportTwoResponse.status, 201, await exportTwoResponse.clone().text());
    const exportTwo = (await exportTwoResponse.json()).data as { id: number; version: number; ratingCount: number; participantCount: number };
    assert.equal(exportTwo.version, 2);
    assert.equal(exportTwo.ratingCount, 1);
    assert.equal(exportTwo.participantCount, 1);
    const exportTwoCsv = await (await api(`/api/admin/research/exports/${exportTwo.id}/download`, "GET", undefined, adminCookie)).text();
    const exportTwoUserIds = exportTwoCsv.trim().split(/\r?\n/).slice(1).map((row) => row.split(",", 1)[0]);
    assert.equal(exportTwoUserIds.includes(String(participantA)), false);
    assert.match(exportTwoCsv, new RegExp(`^${participantB},${foodB.id},2$`, "m"));

    const dashboard = await api(`/api/admin/research/dashboard?studyId=${studyId}`, "GET", undefined, adminCookie);
    assert.equal(dashboard.status, 200);
    const dashboardData = (await dashboard.json()).data;
    assert.equal(dashboardData.statistics.ratings, 1);
    assert.equal(dashboardData.statistics.participantsWithRatings, 1);
    assert.equal(dashboardData.pendingWithdrawals.length, 1);
    assert.equal("email" in dashboardData.pendingWithdrawals[0], false);

    const withdrawalId = (await prisma.researchWithdrawal.findUniqueOrThrow({ where: { participantId: participantA } })).id;
    const processed = await api(`/api/admin/research/withdrawals/${withdrawalId}/process`, "POST", {}, adminCookie);
    assert.equal(processed.status, 200, await processed.clone().text());
    assert.equal(await prisma.researchRating.count({ where: { participantId: participantA } }), 0);
    assert.equal(await prisma.researchRatingChange.count({ where: { participantId: participantA } }), 0);
    assert.equal((await prisma.researchParticipant.findUniqueOrThrow({ where: { id: participantA } })).status, "WITHDRAWN");
    await assert.rejects(prisma.researchParticipant.update({ where: { id: participantA }, data: { status: "ACTIVE", withdrawalRequestedAt: null, withdrawnAt: null } }));
    await assert.rejects(prisma.researchRatingChange.deleteMany({ where: { participantId: participantB } }));
    await assert.rejects(prisma.researchExportParticipant.deleteMany({ where: { exportId: exportTwo.id } }));
    assert.equal(await prisma.researchRating.count({ where: { participantId: participantB } }), 1);

    const revoked = await api(`/api/admin/research/exports/${exportOne.id}/revoke`, "POST", { note: "Penerima diberi tahu agar berhenti menggunakan salinan.", externalRecipientsNotified: true }, adminCookie);
    assert.equal(revoked.status, 200, await revoked.clone().text());
    assert.equal((await prisma.researchExport.findUniqueOrThrow({ where: { id: exportOne.id } })).status, "REVOKED");
    assert.equal((await prisma.researchExportRevocation.findUnique({ where: { exportId: exportOne.id } }))?.externalRecipientsNotified, true);
    assert.equal((await api(`/api/admin/research/exports/${exportOne.id}/download`, "GET", undefined, adminCookie)).status, 410);

    const completeB = await api("/api/research/participant/complete", "POST", { studyId }, cookies[1]);
    assert.equal(completeB.status, 200);
    const consentC = await api("/api/research/consent", "POST", { studyId, version: "v2", accepted: true }, cookies[2]);
    assert.equal(consentC.status, 200);
    const completeWithoutRatings = await api("/api/research/participant/complete", "POST", { studyId }, cookies[2]);
    assert.equal(completeWithoutRatings.status, 200, "zero ratings must not block session completion");
    assert.equal((await prisma.researchParticipant.findUniqueOrThrow({ where: { id: (await consentC.json()).data.participantId } })).status, "COMPLETED");
    assert.equal((await api("/api/research/ratings", "POST", { studyId, foodId: foodB.id, rating: 1, tried: true, idempotencyKey: randomUUID() }, cookies[1])).status, 409);
    assert.equal((await api(`/api/admin/research/studies/${studyId}/status`, "POST", { status: "CLOSED" }, adminCookie)).status, 200);
    assert.equal((await api("/api/research/ratings", "POST", { studyId, foodId: foodB.id, rating: 1, tried: true, idempotencyKey: randomUUID() }, cookies[1])).status, 409);
    assert.equal((await api(`/api/admin/research/studies/${studyId}`, "PATCH", { title: "Tidak boleh ubah closed" }, adminCookie)).status, 409);
    assert.equal((await api(`/api/admin/research/studies/${studyId}/status`, "POST", { status: "ARCHIVED" }, adminCookie)).status, 200);
    assert.equal(await prisma.rating.count(), beforeAppRatings);
    assert.equal((await prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } })).currentRevision, beforeRevision);
  } finally {
    if (studyId) {
      const study = await prisma.researchStudy.findUnique({ where: { id: studyId } }).catch(() => null);
      if (study?.status === "OPEN") await prisma.researchStudy.update({ where: { id: studyId }, data: { status: "CLOSED" } }).catch(() => undefined);
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    await prisma.$disconnect();
  }
});
