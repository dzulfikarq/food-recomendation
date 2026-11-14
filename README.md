# FoodRec

FoodRec adalah aplikasi katalog makanan dan rating pengguna. Rekomendasi memakai Python UBCF.

> Rekomendasi otomatis hanya untuk prototipe lokal pada database `_test`. Gate production tetap **OFF** dan status validasi **`PENDING_VALIDATION`**.

## Clone dan setup

Prasyarat: Git, Node.js 20.19+, PostgreSQL 15+, dan PowerShell. Python 3.11+ diperlukan untuk worker rekomendasi.

```powershell
git clone https://github.com/dzulfikarq/food-recomendation
Set-Location food-recomendation
Copy-Item .env.example .env
notepad .env
npm ci
```

Di `.env`, atur URL PostgreSQL lokal dan password yang cocok. `DATABASE_URL` harus menuju database normal `foodrec`; `FOODREC_TEST_DATABASE_URL` dan `FOODREC_E2E_DATABASE_URL` harus menuju database lokal berbeda yang namanya berakhiran `_test`. Ganti `AUTH_SECRET` dan `FOODREC_WORKER_SECRET` dengan secret masing-masing minimal 32 karakter, serta ganti password admin. Jangan commit `.env`.

Buat database `foodrec` di PostgreSQL lokal (misalnya lewat pgAdmin), lalu jalankan:

```powershell
npm run db:generate
npm run db:migrate:deploy
$env:FOODREC_ALLOW_MANUAL_SEED = "foodrec"
npm run db:seed
npm run db:seed:foods
Remove-Item Env:FOODREC_ALLOW_MANUAL_SEED
npm run dev
```

Jika nama database `DATABASE_URL` bukan `foodrec`, ganti nilai seed sementara di atas agar sama persis dengan nama database. Jangan gunakan override seed pada production.

Buka <http://localhost:3000>. Terminal server harus tetap berjalan.

### Alternatif PostgreSQL via Docker

Docker Desktop tidak wajib. Jika memilih Docker, `.env` harus berisi `POSTGRES_PASSWORD`, lalu jalankan:

```powershell
docker compose up -d db
```

Compose membuat database `foodrec`. Lanjutkan langkah migrasi dan seed di atas.

## Penggunaan normal

- **USER:** daftar di `/register`, beri rating makanan di `/foods`, lalu lihat riwayat di `/my-ratings` dan rekomendasi terbit di `/recommendations`.
- **ADMIN:** masuk memakai `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari `.env`, lalu kelola katalog dan alur rekomendasi manual di `/admin`.
- Mode normal **tidak** membuat rekomendasi otomatis setelah rating. Worker opsional hanya memproses job yang memang dibuat melalui alur Admin.

Untuk menjalankan worker mode normal, buka terminal kedua dan salin secret dari `.env`:

```powershell
$env:FOODREC_WORKER_API_URL = "http://127.0.0.1:3000"
$env:FOODREC_WORKER_SECRET = "SALIN_NILAI_FOODREC_WORKER_SECRET_DARI_ENV"
.\scripts\run-recommender-worker.ps1
```

Jangan bagikan atau commit nilai secret tersebut.

## Prototipe rekomendasi otomatis lokal

Prototipe berjalan interaktif, tetapi wajib memakai database PostgreSQL lokal bernama `_test` yang berbeda dari `DATABASE_URL`. Siapkan database baru sesuai `FOODREC_E2E_DATABASE_URL` di `.env`; database harus memakai server dan kredensial lokal yang sama. Jangan pakai database yang berisi data penting.

Setelah membuat database kosong, jalankan migrasi dan seed ke database tersebut:

```powershell
$env:DATABASE_URL = node --input-type=module -e "import 'dotenv/config'; const url = new URL(process.env.FOODREC_E2E_DATABASE_URL); process.stdout.write(url.toString())"
npm run db:migrate:deploy
npm run db:seed
npm run db:seed:foods
Remove-Item Env:DATABASE_URL
```

Jalankan app dan worker di dua terminal dari root repository:

```powershell
node scripts/start-local-prototype.mjs app
```

```powershell
node scripts/start-local-prototype.mjs worker
```

Buka <http://127.0.0.1:3113>, buat beberapa akun USER, lalu beri rating pada sebagian makanan yang sama. Rating yang belum cukup atau tidak tumpang tindih dapat menghasilkan daftar kosong. Launcher memeriksa target, gate, dan proteksi database; gate tetap OFF/`PENDING_VALIDATION`. Jangan jalankan launcher pada production.

`npm run test:e2e` adalah runner pengujian browser, bukan cara menjalankan aplikasi interaktif.

## Dataset Food.com

Dataset Food.com tidak disertakan atau diunduh otomatis. Jika hak akses sudah dipastikan, siapkan sendiri `RAW_interactions.csv` dan `RAW_recipes.csv`, jalankan tahap persiapan cohort lalu export katalog secara lokal. Panduan langkah dan batasan ada di [FOODCOM_APP_MIGRATION.md](docs/FOODCOM_APP_MIGRATION.md) dan [DATASET_PROVENANCE.md](docs/DATASET_PROVENANCE.md). Jangan commit file raw atau hasil olahannya.
