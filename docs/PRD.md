# Product Requirements Document — FoodRec

Status fitur menggunakan **Implemented** (kode tersedia), **Tested** (automated/integration check lulus), **Planned** (belum dibangun), dan **Pending Validation** (butuh validasi data/operasional nyata).

## 1. Product Overview

FoodRec adalah aplikasi web untuk menjelajahi makanan, menyimpan preferensi pengguna, dan menyajikan rekomendasi yang telah diterbitkan. Website menyimpan akun, katalog, rating, snapshot, batch, riwayat audit, antrean recommendation job durable, dan artifact staging yang belum terverifikasi. Altair manual tetap menjadi jalur riset/publikasi; Python worker dapat menjalankan job manual terpilih ke staging. Phase E menambahkan dashboard monitoring operasional dan panduan enam tahap dengan memakai API yang ada; otomatisasi tetap DB-locked sampai mathematical parity tervalidasi.

Implementasi mencakup foundation, autentikasi, Food Management, rating, snapshot CSV, validasi hasil Altair, manajemen batch, publikasi, dan halaman rekomendasi USER. Pemrosesan Altair tetap manual; kesesuaian dengan file penelitian asli dan review visual lintas perangkat masih perlu divalidasi.

- **Implemented:** foundation/auth, Food Management, rating/export, recommendation import/validation/publish, batch history, dan halaman rekomendasi personal.
- **Tested:** 15 npm unit tests, 24 Python tests, 6 PostgreSQL integration suites, and 4 real-browser E2E journeys on isolated `_test` databases; production database/storage/security/performance and manual assistive-technology review remain separate.
- **Pending Validation:** round-trip dengan file penelitian Altair nyata dan production operations.

## FoodRec V2 status

Phase C menyediakan antrean PostgreSQL, internal API terautentikasi, dan Python worker. Phase D menambahkan revision rating durable, snapshot konsisten, scheduler worker, dedupe, heartbeat, dan monitoring API. Phase E menampilkan status aktual dan enam langkah workflow manual. Phase F QA memverifikasi browser Guest/USER/Admin, workflow CSV, security gates, serta real Python worker pada PostgreSQL `_test`. DB checks/trigger tetap memaksa auto-processing/publication OFF, `PENDING_VALIDATION`, dan menolak automatic jobs. Job manual menghasilkan artifact `UNVERIFIED`; `SUCCEEDED` hanya berarti komputasi selesai. Phase B: screenshot 43 rating **MATCHED OUTPUT**; Top-1 train-264 **MISMATCH**. Paritas matematis tetap **Pending Validation**. Lihat [`RECOMMENDATION_ENGINE_VALIDATION.md`](RECOMMENDATION_ENGINE_VALIDATION.md) dan [`PHASE_F_VERIFICATION.md`](PHASE_F_VERIFICATION.md).

## 2. Problem Statement

Pengguna membutuhkan cara menemukan makanan sesuai preferensi, sementara pola rating dapat memberi sinyal preferensi kolektif. FoodRec menyediakan katalog aktif dan rating eksplisit. Admin tetap dapat memproses dataset di Altair dan menerbitkan hasil; Phase C juga dapat menghitung hasil Python ke staging, namun tidak memublikasikannya.

## 3. Product Goals

1. Menyediakan fondasi aman dan responsif untuk akun Guest, USER, dan ADMIN.
2. Menyimpan identitas numeric serta relasi data penelitian dengan integritas referensial.
3. Mendukung pertukaran dataset dan hasil CSV untuk workflow UBCF/Cosine Similarity manual via Altair.

**Kriteria keberhasilan usulan — Pending Validation:** register → login → session persisten → logout; hanya ADMIN dapat membuka dashboard; tidak ada data penelitian yang hilang akibat cascade; target aktivasi, relevansi, dan performa ditetapkan setelah uji pengguna/dataset tersedia.

## 4. User Roles

