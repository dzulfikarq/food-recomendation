# FoodRec

FoodRec adalah aplikasi katalog makanan yang menyimpan rating USER dan menampilkan rekomendasi berbasis User-Based Collaborative Filtering (UBCF) Python. Admin juga dapat mengelola katalog dan menjalankan alur rekomendasi CSV secara manual.

> **Status:** prototipe rekomendasi otomatis hanya untuk uji lokal terisolasi `_test`. Pemrosesan dan publikasi otomatis production tetap **OFF**; status validasi penelitian **`PENDING_VALIDATION`**. Keberhasilan uji teknis bukan bukti kualitas rekomendasi.

## Quick Start — Windows PowerShell

Prasyarat: Git, Node.js 20.19+ dengan npm, Docker Desktop (atau PostgreSQL lokal), Python 3.11+, dan Chrome/Chromium untuk uji browser. Dari PowerShell:

```powershell
git clone "URL_REPOSITORY"
Set-Location food-recomendation
Copy-Item .env.example .env
notepad .env
```

Ganti semua nilai placeholder di `.env`, terutama password PostgreSQL, `AUTH_SECRET`, `FOODREC_WORKER_SECRET`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD`. Gunakan nilai rahasia lokal sendiri; jangan commit `.env`.

```powershell
docker compose up -d db
npm ci
py -3 -m venv .venv
npm run db:generate
npm run db:migrate:deploy
$env:FOODREC_ALLOW_MANUAL_SEED = "foodrec"
npm run db:seed
npm run db:seed:foods
Remove-Item Env:FOODREC_ALLOW_MANUAL_SEED
npm run dev
```

Buka `http://localhost:3000`. Terminal yang menjalankan `npm run dev` harus tetap terbuka. Langkah ini menjalankan mode normal: rating tersimpan, tetapi tidak otomatis memulai rekomendasi. Untuk menguji alur otomatis di DB `_test`, ikuti [Prototipe otomatis lokal](#prototipe-rekomendasi-otomatis-lokal).

## Fitur

**USER**
- Melihat katalog makanan aktif dan detail resep.
- Mendaftar, memberi atau memperbarui rating 1–5, dan melihat riwayat di `/my-ratings`.
- Melihat rekomendasi yang sudah diterbitkan di `/recommendations`.

**ADMIN**
- Mengelola makanan dan status katalog.
- Membuat serta mengunduh snapshot rating.
- Mengimpor, memvalidasi, dan menerbitkan rekomendasi CSV secara manual.
- Memantau job, worker, konfigurasi mesin, dan batch rekomendasi.

## Teknologi

- Next.js 16, React 19, TypeScript, Tailwind CSS 4.
- PostgreSQL dan Prisma 7.
- Better Auth untuk autentikasi dan peran USER/ADMIN.
- Python 3 untuk mesin UBCF dan worker; worker memakai standard library, tanpa dependency runtime Python tambahan.
- Playwright dan Chrome/Chromium untuk uji browser.

## Persyaratan sistem

- Windows PowerShell, Git, Node.js **20.19 atau lebih baru**, dan npm.
- PostgreSQL 15 atau lebih baru. `docker-compose.yml` memakai PostgreSQL 17; Docker Desktop hanya diperlukan jika memilih setup Docker.
- Python **3.11 atau lebih baru**. Pastikan `python` tersedia di `PATH` untuk `npm run test:e2e`, atau atur `FOODREC_PYTHON` ke interpreter yang dipakai.
- Chrome/Chromium untuk `npm run test:e2e`. Runner memakai Chrome Windows default; lokasi lain bisa diberikan melalui `FOODREC_CHROME_PATH`.

## Clone dan dependency

Ganti `URL_REPOSITORY` dengan URL clone repository:

```powershell
git clone "URL_REPOSITORY"
Set-Location food-recomendation
npm ci
py -3 -m venv .venv
```

