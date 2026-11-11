# Audit Provenance Dataset Rating FoodRec

## Kesimpulan

**`foodrec_snapshot_879.csv` saat ini tidak layak diklaim sebagai data penelitian asli.** Provenance responden belum terverifikasi; 800 baris memiliki indikasi kuat terkait pola demo sintetis, sedangkan 79 baris sisanya belum terklasifikasi. Bukti yang ada belum membuktikan langsung bahwa `seed-demo-ratings.ts` dijalankan untuk membuat file ini, dan tidak membuktikan seluruh 879 baris sintetis.

Tidak ada database yang dibaca atau diubah. Tidak ada optimasi maupun evaluasi model dijalankan.

## Bukti repository dan riwayat

### Snapshot 879

- File: `services/recommender/tests/fixtures/phase_b_altair/datasets/foodrec_snapshot_879.csv`; 879 baris, 22 ID user (`2–23`), 40 ID makanan (`1–40`), 879 dari 880 pasangan mungkin.
- SHA-256: `a2cda622ac8702538c3ba0d9c0ae0ad73be9e88c5d3699e3933cd215c2f23337`.
- Panduan turunan menyebut sumber bernama `foodrec-ratings-20261024T132014Z-9da9769a.csv` dan menyatakan data tidak diubah. Namun manifest mencatat asal sebagai “earlier conversation upload or generated artifact”. Tidak ada surat sumber, instrumen, responden, izin, atau export metadata terlampir.
- CSV snapshot pertama kali masuk Git pada commit `6499923` (11 Nov 2026). Riwayat itu membuktikan file diarsipkan saat itu, bukan asal datanya.
- Nama sumber cocok dengan pola filename export aplikasi. Exporter yang sudah ada pada commit aplikasi `005391c` menghasilkan `foodrec-ratings-{timestamp}-{uuid8}.csv`, memilih rating dari database dan menulis header `user_id,food_id,rating`. Ini **konsisten dengan kemungkinan export aplikasi**, bukan bukti bahwa CSV ini export tersebut. Tidak ada checksum/row metadata `DatasetExport` yang mengikat file ini ke sumber database.
- Timestamp `20261024T132014Z` pada nama file mendahului commit pertama seed demo. Timestamp adalah bagian nama file, bukan bukti independen waktu pembuatan.

### Sidik pola seed demo

`prisma/seed-demo-ratings.ts` membuat 20 user bernama `Demo FoodRec User 01..20`, lalu satu rating untuk setiap makanan. Rumusnya:

```text
rating = ((userIndex × 7 + foodIndex × 3) mod 5) + 1
```

Pada snapshot, user ID `4–23` membentuk blok lengkap **20 × 40 = 800 rating**. Untuk setiap makanan, nilai rating pada 20 baris itu konsisten dengan satu fase modulo-5 dari rumus seed ketika `userIndex = user_id − 4`; ada tepat delapan makanan per setiap fase. Karena `foods.findMany()` di seed tidak menetapkan `orderBy`, urutan `foodIndex` tidak tersimpan di CSV. Pola ini merupakan **sidik kuat yang cocok dengan rumus seed untuk suatu urutan makanan**, tetapi tidak mengidentifikasi proses yang menghasilkan nilai tersebut.

Sisa **79 baris** berasal dari user ID `2` (39 makanan) dan `3` (40 makanan); asalnya tidak diketahui. CSV tidak menyimpan nama/email, jadi identitas demo `example.test` tidak dapat dicocokkan langsung. Dengan demikian, snapshot cocok dengan skenario 800 rating demo plus 79 rating lain, tetapi skenario itu belum terbukti.

Ada bukti pembatas dan bukti yang bertentangan:

- Seed demo pertama kali ditambahkan di commit `031c6d3` pada 26 Okt 2026—dua hari setelah timestamp yang diklaim filename. Ini membuat eksekusi dari versi Git tersebut sebelum timestamp tidak didukung riwayat, tetapi tidak meniadakan kemungkinan kode lokal/uncommitted atau timestamp yang tidak merekam waktu sebenarnya.
- Versi seed pada commit `031c6d3` mengizinkan host lokal database `foodrec` **atau** `foodrec_test`. Commit `2f2d6e4` (11 Nov) memperketat guard ke `_test` saja. Riwayat kode menunjukkan seed pernah dapat menulis ke database lokal bernama `foodrec`; riwayat kode **tidak** menunjukkan seed pernah dijalankan.
- Dengan asumsi ID makanan naik sebagai urutan `foodIndex`, rumus tidak cocok tepat untuk blok 4–23. Karena query seed tidak menjamin urutan makanan dan urutan saat export berbeda/terbuang, tes tersebut tidak membantah sidik fase, tetapi menghalangi klaim exact-run.
- Tidak ditemukan log eksekusi seed, identitas demo, metadata export sumber, atau bukti langsung database yang menghubungkan script dengan snapshot.

**Jawaban atas apakah seed pernah dipakai:** belum bisa dipastikan dari bukti langsung. Namun sidik pola pada 800 baris sangat kuat dan perlu diperlakukan sebagai indikasi kontaminasi sintetis sampai dibuktikan sebaliknya.

### Import, export, dan penulisan rating

