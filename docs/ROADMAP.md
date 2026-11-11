# Roadmap FoodRec

**Implemented** = kode tersedia. **Tested** = automated/integration check lulus. **Planned** = belum dikerjakan. **Pending Validation** = butuh dataset nyata atau validasi operasional.

## FoodRec V2

| Phase | Status | Notes |
| --- | --- | --- |
| A — Foundation and Python core | **Implemented; 24 unit tests pass; research fixture Pending Validation** | Pure functions, synthetic fixture, documented baseline. |
| B — Altair validation | **Output comparison complete; mathematical parity Pending Validation** | 43: MATCHED OUTPUT (5/5); train-264: MISMATCH (0/22 item IDs). Screenshot transcription and incomplete 264 workflow prevent parity claim. |
| C — PostgreSQL jobs and authenticated worker API | **Implemented; PostgreSQL integration tested** | Additive migration, atomic leased queue, secret-authenticated routes, isolated Python worker, `UNVERIFIED` artifacts only. Explicit enqueue; no auto-processing/publication. |
| D — Durable rating revisions, scheduler, locked configuration, monitoring API | **Implemented; PostgreSQL integration tested; automatic processing/publication OFF** | Existing Python worker polls PostgreSQL-backed scheduler; dedupe/stale metadata present. DB constraints hold gate at `PENDING_VALIDATION`, and trigger rejects all automatic jobs. No second queue/worker/service. |
| E — Admin/user UX and engine monitoring | **Implemented; lint/typecheck/build/unit/Python/PostgreSQL integration/browser E2E tested** | Dashboard shows actual dataset, job, worker and gate state. UI separates computation, `UNVERIFIED` artifact, and publication. Six-stage manual CSV workflow and USER journey verified in Chromium. Manual screen-reader/contrast review Pending Validation. |
| F — Full QA and parity gate review | **QA complete; mathematical parity Pending Validation** | 4/4 Chromium journeys, 6/6 PostgreSQL suites, and real Python worker staging pass. Automatic processing/publication remain OFF. Original Altair exports/settings and separate approval still required; job success is not parity evidence. |
| G — Algorithm parity and release blockers | **Parity BLOCKED; test isolation hardened; release not ready** | No proven Python–Altair root cause; per-user diagnostics and evidence gaps in [`RECOMMENDATION_ENGINE_VALIDATION.md`](RECOMMENDATION_ENGINE_VALIDATION.md). `fast-uri` pinned to 3.1.9; broader dev audit and DB-backed validation remain open. See [`PHASE_G_REPORT.md`](PHASE_G_REPORT.md). |
| Research collection V1 | **Implemented; 21 unit tests, 7 PostgreSQL suites, 5 Chromium journeys, lint/typecheck/build/Prisma validate pass** | Separate consent-gated `ResearchRating`, Admin study/dashboard/export, pseudonymous manifest, retention configuration, withdrawal/revocation. Tests use `_test`; no production migration/deploy or Recommendation Engine integration. |

| Fase | Cakupan | Status | Dependensi |
| --- | --- | --- | --- |
| [x] 1 — Project Foundation & Design System | App Router/TypeScript, Tailwind tokens, Plus Jakarta Sans, public/auth/admin layouts, shared UI, home, error/404. | **Implemented**; lint/typecheck/build lulus; manual responsive/a11y review **Pending Validation**. | — |
| [x] 2 — Database Foundation, Authentication & Authorization | PostgreSQL/Prisma tujuh model, migration, Better Auth database sessions, register/login/logout, USER/ADMIN guard, admin dashboard/seed. | **Implemented**; migration, role/auth integration, seed, DB constraints lulus pada PostgreSQL sementara. Production DB **Pending Validation**. | Fase 1 |
| [x] 3 — Food Management | Admin list/search/filter/sort/pagination, CRUD, image upload, hybrid delete/reactivate, CSV template/preview/insert-only commit, FoodImport history, seed 40 foods. | **Implemented**; PostgreSQL CRUD/image/import integration lulus. Production storage **Pending Validation**. | Fase 2 |
| [x] 4 — Rating workflows & dataset export | Public active catalog, USER rating/history, ADMIN private immutable snapshot CSV `user_id,food_id,rating`. | **Implemented**; rating/session/export/checksum integration lulus. CSV rating contract tervalidasi. | Fase 3 |
| [ ] 5 — Pemrosesan Altair manual | ADMIN menjalankan UBCF/Cosine/user k-NN manual di Altair lalu mengekspor CSV hasil. | Pertukaran CSV, impor, validasi, dan publikasi **Implemented**; kecocokan dengan file penelitian Altair asli **Pending Validation** | Fase 4 |
| [x] 6 — Result validation and audit | Validasi referensi, rank, duplikasi, stale warnings, validation report, lifecycle dan audit. | **Implemented; parser/API/PostgreSQL integration Tested** | Fase 5 |
| [x] 7 — Recommendation publication | Atomic publication, supersede history, admin detail, owner-only recommendation page. | **Implemented; concurrent publication/owner/filter integration Tested**; visual review **Pending Validation** | Fase 6 |
| [ ] 8 — Hardening and release | Security/performance/accessibility, observability, backup/restore, deployment. | **Planned** | Fase 1–7 |

