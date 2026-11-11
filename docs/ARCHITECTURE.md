# Arsitektur FoodRec

## Stack

Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, Prisma ORM 7, PostgreSQL driver adapter, Better Auth 1.7, Zod 4, Lucide React, dan Plus Jakarta Sans melalui `next/font/google`.

## Organisasi kode

```text
app/
  (public)/              home + public layout
  (public)/foods/         public active catalog
  (public)/foods/[id]/    public Food detail
  (public)/my-ratings/    USER-only rating history
  (public)/recommendations/ USER-only published recommendations
  (auth)/                login/register + auth layout
  admin/                 protected dashboard + Food Management + Data Rating pages
  admin/ratings/         rating dataset snapshot history
  admin/recommendations/ recommendation import, validation, batch history/detail
  api/auth/[...all]/     Better Auth handler
  api/admin/foods/       role-guarded Food CRUD/status/image/CSV routes
  api/admin/rating-datasets/ rating snapshot/create/download
  api/admin/recommendation-engine/ locked engine config and monitoring
  api/admin/recommendation-batches/ import, validate, list/detail and atomic publish
  api/admin/recommendation-jobs/ explicit ADMIN-only staging enqueue
  api/internal/recommendation-jobs/ secret-authenticated worker schedule/claim/snapshot/heartbeat/result/failure/status
  api/me/recommendations/ owner-only published results
  api/foods/             public catalog + USER rating API
  api/my-ratings/        owner-only rating history API
  api/food-images/       safe image serving by generated filename
components/
  auth/                  auth forms
  admin/foods/           Food form, filter/list controls, import preview
  admin/ratings/         snapshot export control
  admin/recommendations/ upload/preview, validation report, publish confirmation
  foods/                 Food card + rating selector
  recommendations/       ranked Food cards and empty/error states
  site/                  public header/footer/logout
  ui.tsx                 shared primitives
lib/
  actions/auth.ts        validated server actions
  auth.ts                Better Auth + Prisma adapter
  auth-client.ts         Better Auth React client
  authz.ts               server-side session/role checks
  env.ts                 Zod environment schemas
  food/                  Food schemas, CSV parser, storage, revision-locked rating snapshots
  recommendations/       PostgreSQL job lifecycle, scheduler, worker API helpers
  prisma.ts              singleton Prisma Client
  validation/auth.ts     request schemas
prisma/
  schema.prisma          domain/auth models + rating revisions, locked engine config, worker/job/artifact state
  migrations/            additive PostgreSQL migrations
  food-catalog.ts        40 Food seed records
scripts/
  test-integration.mjs   dedicated `_test` DB migration/seed/test runner
  test-e2e.mjs           guarded `foodrec_e2e_test` migration/build/Chromium runner; no reset
  run-recommender-worker.ps1 Windows PowerShell local worker launcher
playwright.config.ts    production-server Chromium E2E configuration
tests/e2e/              Guest/USER/Admin journeys and real Python worker/PostgreSQL lifecycle
services/recommender/
  pyproject.toml         Python project; no runtime dependencies
  src/engine/            pure Cosine, user k-NN, prediction, Top-N
  src/worker.py          authenticated HTTP client, checksum, timeout and process isolation
  src/schemas.py         typed engine results and statuses
  tests/                 synthetic fixture and stdlib unit tests
```

Server Components default. Client Components dipakai untuk auth forms, Food form/upload preview, import preview/commit, Rating input, dataset export/loading, recommendation CSV preview/publish confirmation, dan recommendation retry/loading states. Mutasi auth melewati Server Actions; Food/Rating/export/recommendation mutations memakai Route Handlers terproteksi.

## Authentication dan authorization

Better Auth + Prisma adapter dipilih karena menyediakan email/password, database sessions, proteksi cookie/CSRF/origin, dan integrasi Next.js tanpa custom session protocol. Session berlaku tujuh hari dan disimpan di PostgreSQL. Cookies HttpOnly, SameSite=Lax, Secure untuk `AUTH_URL` HTTPS. Rate limit login 5 dan registrasi 3 per menit per process; penyimpanan in-memory tidak cocok lintas instance.

