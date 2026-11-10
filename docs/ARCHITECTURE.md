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
  api/admin/recommendation-batches/ import, validate, list/detail and atomic publish
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
  food/                  Food schemas, CSV parser, storage, query/API helpers
  prisma.ts              singleton Prisma Client
  validation/auth.ts     request schemas
prisma/
  schema.prisma          seven domain models + auth models
  migrations/            additive PostgreSQL migrations
  food-catalog.ts        40 Food seed records
scripts/
  test-integration.mjs   dedicated `_test` DB migration/seed/test runner
services/recommender/
  pyproject.toml         Python project; no runtime dependencies
  src/engine/            pure Cosine, user k-NN, prediction, Top-N
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
- ADMIN snapshot memakai satu query terurut, membuat CSV `user_id,food_id,rating`, hash SHA-256 dan private file key. `DatasetExport` metadata immutable; download mengecek checksum dan hanya ADMIN. Snapshot saat ini dibuffer di memory; gunakan cursor streaming bila ukuran dataset tumbuh material.
- Ekspor tidak memasukkan nama, email, password, atau data personal. Tidak ada UBCF/Cosine code di Next.js atau Altair API; pure Python core kini terpisah di `services/recommender` dan belum terhubung.

## Recommendation import and publication Fase 6–7

- ADMIN memilih `DatasetExport` immutable, mengunggah CSV privat `user_id,item_id,rank`, dan mencatat k, Top-N, COSINE, checksum, filename, serta laporan validasi. `item_id` selalu dicocokkan ke `Food.id`.
- Validasi memeriksa header/UTF-8/ukuran, ID integer, referensi User/Food, user dalam snapshot, pasangan duplikat, sequence rank, Top-N, kandidat yang telah dinilai pada snapshot, dan Food aktif. Error struktural/referensial all-or-nothing; batch invalid tersimpan sebagai DRAFT tanpa Recommendation rows.
- Perubahan rating setelah snapshot menjadi warning stale, bukan bukti proses Altair. Kandidat yang baru dinilai setelah export juga diberi warning dan disembunyikan dari hasil user.
- Publish memuat ulang file dan dataset, memvalidasi ulang referensi/rank/Food, lalu mengganti status dalam satu PostgreSQL transaction. Advisory transaction lock menserialisasi publisher dan partial unique index menjaga maksimal satu batch PUBLISHED. Batch lama menjadi SUPERSEDED, riwayat tidak dihapus.
- `/api/me/recommendations` mengambil user dari session, tidak menerima userId frontend, memakai batch PUBLISHED, serta menyaring Food nonaktif dan rating milik user saat ini. Tidak ada perhitungan CF, skor similarity, scheduler, atau refresh otomatis.
- Endpoint admin: `GET /api/admin/recommendation-batches`, `POST /api/admin/recommendation-batches/import`, `GET /api/admin/recommendation-batches/:id`, `POST /api/admin/recommendation-batches/:id/publish`. Endpoint USER: `GET /api/me/recommendations`.
- UBCF, Cosine Similarity, dan user k-NN dijalankan manual oleh ADMIN di Altair AI Studio Educational 2026.1.1. Nilai k dan Top-N disimpan per batch, tidak menjadi default algoritme permanen.

## PostgreSQL dan lifecycle

`lib/prisma.ts` membuat satu Prisma Client dan adapter PostgreSQL, memakai global singleton saat hot reload. Environment divalidasi melalui `lib/env.ts`; `prisma.config.ts` memakai schema database URL yang sama.

Initial migration memiliki FK restrictive untuk histori penelitian, check constraints skor/rank/count, trigger immutable `Food.foodCode`/`DatasetExport`, serta trigger perlindungan histori. Hanya record teknis Account/Session cascade ke User. Local Docker Compose memakai named volume `foodrec-postgres` dan tidak menghapus volume saat stop.

## Recommendation boundary — V2 Phase A implemented; integration pending

Existing web path tetap memakai Altair CSV import, validation, and atomic publication. Phase A menambahkan pure Python UBCF core di `services/recommender`, belum worker atau website integration. Baseline similarity/prediction assumptions dan synthetic fixture didokumentasikan di [`RECOMMENDATION_ENGINE_VALIDATION.md`](RECOMMENDATION_ENGINE_VALIDATION.md). Altair parity **Pending Validation** karena research dataset, operator configuration, dan reference output tidak ada di repository. Automatic processing tetap **OFF**.

Next.js remains owner of authentication, authorization, PostgreSQL migrations, snapshots, validation, and publication. Python worker communication, durable jobs, and batch source metadata are deferred to later V2 phases; Python has no direct database ownership.
