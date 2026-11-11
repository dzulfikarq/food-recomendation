# Keputusan Metodologi Rekomendasi

## Status: rekomendasi menunggu persetujuan

**Rekomendasi untuk dibawa ke pembimbing:** gunakan explicit-rating User-Based Collaborative Filtering (UBCF) sebagai metode utama, karena FoodRec meminta rating preferensi 1–5. Ini belum menjadi keputusan penelitian yang disetujui dan bukan izin mengubah production engine. Python explicit-rating hanya kandidat implementasi. Pemilik metodologi—peneliti dan pembimbing—harus mengesahkan definisi rating, rumus, protokol evaluasi, serta ambang penerimaan.

Versi ringkas yang ditujukan untuk tinjauan dosen pembimbing tersedia di [`RESEARCH_METHODOLOGY_PROPOSAL.md`](RESEARCH_METHODOLOGY_PROPOSAL.md); dokumen ini menyimpan detail keputusan dan acceptance criteria FoodRec.

Jangan menyamakan model ini dengan operator Altair Item Recommendation yang diaudit. Source publik mengindikasikan operator tersebut memakai implicit/binary interaction; binary diagnostic cocok pada set skor maksimum native, tetapi source belum dikaitkan dengan extension runtime. Mathematical parity tetap **PENDING VALIDATION**. Auto-processing dan automatic publication tetap **OFF**; artifact tetap **UNVERIFIED**.

Provenance snapshot 879 mendapat audit lanjutan di [`DATASET_PROVENANCE.md`](DATASET_PROVENANCE.md); status kelayakan dataset perlu diselesaikan sebelum eksperimen skripsi.

## Audit PRD dan dokumen penelitian

- [`PRD.md`](PRD.md) menetapkan UBCF/Cosine dan rating eksplisit 1–5, tetapi sebelumnya belum membedakan estimasi rating dari ranking Top-N dan belum menetapkan neighbor rule, formula prediksi, evaluasi, atau arti skala rating. Bagian metode sekarang merujuk proposal ini dan menandai persetujuan sebagai pending.
- [`RECOMMENDATION_ENGINE_VALIDATION.md`](RECOMMENDATION_ENGINE_VALIDATION.md) mendokumentasikan Python sebagai prediksi rating berbobot, sementara perbandingan Altair yang tersedia adalah ranking item. Mismatch Top-1 bukan metrik prediksi rating dan bukan alasan mengganti tie-break.
- [`ALTAIR_PYTHON_PARITY_INVESTIGATION.md`](ALTAIR_PYTHON_PARITY_INVESTIGATION.md) mengaudit source publik: binary cosine, pemilihan tetangga dari positive interaction, dan skor dukungan tetangga. Source version runtime belum terverifikasi. Kecocokan 22/22 berarti item native ada di set skor maksimum; hanya 5 maksimum unik dan 17 terikat. Itu bukan bukti kesetaraan matematis.
- Dataset 264/66 berasal dari split seeded atas snapshot 879 baris; provenance rating sumber belum terverifikasi. Split memisahkan semua pasangan user-food, tetapi satu holdout ini belum membuktikan generalisasi ke populasi pengguna.

## Dua alternatif metodologi

### A. Explicit-rating UBCF — rekomendasi bersyarat

**Sinyal:** nilai rating 1–5 menyatakan tingkat preferensi. Rating 1 dan 5 tidak boleh diperlakukan sebagai event yang sama.

Implementasi Python saat ini menggunakan raw-rating cosine hanya pada makanan yang dinilai kedua user. Untuk target user `u`, neighbor `v`, dan pasangan co-rated `Iᵤᵥ`:

```text
sim(u,v) = Σ[i∈Iᵤᵥ] r(u,i)·r(v,i)
           / (sqrt(Σ[i∈Iᵤᵥ] r(u,i)²) · sqrt(Σ[i∈Iᵤᵥ] r(v,i)²))
```

Python lalu mengecualikan target, user dengan overlap di bawah minimum, dan similarity `≤ 0`; urutkan similarity menurun, lalu `user_id` menaik untuk tie, ambil `k` teratas. Minimum overlap default kode adalah 1; evaluasi holdout memakai `k=3`, minimum 1. Nilai ini belum disetujui atau dioptimasi sebagai parameter skripsi.