Worker berjalan langsung dari source dan tidak memerlukan `pip install`; lingkungan virtual hanya mengisolasi versi Python lokal. Aktivasi venv tidak wajib untuk script launcher, yang otomatis memilih `.venv` bila tersedia.

## Konfigurasi environment

Salin template lalu edit:

```powershell
Copy-Item .env.example .env
notepad .env
```

Atur nilai berikut:

| Variabel | Fungsi |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Kredensial dan DB awal Docker Compose. |
| `DATABASE_URL` | PostgreSQL aplikasi normal; template memakai DB lokal `foodrec`. |
| `FOODREC_TEST_DATABASE_URL` | DB terisolasi untuk integration test; harus bernama `_test`. |
| `FOODREC_E2E_DATABASE_URL` | DB terisolasi untuk browser E2E dan prototipe; harus bernama `_test` dan berbeda dari `DATABASE_URL`. |
| `AUTH_SECRET` | Secret Better Auth, minimal 32 karakter. |
| `AUTH_URL` | URL aplikasi, biasanya `http://localhost:3000`. |
| `FOODREC_WORKER_SECRET` | Secret worker, minimal 32 karakter dan sama di proses Next.js serta worker. |
| `FOODREC_WORKER_API_URL` | Origin Next.js yang dipanggil worker; biasanya `http://127.0.0.1:3000`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Kredensial lokal untuk akun ADMIN yang dibuat oleh seed. Password minimal 8 karakter. |
| `FOODREC_STORAGE_DIR` | Folder penyimpanan lokal untuk file aplikasi. |
| `FOODREC_TEST_STORAGE_DIR` | Folder terpisah untuk file integration test. |
| `FOODREC_TEST_RUN`, `FOODREC_TEST_AUTO_RECOMMENDATIONS`, `FOODREC_E2E_RUN_ID`, `FOODREC_ORIGINAL_DATABASE_URL` | Guard prototipe. Biarkan placeholder/default di template; runner E2E mengisi nilai sementara dan memvalidasinya. Jangan aktifkan manual atau di production. |

Samakan password pada `POSTGRES_PASSWORD` dan seluruh URL database. Karakter khusus dalam password URL harus di-percent-encode; password acak berformat Base64URL menghindari masalah encoding. `.env.example` hanya berisi placeholder, bukan kredensial yang bisa dipakai.

`FOODREC_ALLOW_MANUAL_SEED` sengaja tidak disimpan di `.env`. Seed hanya mengizinkan nama DB berakhiran `_test`, kecuali variabel ini disetel sementara ke nama DB yang persis. Untuk DB lokal `foodrec`, gunakan hanya saat perintah seed:

```powershell
$env:FOODREC_ALLOW_MANUAL_SEED = "foodrec"
npm run db:seed
npm run db:seed:foods
Remove-Item Env:FOODREC_ALLOW_MANUAL_SEED
```

Ganti `foodrec` jika nama DB berbeda. Jangan arahkan override ini ke production.

## PostgreSQL dan migrasi Prisma

Setup Docker membuat DB `foodrec` pertama kali dan menyimpan datanya di volume persisten `foodrec-postgres`:

```powershell
docker compose up -d db
docker compose ps
npm run db:generate
npm run db:migrate:deploy
```

Atur `DATABASE_URL` agar cocok dengan user, password, host, port, dan DB Compose. Bila memakai PostgreSQL yang sudah terpasang, pastikan database pada `DATABASE_URL` sudah dibuat sebelum migrasi. Jangan jalankan migrasi atau seed terhadap database production.

`db:seed` membuat ADMIN dari `ADMIN_EMAIL` dan `ADMIN_PASSWORD`; seed tidak mengubah akun USER menjadi ADMIN. `db:seed:foods` menambahkan 40 makanan awal dan tidak menimpa `Food Code` yang sudah ada.

## Menjalankan aplikasi dan worker

Jalankan Next.js di **Terminal 1** dari root repository:

```powershell
npm run dev
```

Biarkan terminal ini berjalan. Untuk menjalankan worker bagi job yang memang diantrekan melalui alur Admin, buka **Terminal 2** di root repository:

