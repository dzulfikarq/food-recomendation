# Panduan Demo Lokal FoodRec

Status demo: **siap untuk review lokal**, bukan production. DB demo `foodrec_demo_kcore10_test` sudah dimigrasi dan berisi K-Core 10: 500 historical users, 6.788 resep, 19.299 training ratings. Import berada di DB lokal berakhiran `_test`; data historis bukan akun login.

## Jalankan aplikasi

Prasyarat: PostgreSQL lokal, Node/npm, Python, dan `.env` development yang sudah berisi `AUTH_SECRET`, kredensial ADMIN, serta koneksi PostgreSQL. Target database harus tetap lokal dan `_test`.

```powershell
# Dari root repo; arahkan hanya ke DB demo terisolasi.
$env:DATABASE_URL = node --input-type=module -e "import 'dotenv/config'; const u=new URL(process.env.DATABASE_URL); u.pathname='/foodrec_demo_kcore10_test'; process.stdout.write(u.toString())"
$env:AUTH_URL = 'http://127.0.0.1:3112'
$env:FOODREC_NEXT_DIST_DIR = '.next-foodrec-demo'
$env:FOODREC_STORAGE_DIR = './storage/foodrec-demo-kcore10'
$env:FOODREC_WORKER_SECRET = (Get-Content 'storage/foodrec-demo-kcore10/worker-secret.txt' -Raw).Trim()
npm run dev -- --hostname 127.0.0.1 --port 3112
```

Buka `http://127.0.0.1:3112`. Jangan jalankan seed/import dengan `DATABASE_URL` lain.

### Menyiapkan database baru

Buat database PostgreSQL lokal baru `foodrec_demo_kcore10_test` hanya jika belum ada. Isi `$exportDir` dengan export lokal yang manifest/checksum-nya sudah diverifikasi. Jangan unduh atau commit RAW/export data.

```powershell
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
$exportDir = 'E:\path\to\verified-kcore10-export'
npm run foodcom:import -- $exportDir --apply
```

Import memakai `train.csv` saja dan idempotent. Source export demo saat ini berada di `E:\Kuliah\TA\Yusfan\Dataset\foodrec_foodcom_kcore10_acceptance_export_20261113` pada mesin lokal ini. Izin penggunaan/redistribusi Food.com tetap **belum terverifikasi**.

## Skenario demo

1. **USER:** daftar atau login dengan akun lokal di `storage/foodrec-demo-kcore10/user-credentials.txt`; jelajahi `/foods`, cari `crock pot`, buka detail resep tanpa foto, beri/perbarui rating, lalu buka `/my-ratings`.
2. **ADMIN:** login memakai `ADMIN_EMAIL`/`ADMIN_PASSWORD` dari `.env`; tunjukkan dashboard `/admin` dan monitoring `/admin/recommendations`.
3. **Snapshot/job:** di `/admin/recommendations`, buat snapshot rating dari tahap 1. Dengan sesi Admin aktif, enqueue job manual memakai endpoint Admin yang sudah ada (ganti ID dengan ID snapshot yang tampil):

   ```js
   const response = await fetch('/api/admin/recommendation-jobs', {
     method: 'POST',
     headers: { 'content-type': 'application/json' },
     body: JSON.stringify({
       datasetExportId: 2, // ganti dengan ID snapshot terbaru
       kNeighbors: 100,
       topN: 20,
       idempotencyKey: crypto.randomUUID()
     })
   });
   console.log(await response.json());
   ```

4. Jalankan worker di terminal PowerShell kedua dengan konfigurasi DB/secret yang sama:

   ```powershell
   $env:DATABASE_URL = node --input-type=module -e "import 'dotenv/config'; const u=new URL(process.env.DATABASE_URL); u.pathname='/foodrec_demo_kcore10_test'; process.stdout.write(u.toString())"
   $env:FOODREC_WORKER_API_URL = 'http://127.0.0.1:3112'
   $env:FOODREC_WORKER_SECRET = (Get-Content 'storage/foodrec-demo-kcore10/worker-secret.txt' -Raw).Trim()
   $env:FOODREC_WORKER_ID = 'foodrec-demo-worker'
   .\scripts\run-recommender-worker.ps1
   ```

   Muat ulang monitoring. Tunjukkan hasil komputasi terpisah di `storage/foodrec-demo-kcore10/worker-result-summary.txt`; statusnya `UNVERIFIED`, bukan hasil publikasi.

5. **Publikasi Admin yang terpisah:** gunakan `storage/foodrec-demo-kcore10/demo-manual-fixture-not-worker.csv` hanya untuk mendemokan validasi dan konfirmasi publikasi CSV existing. Ini fixture manual satu baris, bukan output worker, bukan ekspor Altair, dan bukan hasil penelitian. Provenance ada di `manual-fixture-provenance.txt`. Sebutkan perbedaan ini sebelum membuka rekomendasi USER. Hasil di `/recommendations` pada demo ini berasal dari fixture manual tersebut, bukan worker.

## Bukti lokal

Screenshot browser aktual tersimpan di `test-results/foodrec-demo/` (folder diabaikan Git): pencarian katalog, detail resep, Rating Saya, dashboard Admin, monitoring worker, validasi/publikasi fixture manual, rekomendasi USER, dan detail resep rekomendasi. Ringkasan smoke ada di `storage/foodrec-demo-kcore10/demo-smoke-summary.txt`; file-file lokal ini tidak berisi screenshot/hasil sintetis.

Smoke 2026-11-13: registrasi/login USER, 3 rating, snapshot, job worker berhasil dengan 20 rekomendasi untuk akun demo, detail resep, login ADMIN, monitoring, validasi CSV, konfirmasi publikasi, rekomendasi USER, dan gate database diverifikasi. `PENDING_VALIDATION`; automatic processing/publication tetap `false`. Test Node/Python dan batas eksperimen yang tercatat: [`FOODREC_RELEASE_CANDIDATE.md`](FOODREC_RELEASE_CANDIDATE.md), [`RECOMMENDATION_ENGINE_VALIDATION.md`](RECOMMENDATION_ENGINE_VALIDATION.md).

## Batas klaim dan hasil eksperimen tersedia

- Worker memakai UBCF explicit-rating dan telah diuji terhadap oracle matematis synthetic. Itu memeriksa implementasi rumus; **bukan** validasi kualitas rekomendasi pada K-Core 10 atau parity Altair. Artifact worker tidak dapat dipublikasikan.
- Satu-satunya evaluasi Food.com yang tercatat adalah run eksploratori 5.000-user di [`research/EXPERIMENT_RESULTS.md`](research/EXPERIMENT_RESULTS.md): UBCF `k=1` dipilih dari hanya 8 prediksi validation (8/2.463; coverage 0,3248%; MAE 0,375; RMSE 0,612372). Pada test yang sudah dilihat, 15/2.801 terprediksi (coverage 0,5355%; MAE 0,400; RMSE 0,730297). Coverage sangat rendah; angka ini bukan hasil final atau klaim keunggulan.
- K-Core 10 demo adalah sumber data aplikasi, bukan eksperimen kualitas. Tidak ada Top-N metrics atau hasil Altair parity yang disetujui untuk dilaporkan. Hak Food.com, metodologi, dan kelayakan klaim skripsi perlu persetujuan pembimbing/pemegang hak.
- Gate tetap `PENDING_VALIDATION`; automatic processing/publication tetap **OFF**. Tidak ada deployment atau akses production.
