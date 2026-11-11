# FoodRec

FoodRec membantu pengguna menjelajahi makanan, menyimpan rating, dan melihat rekomendasi yang sudah diterbitkan untuk akun mereka. Workflow Altair manual tetap tersedia untuk penelitian. Python UBCF/Cosine core berjalan lewat PostgreSQL job queue dan authenticated worker; hasil worker hanya masuk staging `UNVERIFIED`.

## Status

- **Implemented:** user journey personal, katalog/rating, published-only recommendation page, dashboard Admin, engine monitoring, dan workflow CSV enam tahap sampai publikasi.
- **FoodRec V2 Phase D/E:** durable PostgreSQL rating revisions, locked scheduler/config, safe job monitoring UI, dan enam tahap Altair manual. Reuses Phase C queue/worker and existing monitoring API.
- **Validation gate:** DB constraints force auto-processing/publication OFF and `PENDING_VALIDATION`; DB trigger rejects automatic jobs. Worker artifacts stay `UNVERIFIED`; `SUCCEEDED` means compute finished only. No automatic batch creation/publication or active-batch replacement.
- **Automatic processing:** OFF. Mathematical parity **Pending Validation**; 43-rating output **MATCHED OUTPUT**, train-264 Top-1 **MISMATCH**. Screenshot transcription is not original Altair export.
- **Admin monitoring:** actual dataset revision, job status/detail, worker heartbeat TTL, last successful computation, last published batch, and locked validation gate. Computed, verified, and published outcomes remain distinct.
- **Admin workflow:** statistik database dan enam tahap Siapkan Dataset → Unduh CSV → Jalankan Altair manual → Impor Hasil → Validasi → Publikasikan; filter/pencarian riwayat dan checksum dipertahankan.
- **Phase F QA:** 4/4 Playwright Chromium journeys and 6/6 PostgreSQL integration suites pass on separate `_test` databases. Guest/USER/Admin journeys and real Python worker-to-PostgreSQL job verified; artifacts remain `UNVERIFIED`, automation/publication OFF.
- **Automated checks:** Python (24 tests), `npm test` (15), lint, typecheck, Prisma validate, build, PostgreSQL integration, and browser E2E pass. Production `npm audit --omit=dev` reports one moderate `fast-uri` vulnerability.
- **Pending Validation:** mathematical parity and real Altair export round-trip, production security/performance/database/storage, plus manual screen-reader/contrast/usability review. Evidence/readiness: [`docs/PHASE_F_VERIFICATION.md`](docs/PHASE_F_VERIFICATION.md).
- **Manual research workflow:** UBCF, Cosine Similarity, dan user k-NN tetap dapat dijalankan di Altair AI Studio Educational 2026.1.1; existing CSV validation/publication tetap berlaku.

Guest dapat melihat katalog aktif dan membuat akun. Setelah masuk, USER mendapat beranda personal, dapat menjelajahi `/foods`, memberi atau memperbarui rating 1–5, melihat `/my-ratings`, dan membuka `/recommendations`. Hasil hanya tampil setelah admin menerbitkan batch yang mencakup user; menyimpan rating tidak memicu pemrosesan otomatis. Dashboard admin dan pengelolaan katalog, snapshot, impor, validasi, publikasi, serta audit tersedia di `/admin`. Detail status dan batas validasi: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Prasyarat

- Node.js 20.19+ dan npm.
- PostgreSQL 15+ lokal, atau Docker Compose.
- Python 3.11+ untuk Recommendation Engine tests.
- Chrome/Chromium untuk Playwright E2E; set `FOODREC_CHROME_PATH` if executable is not at default Windows path.

## Setup development

```powershell
Copy-Item .env.example .env
```