```powershell
$env:FOODREC_WORKER_API_URL = "http://127.0.0.1:3000"
$env:FOODREC_WORKER_SECRET = "SALIN_SECRET_LOKAL_DARI_ENV"
$env:FOODREC_WORKER_ID = "local-worker-1"
.\scripts\run-recommender-worker.ps1
```

Ganti nilai `SALIN_SECRET_LOKAL_DARI_ENV` dengan `FOODREC_WORKER_SECRET` dari `.env`; jangan bagikan atau commit nilainya. Worker tetap berjalan sampai dihentikan dengan `Ctrl+C`. Jika `.venv` tersedia, launcher memakai `.venv\Scripts\python.exe`; jika tidak, launcher mencari `py -3` lalu `python`.

**Mode normal tidak otomatis memproses rating baru.** Worker memproses job eksplisit/scheduler sesuai gate DB; Admin tetap memakai alur snapshot → proses CSV → impor → validasi → publikasi untuk batch manual. Menyalakan worker saja tidak mengaktifkan rekomendasi otomatis.

## Dataset Food.com

Raw Food.com tidak disertakan saat clone. Dataset juga tidak otomatis diunduh. Sumber yang dirujuk pipeline adalah [Food.com Recipes and User Interactions](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions). Hak penggunaan, penelitian, komersial, dan redistribusi belum terverifikasi; label sumber menyatakan hak pada penulis asli. Jangan unduh, proses, impor, atau bagikan dataset turunan sebelum memperoleh izin yang sesuai. Jangan commit raw files maupun hasil olahan.

Jika izin dan akses sumber sudah dipastikan, proses manual memerlukan `RAW_interactions.csv` dan `RAW_recipes.csv`. Contoh cohort yang diterima exporter aplikasi:

```powershell
py -3 services/recommender/scripts/foodcom_research.py prepare `
  --interactions 'D:\Foodcom\RAW_interactions.csv' `
  --recipes 'D:\Foodcom\RAW_recipes.csv' `
  --output-dir 'D:\Foodcom\prepared' `
  --source-version 'Food.com v2 (2019-11-08)' `
  --rights-review 'GANTI_DENGAN_REFERENSI_IZIN_YANG_VALID' `
  --seed 20261113 `
  --user-limit 500 `
  --sampling-strategy user_history `
  --min-user-train 5

py -3 services/recommender/scripts/export_foodcom_catalog.py `
  --prepared-dir 'D:\Foodcom\prepared' `
  --raw-recipes 'D:\Foodcom\RAW_recipes.csv' `
  --output-dir 'D:\Foodcom\export-baru'
```

Ganti semua path dan referensi izin; setiap output directory harus belum ada. `--rights-review` hanya mencatat referensi dalam manifest, bukan memverifikasi izin. Export hanya memakai rating train dan menyertakan manifest/checksum. Pipeline menolak cohort yang tidak memenuhi batas aplikasi.

Contoh import berikut mengasumsikan Docker Compose aktif dan URL `.env` menuju PostgreSQL lokal di port `5432`. Gunakan terminal terpisah; target mesti DB `_test` baru. Jika nama DB sudah ada, pilih nama unik dan ubah path URL:

```powershell
docker compose exec -T db createdb -U foodrec foodrec_foodcom_test
$env:DATABASE_URL = node --input-type=module -e "import 'dotenv/config'; const url = new URL(process.env.DATABASE_URL); url.pathname = '/foodrec_foodcom_test'; process.stdout.write(url.toString())"
npm run db:generate
npm run db:migrate:deploy
npm run foodcom:import -- 'D:\Foodcom\export-baru' --apply
```

Importer mewajibkan `--apply`, memvalidasi target lokal `_test`, dan tidak menerbitkan rekomendasi. Panduan lengkap ada di [`docs/FOODCOM_APP_MIGRATION.md`](docs/FOODCOM_APP_MIGRATION.md). Jika hak dataset belum jelas, lewati seluruh langkah ini; katalog 40 makanan awal cukup untuk setup aplikasi.

