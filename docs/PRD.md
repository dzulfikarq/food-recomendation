# Product Requirements Document — FoodRec

Status fitur menggunakan **Implemented**, **Planned**, dan **Pending Validation**. Desain fitur masa depan bukan bukti fitur tersebut tersedia.

## 1. Product Overview

FoodRec adalah aplikasi web untuk membangun sistem rekomendasi makanan dari preferensi/rating pengguna. Website menyimpan akun, katalog, dan data penelitian. User-Based Collaborative Filtering dengan Cosine Similarity diproses manual oleh administrator di **Altair AI Studio Educational 2026.1.1**; website bertukar dataset dan hasil lewat CSV pada fase mendatang. Algoritma tidak dijalankan backend.

Fase 1–2 menyediakan foundation, design system, PostgreSQL, autentikasi, dan role. Fase 3 menambahkan Food Management; Fase 4 menambahkan katalog/rating USER dan snapshot CSV ADMIN. Fase 5+ tetap belum dibangun.

- **Implemented:** Fase 1–4; foundation, auth/role, Food Management, user catalog/rating/history, private rating CSV snapshot, dan 40-item seed. Integration diuji pada database `_test` terpisah.
- **Planned:** manual Altair processing, recommendation-result import/validation/publication, dan public recommendation UI.
- **Pending Validation:** storage/deployment production, security/performance production, dan review visual/accessibility lintas viewport.

## 2. Problem Statement

Pengguna membutuhkan cara menemukan makanan sesuai preferensi, sementara pola rating dapat memberi sinyal preferensi kolektif. FoodRec kini menyediakan katalog aktif dan rating eksplisit; rekomendasi personal disiapkan untuk fase berikutnya dan pemrosesan CF tidak dijalankan backend.

## 3. Product Goals

1. Menyediakan fondasi aman dan responsif untuk akun Guest, USER, dan ADMIN.
2. Menyimpan identitas numeric serta relasi data penelitian dengan integritas referensial.
3. Mendukung workflow UBCF/Cosine Similarity manual via Altair dan CSV pada fase mendatang.

**Kriteria keberhasilan usulan — Pending Validation:** register → login → session persisten → logout; hanya ADMIN dapat membuka dashboard; tidak ada data penelitian yang hilang akibat cascade; target aktivasi, relevansi, dan performa ditetapkan setelah uji pengguna/dataset tersedia.

## 4. User Roles

| Role | Hak akses | Status |
| --- | --- | --- |
| Guest | Membuka public home, register, login. Tidak dapat membuka `/admin` atau Food Management API. | **Implemented; integration test lulus**. |
| USER | Home, katalog Food aktif, rating 1–5, riwayat rating, login/logout. Tidak dapat membuka `/admin`. Rekomendasi personal belum tersedia. | **Implemented; integration test lulus**. |
| ADMIN | Login, protected dashboard, list/create/edit Food, upload image, hybrid delete/status, CSV insert-only import, export snapshot rating. Altair/recommendation workflow belum tersedia. | **Implemented; integration lulus**. |

## 5. Functional Requirements

### Public dan autentikasi

| ID | Requirement | Status |
| --- | --- | --- |
| P-01 | Home menjelaskan FoodRec, pendekatan rekomendasi manual, dan CTA auth tanpa katalog/hasil dummy. | Implemented |
| P-02 | Responsive public layout, disabled navigation untuk fitur masa depan, footer. | Implemented |
| A-01 | Register name/email/password/confirmation; validasi client UX dan server; email trim/lowercase; password minimal 8. | Implemented; PostgreSQL Server Action integration lulus |
| A-02 | Semua register publik membuat role USER; role request diabaikan/dikunci server-side. | Implemented; role USER terverifikasi pada integration |
| A-03 | Login email/password; generic error; redirect USER ke `/`, ADMIN ke `/admin`. | Implemented; auth/session/role integration lulus |
| A-04 | Logout mencabut session server-side; refresh mempertahankan session aktif. | Implemented; session API integration lulus |
| A-05 | Auth pages memiliki loading, error, label dan responsive state. | Implemented; accessibility review Pending Validation |
| A-06 | Rate limit login dan register; cookie HttpOnly/SameSite=Lax/Secure pada HTTPS; CSRF/origin handling melalui Better Auth. | Implemented; deployment/security review Pending Validation |

### Katalog dan rating USER