Ubah password database, `AUTH_SECRET` (minimal 32 karakter acak), `FOODREC_WORKER_SECRET` (minimal 32 karakter acak), `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di `.env`. `DATABASE_URL` dan `FOODREC_TEST_DATABASE_URL` harus memakai kredensial database yang sama. Nilai `.env.example` hanya placeholder development.

`FOODREC_STORAGE_DIR` menerima absolute path atau subfolder di `./storage`; `.env.example` memakai `.` sebagai root default. `FOODREC_TEST_DATABASE_URL` harus menunjuk database terpisah dengan nama berakhiran `_test`; jangan arahkan ke database production.

Dengan Docker:

```sh
docker compose up -d db
```

Lalu jalankan:

```sh
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:seed:foods
npm run dev
```

Buka `http://localhost:3000`. `db:seed` membuat ADMIN hanya bila email belum ada; bila email sudah menjadi USER, proses gagal tanpa menaikkan role. `db:seed:foods` menambahkan 40 makanan awal dengan `createMany(skipDuplicates)`, tanpa memperbarui record yang ada.

## Workflow rekomendasi

1. ADMIN siapkan snapshot privat, lalu unduh CSV yang dipilih.
2. ADMIN menjalankan UBCF/Cosine/user k-NN secara manual di Altair; website tidak menjalankan proses tersebut.
3. ADMIN impor file ber-header `user_id,item_id,rank`, isi k/Top-N yang benar-benar dipakai, lalu tinjau validasi dan preview. `item_id` harus memakai `Food.id`.
4. ADMIN menerbitkan batch valid/nonkosong secara manual. Import, job worker, dan komputasi tidak otomatis menerbitkan rekomendasi.
5. USER melihat hasil batch PUBLISHED miliknya di `/recommendations`. Food nonaktif dan rekomendasi yang sudah dinilai disembunyikan. Perubahan rating tidak menghitung ulang algoritme dan tidak menjamin rekomendasi baru.

### Phase C/D worker (staging only; automation locked)

Worker exposes `POST /api/admin/recommendation-jobs` for explicit ADMIN enqueue, and authenticated internal routes for schedule check, claim, snapshot, heartbeat, result, failure, and status. Scheduler runs through existing Python worker polling; PostgreSQL stores dirty revisions, config, interval, and heartbeat. Internal routes require `Authorization: Bearer <FOODREC_WORKER_SECRET>`; job operations also require worker ID and lease token. Use HTTPS except loopback development.

Apply additive migrations with `npm run db:migrate:deploy`, start Next.js (`npm run dev`), then open another PowerShell terminal:

```powershell
$env:FOODREC_WORKER_API_URL = "http://127.0.0.1:3000"
$env:FOODREC_WORKER_SECRET = "<same random secret configured in .env>"
$env:FOODREC_WORKER_ID = "local-worker-1" # optional
.\scripts\run-recommender-worker.ps1
```

