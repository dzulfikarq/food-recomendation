# FoodRec

FoodRec membantu pengguna menjelajahi makanan, menyimpan rating, dan melihat rekomendasi yang sudah diterbitkan untuk akun mereka. Workflow Altair manual tetap tersedia untuk penelitian. Python UBCF/Cosine core kini berada di `services/recommender`; belum menjadi worker dan belum terhubung ke website.

## Status

- **Implemented:** user journey personal, katalog/rating, halaman rekomendasi, dashboard admin operasional, dan workflow CSV terpandu sampai publikasi.
- **FoodRec V2 Phase A:** pure Python Cosine, user k-NN, rating prediction, deterministic Top-N, fixture sintetis, dan 14 unit tests. Belum ada job queue/API/worker integration.
- **Automatic processing:** OFF. Altair parity **Pending Validation** sampai dataset penelitian, operator configuration, dan reference output tersedia.
- **Admin workflow:** statistik dari database, empat tahap Dataset → Altair manual → Import/Validasi → Publish, snapshot pilihan, filter/pencarian riwayat, detail checksum dan metadata.
- **Automated checks lulus:** `npm run lint`, `npm run typecheck`, `npm test` (14 tes), `npm run build`, dan `npm run test:integration` (4 tes PostgreSQL). Integration memakai database `foodrec_test` terisolasi.
- **Pending Validation:** round-trip dengan file hasil Altair penelitian sesungguhnya, production database/storage, security/performance production, serta review visual, keyboard, dan screen reader lintas perangkat.
- **Manual research workflow:** UBCF, Cosine Similarity, dan user k-NN tetap dapat dijalankan di Altair AI Studio Educational 2026.1.1; existing CSV validation/publication tetap berlaku.

Guest dapat melihat katalog aktif dan membuat akun. Setelah masuk, USER mendapat beranda personal, dapat menjelajahi `/foods`, memberi atau memperbarui rating 1–5, melihat `/my-ratings`, dan membuka `/recommendations`. Hasil hanya tampil setelah admin menerbitkan batch yang mencakup user; menyimpan rating tidak memicu pemrosesan otomatis. Dashboard admin dan pengelolaan katalog, snapshot, impor, validasi, publikasi, serta audit tersedia di `/admin`. Detail status dan batas validasi: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Prasyarat

- Node.js 20.19+ dan npm.
- PostgreSQL 15+ lokal, atau Docker Compose.
- Python 3.11+ untuk Recommendation Engine tests.

## Setup development

```powershell
Copy-Item .env.example .env
```

Ubah password database, `AUTH_SECRET` (minimal 32 karakter acak), `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di `.env`. `DATABASE_URL` dan `FOODREC_TEST_DATABASE_URL` harus memakai kredensial database yang sama. Nilai `.env.example` hanya placeholder development.

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

1. ADMIN membuat dan mengunduh snapshot privat di `/admin/ratings` atau `/admin/recommendations`.
2. ADMIN mengikuti panduan Altair manual (UBCF, Cosine Similarity, user k-NN), lalu mengekspor CSV ber-header `user_id,item_id,rank`. `item_id` harus memakai `Food.id`; website tidak menjalankan Altair.
3. Di `/admin/recommendations`, pilih DatasetExport sumber, isi k/Top-N yang benar-benar dipakai, pilih CSV, tinjau nama/ukuran file, error/warning/preview, lalu konfirmasi **Terbitkan Rekomendasi**. Upload tidak otomatis aktif; batch kosong/invalid tidak dapat diterbitkan.
4. USER melihat hasil batch PUBLISHED miliknya di `/recommendations`. Food nonaktif dan rekomendasi yang sudah dinilai disembunyikan. Perubahan rating tidak menghitung ulang algoritme dan tidak menjamin rekomendasi baru.

CSV hasil maksimal 2 MB/10.000 baris, UTF-8, header wajib persis `user_id,item_id,rank`; ID dan rank integer positif, rank per user berurutan mulai 1 dan tidak melebihi Top-N. Integrasi file Altair penelitian sesungguhnya masih **Pending Validation**.

Untuk integration test, `foodrec_test` dibuat otomatis bila role DB memiliki privilege `CREATEDB`; jika tidak, buat sekali (contoh: `createdb -h localhost -U foodrec foodrec_test`). Tanpa `FOODREC_TEST_DATABASE_URL`, runner memakai nama `<database>_test` dari `DATABASE_URL`. Jalankan:

```sh
npm run build
npm run test:integration
```

Script memerlukan production build, menerapkan migration dan seed pada database `_test`; tidak melakukan reset. Test menambah FoodImport/DatasetExport/RecommendationBatch audit records serta fixture user/food yang terikat histori; database `_test` harus terpisah dari DB development.

Python unit tests memakai stdlib, tanpa runtime dependency tambahan:

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
| `npm test` | Unit test validasi autentikasi |
| `npm run test:integration` | PostgreSQL/Auth/Food/Rating/Recommendation integration; perlu DB `_test` dan port `3101`–`3104` kosong |
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