| ID | Requirement | Status |
| --- | --- | --- |
| U-01 | Guest/USER menjelajahi Food aktif di `/foods` dengan search, kategori, sorting dan pagination. | Implemented; PostgreSQL integration lulus |
| U-02 | USER memberi/memperbarui rating integer 1–5; satu rating per pasangan user-Food. Guest dan ADMIN tidak dapat menulis rating. | Implemented; API/database integration lulus |
| U-03 | `firstUsedAt` diisi sekali secara atomik pada rating pertama dan tidak berubah pada update rating. | Implemented; integration lulus |
| U-04 | USER melihat riwayat rating sendiri di `/my-ratings`; tidak dapat membaca rating milik USER lain. | Implemented; owner-only integration lulus |

### Admin

| ID | Requirement | Status |
| --- | --- | --- |
| AD-01 | Dashboard Admin memiliki server-side role guard, identitas admin, welcome state dan informasi modul mendatang tanpa statistik dummy. | Implemented; Guest/USER/ADMIN route integration lulus |
| AD-02 | Provisioning admin lewat environment-backed idempotent seed; tidak auto-promote USER dan tidak hardcode credentials. | Implemented; seed idempotence dan admin login diuji |
| AD-03 | Food Management list, server search/filter/sort/pagination, create/edit, image upload, activate/deactivate, history-aware permanent delete. | Implemented; PostgreSQL integration lulus |
| AD-04 | CSV katalog dengan template, validation preview, row errors, insert-only commit atomik dan FoodImport history. | Implemented; PostgreSQL integration lulus |
| AD-05 | Ekspor snapshot dataset rating tanpa PII untuk Altair, dengan checksum dan download ADMIN-only. | Implemented; PostgreSQL integration lulus |
| AD-06 | Manual Altair processing, result import/validation/publication. | Planned |

## 6. User Flows

### Registrasi — Implemented

Guest → `/register` → isi nama/email/password/konfirmasi → Server Action Zod memvalidasi semua field → email dinormalisasi → Better Auth membuat akun dan session → hook mengunci role `USER` → kembali ke `/`. Flow Server Action diuji terhadap PostgreSQL.

### Login — Implemented

Guest → `/login` → kirim email/password → Better Auth memverifikasi hash dan membuat database session → role `ADMIN` diarahkan `/admin`, role `USER` ke `/`. Kredensial invalid mendapat pesan generik. Auth API/session dan protected route integration lulus.

### Logout — Implemented

Pengguna mengirim aksi logout → Better Auth mencabut session dan cookie → redirect `/`. Session persistence/revocation Server Action diuji terhadap PostgreSQL.

### Katalog makanan dan rating — Implemented

Guest/USER membuka `/foods` → hanya Food aktif ditampilkan → USER memilih rating integer 1–5 → server mengunci Food row, upsert `(userId,foodId)`, dan mengisi `firstUsedAt` sekali dalam transaction. USER melihat/memperbarui rating pribadi di `/my-ratings`; Food nonaktif tetap terlihat dalam history tetapi tidak dapat dinilai lagi.

### Penerimaan rekomendasi — Planned

Setelah batch hasil Altair tervalidasi dan dipublikasikan, USER akan melihat hasil batch aktif. Backend tidak menghitung UBCF.

## 7. Admin Flows

Dashboard admin, Food Management, dan dataset rating **Implemented**:

1. **Kelola makanan:** ADMIN membuka `/admin/foods`, mencari/memfilter katalog, menambah/edit data dan foto, mengaktifkan/menonaktifkan, atau menghapus permanen record tanpa histori.
2. **Import katalog:** ADMIN unduh template → unggah CSV → server validasi format dan setiap baris → preview → ADMIN commit → seluruh record baru tersimpan satu transaksi dan `FoodImport` mencatat hasil. Existing Food Code tidak diubah. Invalid file tidak dapat di-commit.
3. **Ekspor dataset rating:** ADMIN membuka `/admin/ratings` → membuat snapshot → CSV `user_id,food_id,rating` dibuat dari satu query snapshot → metadata/checksum disimpan di `DatasetExport` → ADMIN mengunduh file privat melalui endpoint terproteksi. Email/nama tidak diekspor.

Alur berikut **Planned**:

4. **Altair manual:** ADMIN memuat CSV di Altair AI Studio Educational 2026.1.1, menjalankan workflow UBCF/Cosine, lalu ekspor hasil. Tidak ada integrasi/API Altair.
5. **Impor/validasi hasil:** hasil CSV menjadi draft `RecommendationBatch`; referensi, skor/rank dan duplikasi diperiksa; invalid batch tidak dapat dipublikasikan.
6. **Publikasi:** ADMIN memublikasikan batch tervalidasi secara konsisten; batch lama disimpan dan ditandai SUPERSEDED.

## 8. Recommendation System

- Metode penelitian: **User-Based Collaborative Filtering (UBCF)**.
- Similarity: **Cosine Similarity**, `sim(u,v) = (r_u · r_v) / (||r_u|| × ||r_v||)`, dihitung pada item yang sama-sama dinilai sesuai workflow final.
- Mesin utama: **Altair AI Studio Educational 2026.1.1**, proses manual administrator.
- Website menyimpan rating dan snapshot export; batch/recommendation result ditambahkan pada fase berikutnya. Website **tidak** menjalankan algoritma.
- Minimum overlap, centering/normalisasi rating, rumus prediksi, tie-break, cold-start, `kNeighbors`, `topN`, score scale dan evaluasi **Pending Validation**.

## 9. CSV Integration

Kontrak CSV katalog dan ekspor rating **Implemented**; CSV hasil rekomendasi **Planned**. Kompatibilitas Altair **Pending Validation**. Format memakai UTF-8/BOM, header berurutan dan wajib, comma delimiter, quoted fields RFC 4180. Food import dibatasi 2 MB/1.000 baris; ukuran export rating mengikuti jumlah rating.

| CSV | Header usulan | Validasi usulan |
| --- | --- | --- |
| Katalog makanan | `food_code,name,description,category,taste,origin,protein_type,price_category,meal_time,texture,health_level,diet_category` | **Implemented:** header UTF-8 strict; kode/nama/kategori/rasa/asal wajib; enum/length tervalidasi; duplicate Food Code di file/DB ditolak; tidak ada update existing; row errors dilaporkan; commit all-or-nothing. Foto ditambahkan melalui form edit. Maksimum 2 MB/1.000 baris. |
| Dataset rating | `user_id,food_id,rating` | **Implemented:** numeric stable ID, rating integer 1–5, unique user-food; tanpa email/nama/password/hash; snapshot checksum dan file privat immutable. |
| Hasil rekomendasi | `user_id,item_id,rank` | `item_id` memetakan Food; FK valid; rank integer positif dan unik per user-batch; tidak rekomendasikan pasangan invalid/duplikat; batch/checksum dicatat. |

Food CSV template/preview/atomic import dan rating CSV snapshot/checksum/download **Implemented**. Food filename dibatasi 255 karakter. Kontrak result CSV, score format, dan Altair compatibility **Pending Validation**.

## 10. Database Requirements

| Model | Tujuan | Constraint inti | Status |
| --- | --- | --- | --- |
| User | Identitas/auth/role; integer auto-increment. | Email unique; role USER/ADMIN; nama, email, timestamps. Credential hash disimpan pada `Account.password` sesuai Better Auth. | Implemented |
| Food | Katalog penelitian. | Integer ID, unique immutable foodCode, metadata yang diminta, isActive, firstUsedAt. | Implemented; CRUD admin tersedia |
| Rating | Preferensi explicit USER. | FK User/Food, unique user-food, CHECK integer 1–5, index kedua FK. `firstUsedAt` diisi atomik saat rating pertama. | Implemented; API/UI/history tersedia |
| FoodImport | Audit import katalog. | FK admin restrictive, checksum, row counts, VALIDATED/PROCESSING/COMPLETED/FAILED, private staging key. | Implemented; preview/atomic commit tersedia |
| DatasetExport | Metadata snapshot CSV rating. | FK admin restrictive, count/checksum/private path, immutable trigger. | Implemented; ADMIN export/download tersedia |
| RecommendationBatch | Status dan parameter hasil Altair. | FK DatasetExport/Admin restrictive, status DRAFT/VALIDATED/PUBLISHED/SUPERSEDED, k/topN positif. | Implemented (schema only) |
| Recommendation | Rank result. | FK batch/user/food restrictive; unique batch-user-food dan batch-user-rank; rank positif. | Implemented (schema only) |

