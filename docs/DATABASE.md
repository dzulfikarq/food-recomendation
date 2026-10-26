# Database FoodRec

Provider aktual: PostgreSQL. Prisma schema: [`../prisma/schema.prisma`](../prisma/schema.prisma). Migrations: F1/F2 `20261017000000_phase1_2_foundation`, F3 `20261018000000_food_import_staging` dan `20261019000000_food_first_used_delete_guard`, recommendation `20261024000000_recommendation_management`.

## Tujuh model domain inti

| Model | Data penting | Relasi dan integritas |
| --- | --- | --- |
| `User` | integer autoincrement ID, name, unique email, role, timestamps | USER/ADMIN; email di-trim/lowercase; FK ke data penelitian bersifat restrictive. |
| `Food` | integer ID, unique `foodCode`, name, nullable description/metadata, category/taste/origin, imageUrl, `isActive`, `firstUsedAt` | `foodCode` dilindungi trigger immutable; rating/recommendation tidak cascade-delete; active/category di-index. |
| `Rating` | userId, foodId, rating, timestamps | FK USER/FOOD; unique `(userId, foodId)`; DB CHECK rating 1–5; indeks kedua FK. USER API meng-upsert pasangan dan mengisi firstUsedAt secara atomik. |
| `FoodImport` | adminId, filename, checksum, total/inserted rows, status, private `stagingKey`, timestamp | FK admin restrictive; count CHECK; status VALIDATED/PROCESSING/COMPLETED/FAILED; history tak dapat dihapus via trigger. |
| `DatasetExport` | adminId, filename, checksum, rowCount, private `filePath`, timestamp | FK restrictive; row count CHECK; update/delete dicegah trigger. CSV `user_id,food_id,rating` disimpan di private `FOODREC_STORAGE_DIR/rating-exports`. |
| `RecommendationBatch` | datasetExportId, import admin, publisher, status, kNeighbors, topN, similarity, filename/checksum/private file key, validationReport, timestamps | FK restrictive; params harus positif; batch tidak dapat dihapus via trigger; publishedAt/publisher wajib saat PUBLISHED; partial unique index mengizinkan maksimal satu batch PUBLISHED. |
| `Recommendation` | batchId, userId, foodId, rank, timestamp | FK restrictive; unique batch-user-food dan batch-user-rank; rank positif; rows dibuat all-or-nothing dari CSV tervalidasi. |

Semua ID domain numerik (`SERIAL`) untuk dataset penelitian. Timestamp database memakai PostgreSQL timestamp; Prisma `@updatedAt` mengisi update melalui client.

## Tabel teknis Better Auth

`Session`, `Account`, dan `Verification` diperlukan Better Auth. Ini menambah model teknis di luar tujuh entitas domain. Credential password disimpan sebagai hash scrypt pada `Account.password`; bukan plaintext dan tidak dikirim ke client. User/session/account memakai integer serial sesuai opsi Better Auth `generateId: "serial"`.

Session dan Account cascade saat User dihapus karena keduanya data autentikasi teknis. Rating, import, export, batch, dan recommendation menggunakan `RESTRICT` agar histori tidak hilang bersama account.

## Penghapusan dan snapshot

- Food tanpa `firstUsedAt`, rating, atau recommendation dapat hard-delete; Food dengan history hanya dapat dinonaktifkan lewat `isActive`. Server memeriksa eligibility, PostgreSQL FK `RESTRICT`, dan trigger delete saat `firstUsedAt` tidak null.
- Food Code dinormalisasi uppercase dan immutable melalui application API serta migration trigger.
- FK data rating/rekomendasi/admin mencegah penghapusan User/Food yang masih direferensikan.
- `DatasetExport` merupakan snapshot metadata immutable; `filePath` untuk storage privat, bukan URL publik.
- `FoodImport` dan `RecommendationBatch` memiliki trigger larangan delete; perubahan lifecycle tetap melalui status. CSV staging disimpan di `FOODREC_STORAGE_DIR/food-imports`, snapshot rating di `rating-exports`, dan result CSV di `recommendation-imports`; file key/path tidak pernah dikirim ke client.
- `Recommendation` rows tidak menggunakan cascade; batch/Food/User referensi tetap dibatasi FK `RESTRICT`.
- Tidak ada cascade untuk data penelitian.

## Migrasi dan seed

`npm run db:migrate` memakai Prisma Migrate dan migration tersimpan di repository. `npm run db:migrate:deploy` untuk deployment. `npm run db:seed` provision ADMIN lewat `ADMIN_EMAIL`/`ADMIN_PASSWORD` tanpa auto-promote. `npm run db:seed:foods` menambahkan 40 makanan (`createMany(skipDuplicates)`), tanpa rating atau recommendation dummy. F3 migration menambahkan `FoodImport.stagingKey` dan status `PROCESSING`; delete-guard migration mencegah hard-delete Food bertanda `firstUsedAt`. F6 migration menambahkan filename/private key/validation report/publisher, merapikan legacy PUBLISHED batch menjadi satu batch aktif, dan memasang constraint/index publikasi. Migration additive; tidak reset data.

## Import dan publikasi rekomendasi

`RecommendationBatch.adminId` mencatat admin pengunggah; `publishedById` mencatat admin yang menerbitkan. `filePath` hanya berisi key opaque pada private storage. `validationReport` JSON menyimpan summary, warning stale/rating baru, preview terbatas, dan seluruh error per baris. Recommendation rows hanya dibuat untuk batch tervalidasi.

Publikasi memakai PostgreSQL transaction advisory lock dan partial unique index `RecommendationBatch_one_published_idx`; status batch aktif lama menjadi `SUPERSEDED` dalam transaksi yang sama. `publishedAt` dan `publishedById` diwajibkan oleh CHECK constraint pada status PUBLISHED. FK Recommendation tetap RESTRICT dan rank/user-food uniqueness yang ada tetap berlaku.

F3 dan recommendation migrations diterapkan additive pada database development yang dikonfigurasi dan diuji pada database `foodrec_test` terpisah. Integration runner menolak database yang tidak berakhiran `_test`, melakukan `migrate deploy` additive, lalu seed tanpa reset. Data aplikasi tidak di-reset.
