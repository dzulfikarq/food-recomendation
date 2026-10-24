# Arsitektur FoodRec

## Stack

Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, Prisma ORM 7, PostgreSQL driver adapter, Better Auth 1.7, Zod 4, Lucide React, dan Plus Jakarta Sans melalui `next/font/google`.

## Organisasi kode

```text
app/
  (public)/              home + public layout
  (public)/foods/         public active catalog
  (public)/my-ratings/    USER-only rating history
  (auth)/                login/register + auth layout
  admin/                 protected dashboard + Food Management + Data Rating pages
  admin/ratings/         rating dataset snapshot history
  api/auth/[...all]/     Better Auth handler
  api/admin/foods/       role-guarded Food CRUD/status/image/CSV routes
  api/admin/rating-datasets/ rating snapshot/create/download
  api/foods/             public catalog + USER rating API
  api/my-ratings/        owner-only rating history API
  api/food-images/       safe image serving by generated filename
components/
  auth/                  auth forms
  admin/foods/           Food form, filter/list controls, import preview
  admin/ratings/         snapshot export control
  foods/                 Food card + rating selector
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
```

Server Components default. Client Components dipakai untuk auth forms, Food form/upload preview, import preview/commit, Rating input, dan dataset export/loading states. Mutasi auth melewati Server Actions; Food/Rating/export mutations memakai Route Handlers terproteksi.

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
- Ekspor tidak memasukkan nama, email, password, atau data personal; tidak ada UBCF/Cosine code atau Altair API.

## PostgreSQL dan lifecycle

`lib/prisma.ts` membuat satu Prisma Client dan adapter PostgreSQL, memakai global singleton saat hot reload. Environment divalidasi melalui `lib/env.ts`; `prisma.config.ts` memakai schema database URL yang sama.

Initial migration memiliki FK restrictive untuk histori penelitian, check constraints skor/rank/count, trigger immutable `Food.foodCode`/`DatasetExport`, serta trigger perlindungan histori. Hanya record teknis Account/Session cascade ke User. Local Docker Compose memakai named volume `foodrec-postgres` dan tidak menghapus volume saat stop.

## Recommendation boundary — Planned

Backend FoodRec hanya menjadi sumber dataset dan penyimpan output pada fase selanjutnya. User-Based Collaborative Filtering dan Cosine Similarity diproses manual di Altair AI Studio Educational 2026.1.1 melalui CSV. Tidak ada kode algoritma atau integrasi Altair pada fase ini.