| Role | Hak akses | Status |
| --- | --- | --- |
| Guest | Membuka beranda dan katalog aktif; dapat daftar atau masuk. Tidak dapat memberi rating atau membuka `/admin`. | **Implemented**; route/auth integration coverage ada. |
| USER | Beranda personal, katalog dan filter rating, rating 1–5, riwayat, serta rekomendasi batch terbit yang cocok dengan akun. Tidak dapat membuka `/admin`. | **Implemented**; owner/filter integration coverage ada. |
| ADMIN | Semua operasi Food dan snapshot rating; impor/validasi CSV Altair, preview, publikasi atomic, dan riwayat batch. | **Implemented; API/DB integration Tested**; output Altair penelitian nyata **Pending Validation**. |

## 5. Functional Requirements

### Public dan autentikasi

| ID | Requirement | Status |
| --- | --- | --- |
| P-01 | Guest melihat tujuan dan langkah produk; USER melihat ringkasan rating, langkah berikutnya, status rekomendasi, dan tanggal publikasi bila ada. Semua angka berasal dari database. | Implemented |
| P-02 | Public navigation mengarah ke beranda, katalog, rating, dan rekomendasi yang tersedia; halaman tetap responsif. | Implemented; Chromium viewport/focus/overflow checks pass; manual screen-reader/contrast review Pending Validation |
| A-01 | Register name/email/password/confirmation; validasi client UX dan server; email trim/lowercase; password minimal 8. | Implemented; PostgreSQL Server Action integration lulus |
| A-02 | Semua register publik membuat role USER; role request diabaikan/dikunci server-side. | Implemented; role USER terverifikasi pada integration |
| A-03 | Login email/password; generic error; redirect USER ke `/`, ADMIN ke `/admin`. | Implemented; auth/session/role integration lulus |
| A-04 | Logout mencabut session server-side; refresh mempertahankan session aktif. | Implemented; session API integration lulus |
| A-05 | Auth pages memiliki loading, error, label dan responsive state. | Implemented; accessibility review Pending Validation |
| A-06 | Rate limit login dan register; cookie HttpOnly/SameSite=Lax/Secure pada HTTPS; CSRF/origin handling melalui Better Auth. | Implemented; deployment/security review Pending Validation |

### Katalog dan rating USER

| ID | Requirement | Status |
| --- | --- | --- |
| U-01 | Guest/USER menjelajahi Food aktif di `/foods` dengan search, kategori, sorting dan pagination; USER dapat memfilter sudah/belum dinilai dan melihat progres rating aktif sebagai ringkasan, bukan target. | Implemented; PostgreSQL integration coverage |
| U-02 | USER memberi/memperbarui rating integer 1–5; satu rating per pasangan user-Food. Guest dan ADMIN tidak dapat menulis rating. | Implemented; API/database integration lulus |
| U-03 | `firstUsedAt` diisi sekali secara atomik pada rating pertama dan tidak berubah pada update rating. | Implemented; integration lulus |
| U-04 | USER melihat jumlah, rata-rata, dan riwayat rating sendiri di `/my-ratings`, serta kembali ke katalog; tidak dapat membaca rating milik USER lain. | Implemented; owner-only integration lulus |
| U-05 | USER melihat rekomendasi batch PUBLISHED miliknya sendiri; rekomendasi yang sudah dinilai dan Food nonaktif disembunyikan. | Implemented; owner/filter integration Tested |

### Admin