Role user tambahan bersifat server-owned (`input: false`); hook create memaksa USER. Form registration divalidasi server-side, termasuk konfirmasi password. Akses `/admin` diperiksa pada server layout dan page. Admin provisioning memakai seed yang tidak mempromosikan akun existing.

Better Auth menyimpan credential hash di `Account.password`. Ini mengikuti skema auth library; hash tidak disimpan pada `User` atau diserialisasi ke session.

## Food Management Fase 3

- `app/admin/foods` membaca data melalui Prisma; search/status/category/sort/pagination dikerjakan server-side.
- `/api/admin/foods` dan subroutes memverifikasi Better Auth session dan role ADMIN sendiri; sidebar bukan security boundary.
- Input create/update memakai Zod, daftar enum karakteristik berasal dari `lib/food/constants.ts`, dan `foodCode` tidak pernah diterima sebagai field update.
- Permanent delete hanya berjalan bila `firstUsedAt` null dan tidak ada rating/recommendation. FK `RESTRICT` dan database trigger menjaga race/direct SQL sebagai `FOOD_HAS_HISTORY`; makanan ber-history hanya status `isActive` yang dapat diubah.
- CSV parser `csv-parse` memvalidasi UTF-8/header/baris; preview disimpan sebagai private staged CSV dengan checksum. Commit mengklaim draft melalui status row dan menjalankan seluruh `createMany` + status completion dalam satu Prisma transaction. DB unique constraint menangani concurrent Food Code collision.
- Gambar disimpan di `FOODREC_STORAGE_DIR/food-images` dengan UUID, signature/MIME/extension/size check; tidak menggunakan nama asli sebagai path. `/api/food-images/:filename` hanya menerima nama UUID dengan extension yang di-whitelist. Serverless deployment memerlukan persistent mount atau object storage.
- `prisma/seed-foods.ts` menggunakan `createMany(skipDuplicates)`; tidak mengubah existing Foods dan tidak membuat ratings/recommendations.

## Rating and dataset snapshot Fase 4

- `/foods` hanya menampilkan `isActive=true`; USER memberi/memperbarui satu rating 1–5 per Food lewat `PUT /api/foods/:id/rating`. Guest/admin tidak dapat menulis rating.
- Rating write memakai row lock pada Food dan transaction untuk upsert Rating + mengisi `firstUsedAt` hanya sekali. Existing `@@unique([userId, foodId])` dan SQL CHECK tetap menjadi guard DB.
- `/my-ratings` dan `/api/my-ratings` hanya mengembalikan rating milik USER aktif.
- ADMIN snapshot memakai revision lock PostgreSQL dan satu query terurut, membuat CSV `user_id,food_id,rating`, hash SHA-256 dan private file key. `DatasetExport` menyimpan revision dan metadata immutable; download mengecek checksum dan hanya ADMIN. Snapshot saat ini dibuffer di memory; gunakan cursor streaming bila ukuran dataset tumbuh material.
- Trigger PostgreSQL menaikkan `RatingDatasetState.currentRevision` hanya pada insert/delete atau perubahan nilai rating sebenarnya; update nilai sama tidak membuat dirty revision. Snapshot mengunci state row saat membaca revision dan rating rows, sehingga concurrent write masuk ke revision setelah snapshot atau seluruhnya tercakup.
- Ekspor tidak memasukkan nama, email, password, atau data personal. UBCF/Cosine stays in `services/recommender`; Next.js owns job DB and exposes only numeric snapshot data to the worker.

## Recommendation import and publication Fase 6–7