Better Auth memerlukan tabel teknis Session, Account, Verification. Session/Account boleh cascade saat User dihapus; relasi penelitian memakai RESTRICT. Snapshot/history tidak boleh terhapus tanpa sengaja. FoodImport staging key menyimpan identifier file privat, bukan path absolut yang dikirim ke client. Fase 3 migration/constraints telah diuji pada PostgreSQL `_test`; deployment DB **Pending Validation**.

## 11. UI/UX Requirements

- Modern Food App, bersih, hangat, food-focused; background putih dan section cream.
- Token: Primary `#F97316`, hover `#EA580C`, soft `#FFF7ED`, green `#14532D`, white `#FFFFFF`, text `#111827`, secondary `#6B7280`, border `#E5E7EB`.
- Font Plus Jakarta Sans via Next font optimization; Lucide icons; rounded cards 12–16px; focus/hover/disabled/error/loading.
- Public navigation mengaktifkan Home dan Jelajahi Makanan; Rating Saya tersedia setelah USER login. Recommendation tetap disabled “Segera hadir”. Admin sidebar desktop/mobile mengaktifkan Kelola Makanan dan Data Rating; Recommendation tetap nonaktif.
- Halaman yang tersedia: `/`, `/login`, `/register`, `/foods`, `/my-ratings`, `/admin`, not-found dan error. `/my-ratings` USER-only; `/admin` ADMIN-only.
- Admin pages: `/admin/foods`, `/admin/foods/new`, `/admin/foods/[id]/edit`, `/admin/foods/import`, `/admin/ratings`; Data Rating aktif, recommendation menu tetap nonaktif.
- Image preview menggunakan image tersimpan atau file terpilih; placeholder dipakai bila tidak ada foto. Tidak ada rating/statistik/rekomendasi dummy. Manual viewport/accessibility review **Pending Validation**.

## 12. Non-Functional Requirements

| Area | Requirement | Status |
| --- | --- | --- |
| Security | Password hash, session DB, secure cookies, CSRF/origin, server role guard, Zod validation, rate limit. | Implemented; deployment/security test Pending Validation |
| Integrity | PostgreSQL FKs/index/unique/CHECK, research history restrictive, immutable snapshot, insert-only CSV transaction. | Food/Rating/export migrations dan transaction checks diuji pada PostgreSQL `_test`; deployment DB Pending Validation |
| Performance | Connection singleton, indexes; pagination/benchmark saat data tumbuh. | Singleton/index Implemented; target p95 Pending Validation |
| Maintainability | Modular App Router, strict TS, Prisma migration, shared UI, lint/test scripts. | Implemented; CI not configured |
| Usability | Responsive forms, errors, pending state, labels, keyboard focus. | Implemented; manual accessibility check Pending Validation |
| Operations | PostgreSQL backup, rate limit storage lintas instance, secrets management, monitoring. | Planned |

## 13. Business Rules

1. Registrasi publik selalu USER; role dari body diabaikan/dikunci server. **Implemented**.
2. ADMIN hanya dari provisioning eksplisit env-backed; seed tidak mempromosikan USER. **Implemented**.
3. Session terikat user, server-side database, kadaluarsa; logout revoke. **Implemented; integration lulus**.
4. `foodCode` tidak berubah setelah insert; metadata snapshot export tidak berubah. **Implemented di migration; foodCode trigger diuji**.
5. USER memberi rating integer 1–5; upsert memperbarui pasangan user-food yang sama dan menandai `firstUsedAt` atomik. **Implemented**.
6. Makanan tanpa `firstUsedAt`, rating, atau recommendation reference boleh hard-delete. Makanan dengan histori hanya dapat dinonaktifkan/diaktifkan; FK database menjadi lapisan terakhir. **Implemented**.
7. Altair dikerjakan manual; hasil tidak tampil sebelum validasi/publikasi batch. **Planned**.
8. Import katalog insert-only; jika satu baris invalid, tidak ada record makanan yang disimpan. **Implemented; concurrent commit diuji**.
9. Food Code immutable setelah insert. Makanan import dibuat ACTIVE dan tidak mengubah item existing. **Implemented**.

## 14. Development Roadmap