| ID | Requirement | Status |
| --- | --- | --- |
| AD-01 | Dashboard Admin memiliki server-side role guard, identitas admin, jumlah makanan aktif, pengguna pemberi rating, total rating, status dataset, batch aktif, job terakhir, heartbeat worker, validation gate, dan tindakan berikutnya berbasis kondisi data. | Implemented; statistik diambil dari database |
| AD-02 | Provisioning admin lewat environment-backed idempotent seed; tidak auto-promote USER dan tidak hardcode credentials. | Implemented; seed idempotence dan admin login diuji |
| AD-03 | Food Management list, server search/filter/sort/pagination, create/edit, image upload, activate/deactivate, history-aware permanent delete. | Implemented; PostgreSQL integration lulus |
| AD-04 | CSV katalog dengan template, validation preview, row errors, insert-only commit atomik dan FoodImport history. | Implemented; PostgreSQL integration lulus |
| AD-05 | Ekspor snapshot dataset rating tanpa PII untuk Altair, dengan checksum dan download ADMIN-only. | Implemented; PostgreSQL integration lulus |
| AD-06 | ADMIN mengimpor hasil CSV dengan dataset sumber dan k/Top-N; validasi all-or-nothing, preview, error row, stale warnings, checksum, dan report. | Implemented; parser/API integration Tested |
| AD-07 | Publish batch tervalidasi secara atomic; batch lama SUPERSEDED, publisher dan waktu tersimpan, history dapat ditinjau. | Implemented; PostgreSQL concurrent publication Tested |
| AD-08 | Workflow enam tahap menampilkan status berbasis bukti database; dataset dapat disiapkan/diunduh, Altair dijalankan manual, hasil diimpor/divalidasi, publikasi tetap manual, dan riwayat audit tidak berubah. | Browser E2E and PostgreSQL workflow integration pass with synthetic CSV; real Altair research file and manual accessibility review Pending Validation |
| AD-09 | Admin membaca gate/config, dirty revision, scheduler, job detail, safe errors, stale/UNVERIFIED artifact, heartbeat kedaluwarsa, batch published terakhir, serta last successful computation lewat API monitoring existing; UI tidak mengubah gate. | PostgreSQL integration and browser gate/worker E2E pass; automatic processing/publication remain locked |

## 6. User Flows

### Registrasi — Implemented

Guest → `/register` → isi nama/email/password/konfirmasi → Server Action Zod memvalidasi semua field → email dinormalisasi → Better Auth membuat akun dan session → hook mengunci role `USER` → `/` menampilkan beranda personal dan langkah onboarding berbasis data akun.

### Login — Implemented

Guest → `/login` → kirim email/password → Better Auth memverifikasi hash dan membuat database session → role `ADMIN` diarahkan `/admin`, role `USER` ke `/`. Kredensial invalid mendapat pesan generik. Auth API/session dan protected route integration lulus.

### Logout — Implemented

Pengguna mengirim aksi logout → Better Auth mencabut session dan cookie → redirect `/`. Session persistence/revocation Server Action diuji terhadap PostgreSQL.

### Katalog makanan dan rating — Implemented

Guest/USER membuka `/foods` → hanya Food aktif ditampilkan → USER memilih rating integer 1–5 → server mengunci Food row, upsert `(userId,foodId)`, dan mengisi `firstUsedAt` sekali dalam transaction. USER melihat/memperbarui rating pribadi di `/my-ratings`; Food nonaktif tetap terlihat dalam history tetapi tidak dapat dinilai lagi.

### Penerimaan rekomendasi — Implemented

Setelah batch hasil Altair tervalidasi dan dipublikasikan, USER melihat hasil miliknya di `/recommendations`. Endpoint mengambil identity dari session, mengecualikan hasil yang kini telah dinilai dan Food nonaktif. Empty state membedakan belum ada rating, belum ada batch, akun tidak tercakup, seluruh kandidat sudah dinilai, dan tidak ada makanan aktif. Menyimpan rating tidak menghitung ulang UBCF atau menjamin hasil otomatis.

## 7. Admin Flows

Dashboard admin, Food Management, dan dataset rating **Implemented**:

1. **Kelola makanan:** ADMIN membuka `/admin/foods`, mencari/memfilter katalog, menambah/edit data dan foto, mengaktifkan/menonaktifkan, atau menghapus permanen record tanpa histori.
2. **Import katalog:** ADMIN unduh template → unggah CSV → server validasi format dan setiap baris → preview → ADMIN commit → seluruh record baru tersimpan satu transaksi dan `FoodImport` mencatat hasil. Existing Food Code tidak diubah. Invalid file tidak dapat di-commit.
3. **Ekspor dataset rating:** ADMIN membuka `/admin/ratings` → membuat snapshot → CSV `user_id,food_id,rating` dibuat dari satu query snapshot → metadata/checksum disimpan di `DatasetExport` → ADMIN mengunduh file privat melalui endpoint terproteksi. Email/nama tidak diekspor.

Alur berikut **Implemented**:

4. **Altair manual:** ADMIN memuat CSV di Altair AI Studio Educational 2026.1.1, menjalankan UBCF/Cosine/user k-NN, lalu ekspor hasil. FoodRec hanya memberi panduan dan tidak mengetahui proses eksternal selesai sebelum CSV diunggah. Tidak ada integrasi/API Altair; kesesuaian file real **Pending Validation**.
5. **Impor/validasi hasil:** ADMIN memilih DatasetExport sumber, mengisi parameter pemrosesan, dan mengunggah `user_id,item_id,rank`. Server memverifikasi checksum/snapshot sumber, user/Food ID, rank, duplikasi, Top-N, rating sumber, status Food, staleness, dan jumlah baris non-kosong. Error struktural/referensial menyimpan DRAFT tanpa Recommendation rows.
6. **Publikasi:** ADMIN meninjau report dan preview lalu konfirmasi. Server revalidasi dalam transaction; lock + partial unique index memastikan maksimal satu batch PUBLISHED. Batch aktif lama menjadi SUPERSEDED, tidak dihapus.
7. **Hasil personal:** `/api/me/recommendations` memakai user dari session. `/recommendations` menampilkan rank dan link Food detail; hasil nonaktif/sudah dinilai disaring.

## 8. Recommendation System

- Metode penelitian: **User-Based Collaborative Filtering (UBCF)**.
- Similarity: **Cosine Similarity**, `sim(u,v) = (r_u · r_v) / (||r_u|| × ||r_v||)`, dihitung pada item yang sama-sama dinilai sesuai workflow final.
- Jalur riset/publikasi utama: **Altair AI Studio Educational 2026.1.1**, proses manual administrator. Python engine juga dapat dijalankan oleh worker existing untuk job manual terkontrol, tetapi hasil staging tidak tervalidasi.
- Website menyimpan rating revisions, snapshots, parameters, Altair result CSV checksum, validation report, Recommendation rows, publication history, job leases, and `UNVERIFIED` artifacts. Tidak ada rekomendasi dihitung di rating request.
- Config defaults `autoProcessingEnabled=false`, `kNeighbors=3`, `topN=5`, interval 30 menit, engine `python-ubcf-v1`, validation `PENDING_VALIDATION`; nilai parameter bukan hasil optimasi penelitian. Database constraints mencegah Admin/API mengubah validation gate atau mengaktifkan processing/publication.
- Minimum overlap, centering/normalisasi rating, rumus prediksi, tie-break, cold-start, `kNeighbors`, `topN`, score scale dan evaluasi **Pending Validation**.

## 9. CSV Integration

Kontrak CSV katalog, rating, dan rekomendasi **Implemented**. Kompatibilitas Altair **Pending Validation**. Format memakai UTF-8/BOM, header berurutan, comma delimiter, quoted fields RFC 4180. Food import dibatasi 2 MB/1.000 baris; result import 2 MB/10.000 baris; ekspor rating mengikuti jumlah rating.

| CSV | Header usulan | Validasi usulan |
| --- | --- | --- |
| Katalog makanan | `food_code,name,description,category,taste,origin,protein_type,price_category,meal_time,texture,health_level,diet_category` | **Implemented:** header UTF-8 strict; kode/nama/kategori/rasa/asal wajib; enum/length tervalidasi; duplicate Food Code di file/DB ditolak; tidak ada update existing; row errors dilaporkan; commit all-or-nothing. Foto ditambahkan melalui form edit. Maksimum 2 MB/1.000 baris. |
| Dataset rating | `user_id,food_id,rating` | **Implemented:** numeric stable ID, rating integer 1–5, unique user-food; tanpa email/nama/password/hash; snapshot checksum dan file privat immutable. |
| Hasil rekomendasi | `user_id,item_id,rank` | **Implemented:** exact header; positive integer IDs; User ada dan masuk snapshot; `item_id` memetakan `Food.id`; Food aktif; pasangan user-food tidak ada pada snapshot; rank mulai 1/berurutan/unik; jumlah per user ≤ Top-N; CSV checksum dan full row errors dicatat. Stale snapshot dan kandidat yang baru dinilai menjadi warning. |