- ADMIN memilih `DatasetExport` immutable, mengunggah CSV privat `user_id,item_id,rank`, dan mencatat k, Top-N, COSINE, checksum, filename, serta laporan validasi. `item_id` selalu dicocokkan ke `Food.id`.
- Validasi memeriksa header/UTF-8/ukuran, ID integer, referensi User/Food, user dalam snapshot, pasangan duplikat, sequence rank, Top-N, kandidat yang telah dinilai pada snapshot, dan Food aktif. Error struktural/referensial all-or-nothing; batch invalid tersimpan sebagai DRAFT tanpa Recommendation rows.
- Perubahan rating setelah snapshot menjadi warning stale, bukan bukti proses Altair. Kandidat yang baru dinilai setelah export juga diberi warning dan disembunyikan dari hasil user.
- Publish memuat ulang file dan dataset, memvalidasi ulang referensi/rank/Food, lalu mengganti status dalam satu PostgreSQL transaction. Advisory transaction lock menserialisasi publisher dan partial unique index menjaga maksimal satu batch PUBLISHED. Batch lama menjadi SUPERSEDED, riwayat tidak dihapus.
- `/api/me/recommendations` mengambil user dari session, tidak menerima userId frontend, memakai batch PUBLISHED, serta menyaring Food nonaktif dan rating milik user saat ini. Request rating/rekomendasi tidak menghitung CF atau similarity; scheduler terpisah hanya dipoll worker existing.
- Endpoint admin: `GET /api/admin/recommendation-batches`, `POST /api/admin/recommendation-batches/import`, `GET /api/admin/recommendation-batches/:id`, `POST /api/admin/recommendation-batches/:id/publish`. Endpoint USER: `GET /api/me/recommendations`.
- UBCF, Cosine Similarity, dan user k-NN dijalankan manual oleh ADMIN di Altair AI Studio Educational 2026.1.1. Nilai k dan Top-N disimpan per batch, tidak menjadi default algoritme permanen.

## PostgreSQL dan lifecycle

`lib/prisma.ts` membuat satu Prisma Client dan adapter PostgreSQL, memakai global singleton saat hot reload. Environment divalidasi melalui `lib/env.ts`; `prisma.config.ts` memakai schema database URL yang sama.

Initial migration memiliki FK restrictive untuk histori penelitian, check constraints skor/rank/count, trigger immutable `Food.foodCode`/`DatasetExport`, serta trigger perlindungan histori. Hanya record teknis Account/Session cascade ke User. Local Docker Compose memakai named volume `foodrec-postgres` dan tidak menghapus volume saat stop.

## Recommendation boundary — V2 Phase C/D implemented; validation gate closed

Existing web path tetap memakai Altair CSV import, validation, and atomic publication. PostgreSQL `RecommendationJob` rows reference immutable `DatasetExport` snapshots; atomic claims use `FOR UPDATE SKIP LOCKED`, 60-second leases, heartbeat, 15-minute attempt timeout, three bounded attempts, and stale-lease recovery during subsequent claims. Retry failures back off 5/10 seconds. Manual job creation stays explicit ADMIN-only and idempotent.

Next.js owns PostgreSQL/Prisma, snapshot reads/checksum verification, lease enforcement, result validation, and artifact storage. Internal worker routes use `FOODREC_WORKER_SECRET` Bearer auth plus worker ID/lease token; snapshot and result bodies are bounded. Python uses stdlib HTTP, downloads only numeric user/food/rating CSV, verifies SHA-256, and calls existing engine. Worker never connects to PostgreSQL.

Phase D adds a durable rating revision trigger, `RecommendationEngineConfig`, worker heartbeats, `lib/recommendations/scheduler.ts`, and a scheduler endpoint polled by the existing Python worker. PostgreSQL row locks serialize due checks across workers and restarts. The configurable interval defaults to 30 minutes; dirty means `currentRevision > processedRevision`. Dedupe key hashes rating revision, engine version, and frozen job parameters. Scheduler state/outcome and admin monitoring API survive process restarts.