- `lib/food/rating-export.ts` mengekspor baris database saat ini secara terurut, membuat checksum, dan filename bertimestamp; `app/api/admin/rating-datasets/route.ts` menyediakan create/list. Export ini tidak mencatat sumber responden atau menjamin rating empiris.
- Rating aplikasi normal ditulis melalui route USER `app/api/foods/[id]/rating/route.ts`. Bulk rating sintetis yang ditemukan berasal dari seed demo dan fixture/test code.
- Tidak ditemukan endpoint yang mengimpor CSV rating menjadi tabel `Rating`. Parser snapshot memvalidasi CSV untuk worker; import CSV Admin adalah untuk katalog Food atau hasil rekomendasi, bukan ingest rating mentah.
- Metadata `DatasetExport` yang dapat mengikat filename/checksum/row count/admin ke snapshot berada di database, bukan di fixture Git. Database tidak diperiksa karena tidak ada akses read-only yang disediakan dan instruksi melarang penggunaan kredensial tulis. Ini blocker untuk memastikan file mana yang diekspor dan dari revision apa.

## Hubungan train/test dengan sumber

Panduan offline menyatakan seed split `20261025`: pilih 15 rating per user, 12 ke train dan 3 ke test. Audit isi file memverifikasi:

- 264 train + 66 test = **330 baris** yang ada persis di snapshot 879 dengan pasangan dan nilai rating sama.
- Tidak ada pasangan `(user_id, food_id)` train yang muncul di test.
- **549 baris** snapshot tidak masuk split.
- Skrip pembuat split tidak ada di repository; seed tercatat tetapi tidak cukup untuk mereproduksi pembagian tepat.

Train/test adalah turunan snapshot, bukan observasi responden independen. Keduanya mewarisi seluruh ketidakpastian dan indikasi seed-demo sumber. Split tidak meningkatkan autentisitas dan tidak dapat digunakan sebagai bukti data asli.

## Status kelayakan

| Klaim | Status |
| --- | --- |
| File berisi 879 pasangan numerik user–makanan–rating 1–5 | **Terverifikasi dari CSV/checksum** |
| Train/test merupakan subset nilai yang sama dan tidak overlap pasangan | **Terverifikasi** |
| Snapshot adalah export aplikasi sesuai format | **Mungkin/konsisten, belum terbukti tanpa metadata export** |
| 800 rating user ID 4–23 dihasilkan langsung oleh seed script | **Sidik formula kuat; eksekusi langsung tidak terbukti** |
| Semua 879 rating berasal dari responden nyata dengan izin | **Tidak terverifikasi; tidak layak diklaim** |
| Dataset layak sebagai data penelitian asli sekarang | **Tidak layak sampai provenance, izin, dan pola demo diselesaikan** |

Jangan menjalankan eksperimen final, menggabungkan atau “membersihkan” baris tanpa data primer, maupun mengklaim rating sintetis sebagai jawaban responden. Pertahankan file sumber apa adanya sebagai artefak audit/pilot.

## Data yang dibutuhkan untuk penelitian

Jika snapshot 879 tidak dapat dibuktikan sebagai data responden, kumpulkan atau minta dataset responden yang sah. Format analisis yang disarankan:

```csv
user_id,food_id,rating
1001,1,5
1001,2,2
1002,1,4
```

Gunakan ID numerik pseudonim yang stabil, satu baris per pasangan user–makanan, rating integer 1–5, dan jangan masukkan nama/email ke CSV analisis. Sertakan dokumentasi terpisah berisi instrumen dan definisi setiap rating, prosedur/tanggal pengumpulan, kriteria responden, sampling, persetujuan/izin etik, proses anonimisasi, aturan eksklusi, transformasi, checksum, dan penanggung jawab data. Simpan kunci penghubung identitas terpisah dengan akses terbatas. Ukuran sampel ditentukan bersama pembimbing, bukan ditebak dari fixture saat ini.

Jika sumber yang benar adalah export aplikasi lama, minta file primer beserta metadata export yang cocok (filename, checksum, row count, waktu/revision, asal rating, dan penanggung jawab). Untuk memeriksa metadata database, sediakan akses read-only yang aman atau ekspor metadata bertanda tangan; saat ini pemeriksaan tersebut **blocked**. Jangan gunakan kredensial tulis dan jangan mengubah/reset database.

## Status FoodRec

Python Engine, database, workflow Altair, dan validation gate tidak diubah. Tidak ada eksperimen/optimasi final, database read/write/reset, push, atau deploy. Mathematical parity tetap **PENDING VALIDATION**; artifact **UNVERIFIED**; auto-processing dan automatic publication **OFF**.

## Pengumpulan data penelitian baru

FoodRec menyediakan fitur pengumpulan responden terpisah (`ResearchStudy`, `ResearchConsent`, `ResearchParticipant`, `ResearchRating`). Fitur ini tidak mengubah kesimpulan audit snapshot 879 dan tidak mengimpor rating lama/demo. Dataset baru hanya dapat berasal dari jalur consent dan rating penelitian; source `CONSENTED_USER_ACTION` merekam jalur aplikasi, bukan bukti independen identitas atau kelayakan responden.

CSV penelitian memakai `ResearchParticipant.id` pseudonim serta `Food.id`, dengan manifest/checksum dan consent version. Relasi akun tetap tersedia terbatas untuk consent/withdrawal, sehingga dataset **pseudonymous, bukan anonymous**. Persetujuan etik, sampling, kualitas responden, verifikasi instrumen, serta kecukupan untuk evaluasi CF tidak disimpulkan dari implementasi software. Cara ekspor/verifikasi dan batas withdrawal ada di [`RESEARCH_DATA_COLLECTION.md`](RESEARCH_DATA_COLLECTION.md); panduan responden di [`RESEARCH_PARTICIPANT_GUIDE.md`](RESEARCH_PARTICIPANT_GUIDE.md).

Research data belum menjadi input Altair, `DatasetExport`, Python engine, `RecommendationJob`, `RecommendationBatch`, atau publikasi. Altair parity tetap **PENDING VALIDATION**, artifact **UNVERIFIED**, automatic processing/publication **OFF**.