## UX V1

- Beranda USER menampilkan jumlah rating, langkah berikutnya, status rekomendasi, dan tanggal publikasi dari database.
- Katalog menyediakan pencarian, kategori, urutan, filter sudah/belum dinilai, dan progres rating aktif sebagai ringkasan (bukan target); rating dapat diperbarui dengan feedback tersimpan/gagal.
- Halaman rekomendasi menjelaskan setiap status tanpa janji pemrosesan otomatis.
- Workflow ADMIN memiliki enam tahap: siapkan dataset, unduh CSV, jalankan Altair manual, impor hasil, validasi, dan publikasi; riwayat teknis tersedia terpisah.
- Dashboard Admin menampilkan statistik/database engine aktual, heartbeat worker berbasis TTL, status job/artifact/published batch, gate terkunci, dan CTA kondisional. Monitoring memakai API existing dan tidak menyediakan gate toggle.
- Research V1 provides separate consent/rating/admin/export/withdrawal routes and UI. 21 unit tests, 7 PostgreSQL integration suites, and Chromium coverage pass; source table/revision isolation verified. No production migration/deploy; research data remains outside recommendation pipeline.
- Riwayat tetap menjaga checksum, waktu, admin, parameter, preview, dan metadata penelitian. Batch kosong/invalid tidak diterbitkan; ambang peringatan cakupan hampir penuh 90% adalah heuristik sementara.
- Lint, typecheck, build, Prisma validate, 15 npm unit tests, 24 Python tests, 6 PostgreSQL suites, and 4 Playwright journeys **passed in Phase F**. Phase G production audit is clean after the `fast-uri` 3.1.9 override; full audit retains 7 moderate development-tool findings through nested `minimatch`. Browser checked mobile/tablet/desktop overflow, form labels, focus visibility, USER/Admin workflows, and real worker staging. Manual screen-reader/contrast/usability review and research-data validation remain **Pending Validation**.

## Acceptance checks Fase 1–4 and V2 Phase D/E

- [x] Public home, responsive public/auth/admin layouts.
- [x] Register fields include name/email/password/confirmation; server validation; public role USER only.
- [x] Better Auth database sessions, login/logout, rate limits and secure cookie policy.
- [x] Server-side admin role check and non-dummy dashboard.
- [x] Seven domain models, auth tables, restrictive FKs and immutable-history migration rules.
- [x] F1/F2/F3 migrations applied without reset; unique/CHECK/FK/trigger constraints verified.
- [x] Better Auth registration/login/session/logout and Guest/USER/ADMIN protected-page integration passed.
- [x] F3 food CRUD, search/filter, upload/signature validation/replacement, history-aware delete/deactivation/reactivation verified.
- [x] CSV template, row-error preview, duplicate checks, insert-only/no-partial transaction, concurrent commit and import history verified.
- [x] Idempotent 40-food seed; rerun skips existing Food Codes and leaves records unchanged.
- [x] Guest sees active Food catalog; USER can upsert only own 1–5 ratings and see own history.
- [x] First rating sets `firstUsedAt` in same DB transaction; inactive Food refuses new ratings.
- [x] ADMIN exports private CSV snapshot with exactly numeric user/food IDs and rating; checksum-verified admin-only download.
- [ ] Manual mobile/tablet/accessibility review.
- [ ] Production object storage/persistent volume, DB operations, shared rate-limit storage, and production security/performance review.
- [x] Dashboard Admin menggunakan statistik aktual; monitoring job/worker memakai endpoint existing dengan gate tetap terkunci.
- [x] Workflow Altair enam tahap dan riwayat batch search/filter memakai query baca saja.
- [x] Parser/import menolak hasil kosong; publish revalidasi server dan mempertahankan atomic publication.
- [x] V2 Phase D: rating insert/delete/real value change increments durable PostgreSQL revision; unchanged value does not.
- [x] V2 Phase D: snapshot locks/captures revision with rating rows; worker-driven scheduler checks dirty state and deduplicates revision/version/parameters under PostgreSQL locks.
- [x] V2 Phase D: default config 3 neighbors, Top-5, 30-minute interval; processing/publication remain DB-locked OFF and `PENDING_VALIDATION`; automatic jobs rejected by DB trigger.
- [x] V2 Phase D/E: Admin monitoring reports config/gate, dirty state, scheduler, safe job detail, heartbeat freshness, last computation and published batch; stale outputs remain `UNVERIFIED` and do not alter active batch.

Altair tetap jalur riset/publikasi manual; real research-file round-trip and mathematical parity remain Pending Validation. Phase F QA verified browser workflows, closed gates, and explicit Python worker staging; worker artifacts remain `UNVERIFIED` and cannot alter/publish active batches. QA used `foodrec_test` and `foodrec_e2e_test` without resets. One earlier runner misconfiguration applied five additive migrations and created one test Admin in `foodrec`; user chose to leave them intact. No research rows were deleted. Full incident and evidence are in [`PHASE_F_VERIFICATION.md`](PHASE_F_VERIFICATION.md).