## Prototipe rekomendasi otomatis lokal

Prototipe otomatis hanya diaktifkan oleh runner `npm run test:e2e`. Runner:

1. Memastikan target PostgreSQL lokal bernama `_test`, berbeda dari source DB, dengan kredensial/server yang sama.
2. Membuat DB E2E bila belum ada; bila sudah ada, **menggunakannya tanpa reset**.
3. Menerapkan migrasi dan seed, lalu membuka pengecualian `TEST_PROTOTYPE` hanya pada DB E2E yang sudah diverifikasi.
4. Membangun aplikasi, menjalankan Chromium, membuat USER sementara, memberi rating, menjalankan worker Python, memverifikasi artifact, dan memastikan USER melihat rekomendasi.
5. Memastikan gate tetap `autoProcessingEnabled=false`, `automaticPublicationEnabled=false`, dan `validationStatus=PENDING_VALIDATION`.

Pastikan Chrome/Chromium terpasang. Template menggunakan `foodrec_e2e_test`; jika nama itu sudah ada dan kamu ingin DB baru, tetapkan URL baru yang berakhiran `_test` dan memakai server/kredensial lokal yang sama. Contoh berikut membuat nama unik tanpa menampilkan password URL:

```powershell
$env:FOODREC_E2E_DATABASE_URL = node --input-type=module -e "import 'dotenv/config'; const url = new URL(process.env.DATABASE_URL); url.pathname = '/foodrec_e2e_' + Date.now() + '_test'; process.stdout.write(url.toString())"
# Opsional: pakai interpreter venv untuk worker E2E.
$env:FOODREC_PYTHON = (Resolve-Path '.\.venv\Scripts\python.exe').Path
npm run test:e2e
```

Hapus override PowerShell setelah selesai jika tidak ingin dipakai lagi:

```powershell
Remove-Item Env:FOODREC_E2E_DATABASE_URL
Remove-Item Env:FOODREC_PYTHON -ErrorAction SilentlyContinue
```

E2E juga menjalankan build dan skenario browser lain. Database, rating, job, batch, dan artefak test tetap tersimpan untuk pemeriksaan; runner tidak menghapus atau meresetnya. Test memakai akun sementara yang dibuat otomatis, bukan akun login permanen. Test membuktikan alur teknis lokal, bukan kualitas algoritme, validasi penelitian, atau kesiapan production. Jangan set flag guard secara manual, jangan longgarkan constraint production, dan jangan arahkan URL ke database selain lokal `_test`.

## Akun dan alur penggunaan

- **USER:** daftar di `/register`, masuk, buka `/foods`, pilih makanan, beri rating 1–5, lalu simpan. Rating dan riwayat terlihat di `/my-ratings`.
- **ADMIN:** akun dibuat dari `ADMIN_EMAIL`/`ADMIN_PASSWORD` ketika `npm run db:seed` dijalankan. Masuk lalu buka `/admin` untuk mengelola katalog, snapshot rating, dan alur rekomendasi manual.
- **Mode normal:** setelah rating, tidak ada job otomatis. Hasil baru hanya tampil setelah Admin menyelesaikan alur rekomendasi manual dan menerbitkan batch.
- **Prototipe E2E:** `npm run test:e2e` menjalankan langkah register → rating → worker Python → verifikasi → publikasi pada DB `_test`, lalu menguji halaman `/recommendations`. Perintah ini otomatis, bukan server demo interaktif yang memakai DB aplikasi normal.

Cold start atau rating yang belum cukup untuk menemukan tetangga dapat menghasilkan daftar rekomendasi kosong. Prototipe hanya menerbitkan hasil bila verifikasi teknis berhasil; artifact tetap berstatus `UNVERIFIED` dan status validasi penelitian tidak berubah.

## Troubleshooting