Untuk item `i`, prediksi hanya memakai neighbor terpilih yang memberi rating pada `i`:

```text
pred(u,i) = Σ[v∈Nₖ(u), r(v,i) ada] sim(u,v)·r(v,i)
            / Σ[v∈Nₖ(u), r(v,i) ada] sim(u,v)
```

Jika tidak ada neighbor terpilih yang menilai item, prediksi tidak tersedia (`None`); tidak ada imputasi, popularitas fallback, atau mean user. Kandidat adalah makanan aktif yang belum dinilai target. Ranking urutkan prediksi menurun, lalu `food_id` menaik untuk skor seri. Implementasi membatasi hasil ke min/max rating neighbor terpakai untuk menghilangkan drift floating point; weighted mean eksak memang berada dalam batas itu. Tie-break adalah kebijakan deterministik Python, bukan klaim aturan Altair.

**Contoh hitung manual dan oracle unit test.** User 1 memberi `(food 1, food 2)=(5,1)`. User 2 memberi `(5,1)` sehingga similarity `26/26=1`. User 3 memberi `(1,5)` sehingga similarity `(5×1+1×5)/26=5/13`. Dengan `k=2`, jika rating food 10 dari user 2 dan 3 masing-masing 4 dan 5:

```text
pred(1,10) = (1×4 + (5/13)×5) / (1 + 5/13)
           = 77/18 ≈ 4.277778
```

[`test_explicit_rating_methodology.py`](../services/recommender/tests/test_explicit_rating_methodology.py) memeriksa hasil manual tersebut, perubahan prediksi saat rating tetangga berubah, dan tie ranking food-ID. Test tidak memakai fixture holdout sebagai oracle.

**Kesesuaian dan batasan:** metode memakai intensitas rating yang memang dikumpulkan aplikasi dan menghasilkan skala prediksi 1–5; rating rendah tidak menjadi rekomendasi positif otomatis. Namun raw-rating cosine menganggap rating numerik dapat diperlakukan sebagai magnitudo dan tidak mengoreksi kebiasaan user yang cenderung memberi rating tinggi/rendah. Rating 1–5 bersifat ordinal; penggunaan MAE/RMSE dan rata-rata berbobot memerlukan alasan bahwa jarak antar nilai cukup bermakna. Jelaskan asumsi ini saat sidang atau minta persetujuan metode alternatif sebelum eksperimen final. Jangan diam-diam mengganti rumus.

### B. Binary/implicit interaction User-kNN — alternatif untuk tujuan berbeda