Food CSV template/preview/atomic import dan rating CSV snapshot/checksum/download **Implemented**. Result CSV contract `user_id,item_id,rank` **Implemented**; tidak ada score/similarity score pada format. Altair real-file compatibility **Pending Validation**.

## 10. Database Requirements

| Model | Tujuan | Constraint inti | Status |
| --- | --- | --- | --- |
| User | Identitas/auth/role; integer auto-increment. | Email unique; role USER/ADMIN; nama, email, timestamps. Credential hash disimpan pada `Account.password` sesuai Better Auth. | Implemented |
| Food | Katalog penelitian. | Integer ID, unique immutable foodCode, metadata yang diminta, isActive, firstUsedAt. | Implemented; CRUD admin tersedia |
| Rating | Preferensi explicit USER. | FK User/Food, unique user-food, CHECK integer 1–5, index kedua FK. `firstUsedAt` diisi atomik saat rating pertama; durable revision only changes on insert/delete/real value change. | Implemented; API/UI/history tersedia |
| RatingDatasetState | Revision durable dataset dan progress processing. | Singleton row; trigger hanya menambah current revision untuk insert/delete/perubahan nilai rating; processed revision stays ≤ current. | Phase D implemented; PostgreSQL integration Tested |
| FoodImport | Audit import katalog. | FK admin restrictive, checksum, row counts, VALIDATED/PROCESSING/COMPLETED/FAILED, private staging key. | Implemented; preview/atomic commit tersedia |
| DatasetExport | Metadata snapshot CSV rating. | FK admin restrictive, count/checksum/revision/private path, immutable trigger. | Implemented; ADMIN export/download tersedia |
| RecommendationBatch | Result CSV, sumber snapshot, importer/publisher, parameter, status, validasi. | FK restrictive; metadata validasi JSON; check publisher/waktu saat publish; maksimal satu PUBLISHED melalui partial unique index + transaction lock. | Implemented; publication concurrency Tested |
| RecommendationEngineConfig | Parameter server-side, worker schedule, processing/publication gate. | Singleton; CHECK locks auto flags false, validation PENDING, engine version fixed; bounds on parameters/interval. | Phase D implemented; API/DB gate Tested |
| RecommendationWorker | Worker heartbeat/version for operations monitoring. | Worker ID primary key; timestamp index; stale heartbeats shown offline. | Phase D implemented; PostgreSQL integration Tested |
| RecommendationJob / Artifact | Durable manual queue and staging output. | Unique idempotency/dedupe keys, leases/retries; DB trigger blocks automatic job; artifacts `UNVERIFIED`, source/current revision and stale flag. | Phase C/D implemented; PostgreSQL integration Tested |
| Recommendation | Rank result per batch/user/food. | FK restrictive; unique batch-user-food dan batch-user-rank; rank positif; tanpa cascade. | Implemented; owner/filter Tested |

Better Auth memerlukan tabel teknis Session, Account, Verification. Session/Account boleh cascade saat User dihapus; relasi penelitian memakai RESTRICT. Snapshot/history tidak boleh terhapus tanpa sengaja. FoodImport staging key menyimpan identifier file privat, bukan path absolut yang dikirim ke client. Fase 3 dan Phase D migrations/constraints telah diuji pada PostgreSQL `_test`; deployment DB **Pending Validation**.

## 11. UI/UX Requirements