| Gejala | Solusi |
| --- | --- |
| `npm ci` gagal dengan `EPERM` saat menghapus file native | Tutup server Next.js/Node yang memakai dependency repository ini, lalu ulangi `npm ci`. Jangan jalankan install bersih saat dev server sedang aktif. |
| PostgreSQL tidak menerima koneksi | Jalankan `docker compose up -d db`; periksa `docker compose ps`, port `5432`, lalu cocokkan `DATABASE_URL` dengan `.env`. |
| Password DB gagal | Samakan `POSTGRES_PASSWORD` dengan password di URL database. Encode karakter khusus URL. Jika volume PostgreSQL lama sudah ada, mengubah variabel Compose tidak mengubah kredensial volume tersebut. Jangan hapus volume untuk memperbaikinya. |
| Seed menolak DB `foodrec` | Set `FOODREC_ALLOW_MANUAL_SEED` hanya sementara ke nama DB lokal yang persis, jalankan seed, lalu hapus variabel. DB `_test` tidak memerlukan override. |
| Prisma tidak menemukan database | Buat database lokal yang disebut di `DATABASE_URL`; Compose hanya membuat `POSTGRES_DB` awal. E2E membuat targetnya sendiri jika belum ada dan role DB memiliki izin `CREATE DATABASE`. |
| Login/admin tidak tersedia | Periksa `ADMIN_EMAIL` dan `ADMIN_PASSWORD`, lalu jalankan `npm run db:seed` pada DB lokal yang benar. Seed tidak mempromosikan akun USER yang sudah memakai email tersebut. |
| E2E tidak menemukan Chrome | Set `$env:FOODREC_CHROME_PATH` ke path Chrome/Chromium sebelum `npm run test:e2e`. |
| E2E tidak menemukan Python | Periksa `python --version`, atau set `FOODREC_PYTHON` ke `.venv\Scripts\python.exe`. Versi minimal 3.11. |
| Port E2E `3110` sudah dipakai | Hentikan aplikasi lokal yang memakai port tersebut, lalu ulangi test. Jangan menjalankan server E2E bersamaan pada port yang sama. |
| Tidak ada rekomendasi setelah rating pada mode normal | Ini perilaku yang diharapkan: automation production dikunci. Jalankan alur Admin manual atau uji prototipe melalui `npm run test:e2e` di DB `_test`. |
| Worker unauthorized/tidak bisa tersambung | Pastikan Next.js hidup, `FOODREC_WORKER_API_URL` mengarah ke origin yang benar, dan secret di terminal worker sama dengan `FOODREC_WORKER_SECRET` di `.env`. |

## Struktur repository

```text
app/                         halaman Next.js dan API routes
components/                  komponen USER, ADMIN, dan UI
lib/                         autentikasi, database, katalog, rekomendasi
prisma/                      schema, migrations, seed
services/recommender/src/    mesin UBCF dan worker Python
services/recommender/scripts/ persiapan/evaluasi dataset lokal
scripts/                     worker launcher dan runner test terjaga
tests/                       unit, integration, dan browser E2E
docs/                        arsitektur, metodologi, status, dan panduan data
```

## Dokumentasi tambahan

- [Arsitektur](docs/ARCHITECTURE.md) dan [database](docs/DATABASE.md).
- [Status validasi mesin rekomendasi](docs/RECOMMENDATION_ENGINE_VALIDATION.md) dan [roadmap](docs/ROADMAP.md).
- [Persiapan dan import Food.com](docs/FOODCOM_APP_MIGRATION.md) serta [provenance dataset](docs/DATASET_PROVENANCE.md).
- [Pengumpulan data penelitian](docs/RESEARCH_DATA_COLLECTION.md), [panduan partisipan](docs/RESEARCH_PARTICIPANT_GUIDE.md), dan [checklist peluncuran penelitian](docs/RESEARCH_COLLECTION_LAUNCH_CHECKLIST.md).
- [Kebutuhan produk](docs/PRD.md), [keputusan](docs/DECISIONS.md), dan [desain UX](docs/DESIGN.md).