| Fase | Cakupan | Status | Dependensi |
| --- | --- | --- | --- |
| 1. Project Foundation & Design System | Next.js, TS, Tailwind, fonts/icons, layouts, home, shared primitives, errors. | Implemented; UI review Pending Validation | — |
| 2. Database Foundation, Authentication & Authorization | PostgreSQL, tujuh model domain, Better Auth, roles, seed, protected dashboard. | Implemented; isolated PostgreSQL integration lulus; production DB Pending Validation | F1 |
| 3. Food Management | Admin list/search/filter/sort/pagination, CRUD, image upload, hybrid delete/reactivate, CSV template/preview/insert-only import, 40 food seed. | Implemented; PostgreSQL integration lulus | F2 |
| 4. Rating workflows & data exchange | Public catalog, rating 1–5/history, Admin snapshot CSV `user_id,food_id,rating`. | Implemented; PostgreSQL integration lulus | F3 |
| 5. Altair workflow | Manual UBCF/Cosine process dan result CSV import. | Planned; parameters Pending Validation | F4 |
| 6. Validation and audit | Result checks, import report, batch lifecycle/audit. | Planned | F5 |
| 7. Recommendation publication | Atomic publish and user recommendation UI. | Planned | F6 |
| 8. Hardening/release | Security, accessibility, load, operations and deployment. | Planned | F1–F7 |

## 15. Acceptance Criteria

| Area | Kriteria | Status |
| --- | --- | --- |
| F1 foundation | App build/lint/typecheck; design tokens/font; public/auth/admin responsive structure; accessible 404/error. | Implemented; build/lint/typecheck lulus; visual review Pending Validation |
| Home | Beranda dapat dibuka tanpa catalog/result dummy, CTA auth berfungsi. | Implemented; route integration lulus |
| Registration | Name/email/password/confirm tervalidasi server; mismatch/duplicate ditolak; role selalu USER. | PostgreSQL Server Action integration lulus |
| Login/session/logout | Login valid, error generik, session bertahan refresh, logout mencabut session. | Better Auth/PostgreSQL integration lulus |
| Authorization | Guest/USER ditolak dari `/admin`; ADMIN dapat masuk; server layout/page cek role. | Guest/USER/ADMIN route integration lulus |
| Admin seed | Env-backed, idempotent, no hardcoded credential, existing USER tidak dipromosikan. | Seed idempotence dan admin login lulus |
| Database | Tujuh model, auth tables, migration valid, unique/FK/check/trigger sesuai schema. | Migration applied; unique/CHECK/FK/foodCode trigger diuji pada PG17 |
| Food Management F3 | Admin CRUD/list, immutable code, uploads, status, hybrid delete and reactivation. | PostgreSQL integration lulus |
| CSV food import F3 | Strict parser, UTF-8/template/preview, duplicate checks, no partial commit, concurrent/idempotent commit, audit history. | PostgreSQL integration lulus |
| Rating F4 | Guest tidak bisa menulis; USER create/update 1–5; unique user-food; inactive food ditolak; firstUsedAt ditandai; history privat tersedia. | PostgreSQL integration lulus |
| Rating export F4 | Admin membuat snapshot stabil, CSV berisi ID/rating saja, checksum/file privat, akses download admin-only. | PostgreSQL integration lulus |
| F5–F8 | Acceptance sesuai roadmap masing-masing setelah implementasi. | Planned |

## 16. Open Questions & Risks

- Production PostgreSQL credentials/availability masih Pending Validation; migration/auth tests lulus pada isolated PostgreSQL 17 sementara.
- Local image storage requires persistent filesystem; serverless/ephemeral production hosting needs a mounted volume or object storage provider. Production storage provider has not been configured.
- Rating CSV snapshot saat ini dibuffer di memory; verifikasi benchmark dan pindah ke cursor streaming sebelum dataset membesar.
- Import preview drafts are private server files keyed by an opaque staging key; an automated retention/expiry cleanup job is not implemented.
- `User.passwordHash` pada draft field-level tidak dipakai: Better Auth menyimpan password hash di `Account.password`. Tidak ada plaintext; ini keputusan penyelarasan library, bukan auth custom.
- Better Auth in-memory rate limit efektif per process; distributed deployment memerlukan shared storage.
- Definisi enum food attributes, semantics `healthLevel`, CSV final, score field, model parameters dan output Altair **Pending Validation**.
- Kebijakan retensi/penghapusan akun, email verification dan password recovery berada di luar fase ini.
- `next/font/google` butuh akses font saat build pertama; validasi build environment diperlukan.
- File SQLite lama dipertahankan, tidak diimpor. Migrasi manual diperlukan jika menyimpan data yang perlu digunakan.
- Docker CLI tidak terpasang di environment audit; gunakan PostgreSQL development yang sudah memiliki kredensial atau install Docker untuk Compose.