- Modern Food App, bersih, hangat, food-focused; background putih dan section cream.
- Token: Primary `#F97316`, hover `#EA580C`, soft `#FFF7ED`, green `#14532D`, white `#FFFFFF`, text `#111827`, secondary `#6B7280`, border `#E5E7EB`.
- Font Plus Jakarta Sans via Next font optimization; Lucide icons; rounded cards 12–16px; focus/hover/disabled/error/loading.
- Public navigation mengarahkan Home, Jelajahi Makanan, Rating Saya, dan Rekomendasi. Admin sidebar desktop/mobile mengarahkan Kelola Makanan, Data Rating, dan Pemrosesan Rekomendasi.
- Halaman yang tersedia mencakup `/foods/[id]` dan USER-only `/recommendations`; admin pages mencakup `/admin/recommendations` dan detail `/admin/recommendations/[id]`.
- Foto, nama, kategori, dan deskripsi tampil konsisten dengan placeholder bila foto tidak ada. Tidak ada rating/statistik/rekomendasi dummy. Manual viewport/accessibility review **Pending Validation**.

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
7. Altair dikerjakan manual; hasil tidak tampil sebelum validasi/publikasi batch. **Implemented**; file Altair real **Pending Validation**.
8. Import katalog insert-only; jika satu baris invalid, tidak ada record makanan yang disimpan. **Implemented; concurrent commit diuji**.
9. Food Code immutable setelah insert. Makanan import dibuat ACTIVE dan tidak mengubah item existing. **Implemented**.
10. Rating revision berubah hanya pada insert/delete/perubahan score; scheduler memakai durable dirty revision, tetapi automatic enqueue/processing/publication tidak dapat diaktifkan sebelum parity validation melalui migration terpisah. Worker artifacts tetap `UNVERIFIED` dan tidak mengganti batch aktif. **Phase D implemented and tested**.

## 14. Development Roadmap

| Fase | Cakupan | Status | Dependensi |
| --- | --- | --- | --- |
| 1. Project Foundation & Design System | Next.js, TS, Tailwind, fonts/icons, layouts, home, shared primitives, errors. | Implemented; UI review Pending Validation | — |
| 2. Database Foundation, Authentication & Authorization | PostgreSQL, tujuh model domain, Better Auth, roles, seed, protected dashboard. | Implemented; isolated PostgreSQL integration lulus; production DB Pending Validation | F1 |
| 3. Food Management | Admin list/search/filter/sort/pagination, CRUD, image upload, hybrid delete/reactivate, CSV template/preview/insert-only import, 40 food seed. | Implemented; PostgreSQL integration lulus | F2 |
| 4. Rating workflows & data exchange | Public catalog, rating 1–5/history, Admin snapshot CSV `user_id,food_id,rating`. | Implemented; PostgreSQL integration lulus | F3 |
| 5. Altair workflow | Manual UBCF/Cosine/user k-NN process; exchange rating/result CSV. | Workflow contract implemented; Altair real-file compatibility Pending Validation | F4 |
| 6. Validation and audit | Result checks, import report, stale warnings, batch lifecycle/audit. | Implemented; parser/API/PostgreSQL integration Tested | F5 |
| 7. Recommendation publication | Atomic publish, batch history, private user recommendation UI. | Implemented; concurrent PostgreSQL integration Tested | F6 |
| V2 Phase D | Durable rating revisions, worker-polled PostgreSQL scheduler, locked config/gates, dedupe/stale metadata, monitoring API. | Implemented; PostgreSQL integration tested; automatic enqueue blocked by DB trigger and gate constraints. | V2 Phase C; parity validation remains pending |
| V2 Phase E | Admin dashboard/engine monitoring UX dan workflow Altair enam tahap; USER rating/rekomendasi existing dipertahankan. | Implemented; build/lint/typecheck, 15 npm tests, 24 Python tests, 6 PostgreSQL suites, and 4 Chromium E2E journeys pass. Manual assistive-technology review Pending Validation. | Phase D |
| V2 Phase F | Full QA, subsystem readiness, and gate review. | **QA complete** for browser journeys, manual CSV workflow, security gates, and real worker staging. Mathematical parity and real Altair export compatibility remain Pending Validation; no gate opened. | Original Altair evidence + separate approval |
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
| V2 Phase D/E/F QA | Rating revision durable, locked scheduler/gate, safe Admin monitoring, six-step Altair workflow, published-only USER results, and verified browser journeys. | Build, lint, typecheck, 15 unit tests, 24 Python tests, 6 PostgreSQL suites, 4 Playwright journeys pass; gate remains closed |
| F5 | Manual Altair result CSV contract and compatibility with actual research export. | Pending Validation |
| F6–F7 | Validation, history, atomic publish, owner-only page/filter. | Implemented; automated/integration Tested; visual and real Altair dataset Pending Validation |
| F8 | Production hardening, accessibility, performance and operations. | Planned |

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