Source publik Recommender Extension commit [`3d89c7d`](https://github.com/matmih/Recommender-extension/commit/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd) menunjukkan `Weighted Knn=false` membangun positive-only feedback tanpa membaca magnitudo rating. Similarity berupa cosine binary:

```text
simᵦ(u,v) = |Iᵤ ∩ Iᵥ| / sqrt(|Iᵤ|·|Iᵥ|)
score(u,i) = jumlah neighbor terpilih yang berinteraksi dengan i / k
```

Semua baris rating menjadi event yang sama. Neighbor lain dapat mengisi slot walau similarity nol. Skor tie dapat menghasilkan pilihan Top-N acak pada source yang diaudit. Pada train-264, 22/22 native item berada dalam set skor maksimum; hanya 5/22 unik dan 17/22 terikat. Ini hanya **score compatibility**. Binary diagnostic tidak membuktikan source sama dengan runtime Altair.

Alternatif ini tepat bila tujuan penelitian adalah menemukan item yang pernah diinteraksikan user—dan protokol menjelaskan mengapa rating 1 pun dianggap interaksi positif. Ia membuang perbedaan rating 1 versus 5 dan tidak memprediksi nilai rating. Maka MAE/RMSE rating tidak sesuai untuk model ini; evaluasi harus berbasis ranking/relevance yang ditetapkan terpisah. Mengadopsinya mengubah pertanyaan dan klaim skripsi, bukan sekadar memperbaiki parity.

## Audit workflow Altair dan parity

Repository memuat tiga workflow XML Altair. Semuanya memakai `irbrecommender:user_k-NN` dan `irbrecommender:apply_model_ir`; result yang dipilih adalah `user_id,item_id,rank`. Tidak ada workflow tersimpan yang menunjukkan prediksi numerik 1–5 atau ekspor pasangan actual/predicted rating. Panduan offline menyebut prosedur “User k-NN Rating Prediction”, tetapi bukan workflow atau hasil eksekusi yang dapat diverifikasi.

Kesimpulan yang didukung: **belum ada workflow Altair explicit-rating prediction yang terverifikasi dalam artefak repository**. Ini tidak membuktikan Altair/extension runtime tidak memiliki operator tersebut. Versi Altair, extension, workflow train-264, dan output holdout rating prediction belum tersedia. Jangan mengklaim Python–Altair parity untuk rating prediction. Jika Altair explicit-rating workflow ditemukan, cocokkan formula, neighbor IDs/similarity, predicted values, versi/build, dan split sebelum klaim parity. Jika tidak ditemukan, pembimbing harus menyetujui Python sebagai implementasi metode yang dinilai; jangan memaksakan operator binary sebagai pembanding matematika.

## Evaluasi rating prediction: train-264 / test-66

Dataset training berisi 264 rating, 22 user × 12 rating, 40 makanan, dan nilai 1–5. Frekuensi rating train: `1:43, 2:54, 3:51, 4:53, 5:63`. Holdout berisi 66 pasangan, 3 per user; semua pasangan user-food tidak overlap dengan train. Snapshot sumber 879 baris dan provenance nilai rating belum dikonfirmasi. Train dipakai untuk membentuk similarity/neighbors; **tidak ada metrik train yang dilaporkan**, agar skor fit bukan disalahartikan sebagai generalisasi.

Dengan explicit-rating Python baseline (`k=3`, minimum overlap 1):

| Hasil | Nilai |
| --- | ---: |
| Prediksi tersedia | 42/66 |
| Coverage | 63.64% |
| Tidak ada prediksi | 24/66 |
| MAE pada 42 prediksi tersedia | 0.571609 |
| RMSE pada 42 prediksi tersedia | 1.086003 |

Dengan `P` sebagai 42 pasangan yang berhasil diprediksi, `MAE = Σ[p∈P]|predₚ−actualₚ|/|P|` dan `RMSE = sqrt(Σ[p∈P](predₚ−actualₚ)²/|P|)`. Pasangan yang tidak punya prediksi tidak diberi error nol; jumlahnya dilaporkan terpisah melalui coverage.

Semua 22 user memperoleh tiga neighbor terpilih. Keenam user `3,4,8,12,17,18` mendapat 3/3 prediksi; delapan user `5,6,9,10,13,14,16,21` mendapat 2/3; delapan user `2,7,11,15,19,20,22,23` mendapat 1/3. Seluruh 24 miss terjadi karena tidak satu pun dari tiga neighbor terpilih memberi rating pada item holdout itu. Karena MAE/RMSE hanya memakai 42 kasus covered, keduanya adalah **conditional metrics**, bukan error pada seluruh test set; coverage dan pola missing wajib dilaporkan bersama.

Ini satu split kecil dengan source provenance belum terverifikasi, tanpa hasil baseline pembanding, confidence interval, atau tuning validation terpisah. Angka ini deskriptif, bukan bukti kelayakan produksi atau generalisasi. Tetapkan target coverage/error sebelum melihat eksperimen final; jangan memilihnya setelah hasil diketahui.

## Evaluasi ranking Top-N terpisah

Top-N menilai urutan item, bukan akurasi nilai rating. Jangan hitung MAE/RMSE dari rank atau menganggap `MATCHED OUTPUT` sebagai prediksi rating yang benar. Untuk evaluasi ranking, protokol harus terlebih dahulu menentukan relevance (misalnya rating holdout `≥4`, **usulan yang masih perlu persetujuan**), ukuran `K`, candidate universe, dan perlakuan item tanpa label. Rating holdout yang diamati bukan ground truth untuk item yang tidak pernah dinilai; item tak teramati tidak otomatis negatif.

Laporkan metrik ranking yang ditetapkan protokol—misalnya Precision@K, Recall@K, dan NDCG@K—secara terpisah dari MAE/RMSE serta coverage prediksi. Kandidat harus dibentuk dari informasi train saja. Jangan memilih threshold, K, atau tie-break untuk mengejar 22/22 Altair; Top-1 native memiliki tie scores dan source tie behavior runtime belum terverifikasi.

## Acceptance criteria sebelum aktivasi

### Ilmiah — wajib sebelum menganggap metode final

1. Peneliti dan pembimbing menyetujui explicit-rating atau binary-interaction sebagai definisi masalah; jelaskan rating 1–5, arti tiap nilai, dan asumsi ordinal/interval.
2. Bekukan spesifikasi: similarity dan missing-value policy, minimum overlap, neighbor selection, `k`, predictor, cold-start/missing-prediction handling, candidate filter, Top-N dan tie-break. Parameter dipilih dengan validation data saja, bukan test set.
3. Verifikasi provenance/izin dataset, ID mapping, preprocessing, checksum, dan split. Gunakan test yang tidak dipakai memilih model; laporkan keterbatasan representativitas snapshot 879-row.
4. Tetapkan sebelum eksperimen final ambang MAE/RMSE **dan** coverage, serta baseline rating sederhana yang relevan. Laporkan jumlah kasus tercakup, missing reasons, metrik covered-only, dan ketidakpastian. Coverage 63.64% saat ini perlu keputusan eksplisit—tidak boleh disamarkan dengan membuang 24 kasus.
5. Tetapkan ranking relevance threshold, candidate protocol, `K`, metrik dan baseline secara terpisah. Laporkan ranking metrics dan rating metrics sebagai hasil berbeda; item tidak teramati bukan otomatis negatif.
6. Ulangi evaluasi dengan split/validasi yang cukup atau justifikasi holdout tunggal; laporkan variasi/confidence interval dan hindari tuning pada test. Reproduksi hasil dari skrip serta manual example/unit test independen.
7. Jika skripsi mengklaim parity Altair, sediakan workflow/build runtime yang teridentifikasi dan intermediate neighbors/scores/predicted ratings dari model yang sama. Tanpanya klaim parity dilarang.

### Teknis — wajib sebelum auto-processing/publication

1. Model dan konfigurasi yang disetujui punya versi tetap; hasil dapat direproduksi dari snapshot/checksum, source revision, parameter, dan output scores. Unit/integration tests memeriksa formula, missing path, candidate exclusions, tie, determinisme, dan skala rating.
2. Jalankan validasi end-to-end pada database `_test` terisolasi. Verifikasi snapshot immutable, stale-revision rejection, idempotency, batas akses, error handling, artifact checksum, rollback/recovery, dan bahwa hasil tidak mengubah batch aktif sebelum validasi.
3. Rating artifact melewati status verifikasi eksplisit; `SUCCEEDED` hanya berarti job selesai. Validasi jumlah baris, user/item eligibility, rank/score, coverage, missing reasons, parameter, dan report sebelum publikasi.
4. Persetujuan metodologi/ambang ilmiah, bukti versi workflow/engine, review operasional, dan **persetujuan pengguna terpisah** diperlukan untuk membuka auto-processing dan automatic publication. Aktivasi harus lewat perubahan gate/migration yang ditinjau; bukan perubahan scope dokumen ini.

## Persetujuan yang masih dibutuhkan

- Pilih definisi utama: rating 1–5 sebagai preferensi eksplisit (rekomendasi saya) atau setiap rating sebagai interaksi positif.
- Setujui asumsi raw-rating cosine/weighted-average atau minta protokol alternatif; setujui relevance threshold dan parameter final bersama pembimbing.
- Konfirmasi apakah Python menjadi metode/otoritas eksperimen bila workflow Altair rating-prediction tidak tersedia; berikan workflow Altair/build bila parity wajib.
- Setujui ambang ilmiah coverage/error/ranking dan dataset final.
- Beri izin terpisah sebelum perubahan production engine, penggantian manual Altair workflow, membuka validation gate, auto-processing, atau automatic publication.

Sampai persetujuan dan acceptance criteria terpenuhi: production engine tidak berubah, `PENDING_VALIDATION` tetap, auto-processing/publication tetap OFF, artifact tetap `UNVERIFIED`, tidak ada publikasi otomatis.