Worker claims jobs every 2 seconds by default and checks scheduler due state at most once per minute; configured scheduler interval defaults to 30 minutes. It logs job IDs/attempts without ratings or credentials and finishes in-flight work after Ctrl+C before stopping claims. Configure `FOODREC_WORKER_POLL_SECONDS` (0.5–60) or `FOODREC_WORKER_LOG_LEVEL` if needed. Jobs retry at most 3 attempts; expired leases/timeouts recover on a later claim. Admin monitoring: `GET/PATCH /api/admin/recommendation-engine`; PATCH can change only `kNeighbors`, `topN`, and `scheduleIntervalMinutes`. DB locks auto-processing/publication and parity status until a separate validation-approved migration; no API/Admin override. Result artifacts stay `UNVERIFIED`; Phase B mathematical parity remains **Pending Validation**. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/RECOMMENDATION_ENGINE_VALIDATION.md`](docs/RECOMMENDATION_ENGINE_VALIDATION.md).

CSV hasil maksimal 2 MB/10.000 baris, UTF-8, header wajib persis `user_id,item_id,rank`; ID dan rank integer positif, rank per user berurutan mulai 1 dan tidak melebihi Top-N. Integrasi file Altair penelitian sesungguhnya masih **Pending Validation**.

Untuk integration test, `foodrec_test` dibuat otomatis bila role DB memiliki privilege `CREATEDB`; jika tidak, buat sekali (contoh: `createdb -h localhost -U foodrec foodrec_test`). Tanpa `FOODREC_TEST_DATABASE_URL`, runner memakai nama `<database>_test` dari `DATABASE_URL`. Jalankan:

```sh
npm run build
npm run test:integration
```

Script memerlukan production build, menerapkan migration dan seed pada database `_test`; tidak melakukan reset. Test menambah FoodImport/DatasetExport/RecommendationBatch audit records serta fixture user/food yang terikat histori; database `_test` harus terpisah dari DB development.

Browser E2E uses separate `foodrec_e2e_test` (or `FOODREC_E2E_DATABASE_URL` ending in `_test`), applies migrations/seeds without reset, builds production app, then runs Chromium. It creates user/rating/snapshot/batch/job fixtures; never target primary data. Set `FOODREC_CHROME_PATH` to select a Chrome/Chromium executable. Run `npm run test:e2e`.

Python tests memakai stdlib, tanpa runtime dependency tambahan:

```powershell
Set-Location services/recommender
$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
```

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server development |
| `npm run build` | Generate Prisma Client lalu production build |
| `npm run start` | Jalankan production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Auth, food-query, and CSV unit tests |
| `npm run test:integration` | PostgreSQL/Auth/Food/Rating/Recommendation/automation integration; perlu DB `_test` dan port `3101`–`3106` kosong |
| `npm run test:e2e` | Guest/USER/Admin Chromium journeys and real Python worker; isolated `foodrec_e2e_test`, no reset |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Terapkan/dev migration PostgreSQL |
| `npm run db:migrate:deploy` | Terapkan migration pada deployment |
| `npm run db:seed` | Provision ADMIN dari environment |
| `npm run db:seed:foods` | Seed 40 makanan awal, insert-only/idempotent |
| `npm run db:seed:demo-ratings` | Tambah 20 user demo dan rating synthetic untuk setiap Food lokal; existing ratings tidak ditimpa |
| `npm run db:studio` | Prisma Studio |

## Implementasi auth

Better Auth menggunakan database sessions dan Prisma adapter. Password di-hash oleh Better Auth (scrypt); hash berada di `Account.password`, bukan dikirim dalam session/API response. Role publik selalu USER. `app/admin/layout.tsx` dan dashboard memeriksa sesi/role di server.

## Food image storage

Foto disimpan di `FOODREC_STORAGE_DIR/food-images`, disajikan melalui `/api/food-images/:filename`, dan memakai nama acak. Upload dibatasi JPEG/PNG/WebP 5 MB. Serverless/ephemeral deployments membutuhkan persistent volume atau object storage; belum ada konfigurasi provider cloud.

## Legacy local data

File SQLite `prisma/dev.db` dari setup sebelumnya tidak dihapus atau dimigrasikan otomatis. Aplikasi kini menggunakan PostgreSQL; bila file lama berisi data yang perlu dipertahankan, migrasikan secara terpisah sebelum menghapusnya.

Validasi memakai PostgreSQL 17 terisolasi. Docker tidak tersedia di environment audit; service PostgreSQL pengguna tidak diubah.

## Dokumen

- [`docs/PRD.md`](docs/PRD.md) — kebutuhan produk dan status fitur.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — struktur aplikasi dan auth.
- [`docs/DATABASE.md`](docs/DATABASE.md) — tujuh model inti dan tabel auth.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Fase 1–8.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — keputusan dan batasan.
- [`docs/DESIGN.md`](docs/DESIGN.md) — user flow, halaman, komponen, dan prinsip UX FoodRec.
- [`docs/RECOMMENDATION_ENGINE_VALIDATION.md`](docs/RECOMMENDATION_ENGINE_VALIDATION.md) — rumus, synthetic fixture, dan status parity Altair.
- [`docs/PHASE_F_VERIFICATION.md`](docs/PHASE_F_VERIFICATION.md) — Phase F evidence, readiness, test targets, and safety incident.