The automatic path is deliberately unreachable: DB checks force `autoProcessingEnabled=false`, `automaticPublicationEnabled=false`, and `validationStatus=PENDING_VALIDATION`; another DB trigger rejects every `AUTO_RATING_CHANGE` job. Admin PATCH accepts only `kNeighbors`, `topN`, and interval (defaults 3/5/30; not research-optimized). No API or Admin action can open parity gate. A separate validation-approved migration is required to change these locks.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/admin/recommendation-jobs` | Explicit ADMIN enqueue from `datasetExportId`, `kNeighbors`, `topN`, and UUID `idempotencyKey`; active Food IDs are frozen into job parameters. Same key/same request returns existing job; different request returns 409. |
| `POST /api/admin/recommendation-jobs/:id/cancel` | ADMIN can cancel pending/running jobs; terminal jobs cannot be changed. |
| `POST /api/internal/recommendation-jobs/claim` | Secret-authenticated atomic claim; body contains worker ID and engine version, so incompatible workers do not lease jobs. Returns one lease or 204. |
| `POST /api/internal/recommendation-jobs/schedule` | Existing worker checks durable dirty state and due interval; auto enqueue remains blocked by DB validation gate. |
| `GET /api/internal/recommendation-jobs/:id/snapshot` | Lease owner downloads checksum-verified, bounded CSV snapshot. |
| `POST /api/internal/recommendation-jobs/:id/heartbeat` | Lease owner extends 60-second lease, never beyond attempt timeout. |
| `POST /api/internal/recommendation-jobs/:id/result` | Lease owner submits bounded ranked scores; server validates users, active/unrated candidates, rank sequence, score range, and snapshot checksum. |
| `POST /api/internal/recommendation-jobs/:id/fail` | Lease owner reports allow-listed error code; server stores safe summary and retries or fails job. |
| `GET /api/internal/recommendation-jobs/:id` | Lease owner reads lifecycle and artifact metadata; result body is not returned by status API. |

Every internal call uses `Authorization: Bearer ...`; all per-job calls also send `X-FoodRec-Worker-Id` and `X-FoodRec-Lease-Token`. Secret is never returned to browser or logs. Network clients must use HTTPS except loopback. Request/result limits protect API memory; worker limits snapshot 20 MiB, result 2 MiB/10,000 rows.

Each attempt has 15-minute timeout, 60-second renewable lease, and heartbeat. Failure retries max 3 attempts with 5-second then 10-second delay; third failure is terminal `FAILED`. Expired leases/timeouts are recovered atomically when next worker claims. Worker uses a separate spawned Python process per computation so timeout/lease loss can terminate CPU work. SIGINT/SIGTERM stops new claims and lets active work finish when possible.

Results persist as JSONB `RecommendationJobArtifact` with DB-enforced `verificationStatus=UNVERIFIED`, source/current rating revisions, and stale flag. `SUCCEEDED` means computation completed only. Artifacts have no relation to `RecommendationBatch`; they cannot enter manual publication path, replace active batch, or be published automatically. Existing manual Altair import/publish behavior remains unchanged. Auto-processing and publication remain **OFF**.

`GET/PATCH /api/admin/recommendation-engine` exposes safe config and read-only monitoring: gate reasons, dirty revision state, scheduler times/outcome, pending/running/failed counts, last successful execution, and worker heartbeat online status. No dashboard redesign is included in Phase D.

Phase B remains **Pending Validation** mathematically: 43-rating screenshot transcription matches 5/5 rows; train-264 Top-1 item IDs match 0/22. Original exports, full 264 workflow settings, and intermediate score/neighbor evidence remain unavailable.

Phase F QA ran Playwright against isolated `foodrec_e2e_test` and the actual local Python worker. The runner asserts an `_test` target before each Prisma/Next/Playwright child process, applies migrations/seeds without reset, and builds into a separate Next dist directory. PostgreSQL confirms worker `SUCCEEDED` with a stale `UNVERIFIED` artifact; no batch is created or published. Browser checks establish app-flow readiness only, not Altair parity or production readiness. See [`PHASE_F_VERIFICATION.md`](PHASE_F_VERIFICATION.md).
