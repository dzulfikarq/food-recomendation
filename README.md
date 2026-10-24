# FoodRec

FoodRec adalah aplikasi rekomendasi makanan berbasis pola rating. User-Based Collaborative Filtering dan Cosine Similarity kelak diproses manual di Altair AI Studio Educational 2026.1.1; backend tidak menjalankan algoritma rekomendasi.

## Status

- **Implemented:** Fase 1–4; Food Management, public active catalog, USER rating 1–5/history, dan ADMIN rating snapshot CSV.
- **Verified locally:** CRUD/API, image validation/replace/remove, hybrid delete, concurrent atomic CSV import, idempotent seed, rating lifecycle/firstUsedAt, private CSV export/checksum, role guards, migrations, build, lint, typecheck, unit/integration tests.
- **Pending Validation:** deployment database, production security/performance review, dan manual visual/accessibility review lintas perangkat.
- **Planned:** manual Altair processing, recommendation-result import/validation/publication, public recommendation pages.

Food Management dan Data Rating hanya untuk ADMIN (`/admin/foods`, `/admin/ratings`). USER dapat membuka `/foods`, memberi rating, dan melihat `/my-ratings`. Recommendation pages dan model backend **belum tersedia**. Detail: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Prasyarat

- Node.js 20.19+ dan npm.
- PostgreSQL 15+ lokal, atau Docker Compose.

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

Untuk integration test, `foodrec_test` dibuat otomatis bila role DB memiliki privilege `CREATEDB`; jika tidak, buat sekali (contoh: `createdb -h localhost -U foodrec foodrec_test`). Tanpa `FOODREC_TEST_DATABASE_URL`, runner memakai nama `<database>_test` dari `DATABASE_URL`. Jalankan:

```sh
npm run build
npm run test:integration
```

Script memerlukan production build, menerapkan migration dan seed pada database `_test`; tidak melakukan reset. Test menambah FoodImport/DatasetExport audit records; test DB terpisah dari DB development.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server development |
| `npm run build` | Generate Prisma Client lalu production build |
| `npm run start` | Jalankan production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit test validasi autentikasi |
| `npm run test:integration` | PostgreSQL/Auth/Food/Rating integration; perlu DB `_test` dan port `3101`–`3103` kosong |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Terapkan/dev migration PostgreSQL |
| `npm run db:migrate:deploy` | Terapkan migration pada deployment |
| `npm run db:seed` | Provision ADMIN dari environment |
| `npm run db:seed:foods` | Seed 40 makanan awal, insert-only/idempotent |
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
