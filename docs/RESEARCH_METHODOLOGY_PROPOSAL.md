# Proposal Metodologi Penelitian FoodRec

**Untuk ditinjau dan disetujui dosen pembimbing. Belum merupakan keputusan final.** Proposal ini merekomendasikan explicit-rating User-Based Collaborative Filtering (UBCF) karena FoodRec mengumpulkan rating 1–5. Persetujuan metode, data, dan protokol evaluasi harus diperoleh sebelum eksperimen final atau perubahan production.

Audit provenance lanjutan menunjukkan sidik pola kuat yang konsisten dengan blok rating demo sintetis pada snapshot 879. Baca [`DATASET_PROVENANCE.md`](DATASET_PROVENANCE.md) sebelum mengajukan dataset ini sebagai data penelitian.

## Ringkasan usulan

Penelitian menguji apakah rating makanan dari pengguna lain yang memiliki pola penilaian mirip dapat membantu memperkirakan rating makanan yang belum dinilai. Model membandingkan rating pada makanan yang sama, memilih `k` pengguna paling mirip, menghitung prediksi rating berbobot similarity, lalu mengurutkan kandidat makanan berdasarkan prediksi tersebut.

**Alasan memilih explicit rating:** rating 1–5 diminta sebagai penilaian preferensi. Nilai 1 dan 5 membawa makna berbeda; metode harus mempertahankan perbedaan itu dan dapat diuji terhadap rating aktual pada data yang ditahan. Binary interaction hanya mencatat apakah suatu pasangan user–makanan pernah muncul. Jika semua baris rating dianggap interaksi positif, rating 1 diperlakukan sama dengan rating 5. Itu masuk akal untuk tujuan “pernah berinteraksi”, bukan otomatis untuk tujuan “makanan yang disukai”.

Audit source publik Recommender Extension menunjukkan `Weighted Knn=false` memakai binary cosine dan skor proporsi tetangga yang berinteraksi; nilai rating tidak dibaca. Diagnostic binary menempatkan 22/22 item Altair di set skor maksimum, tetapi hanya 5 maksimum yang unik dan 17 terikat. Ini mendukung perbedaan semantik, bukan bukti parity: source belum dikaitkan ke build Altair runtime. Detail source dan tie ada di [`ALTAIR_PYTHON_PARITY_INVESTIGATION.md`](ALTAIR_PYTHON_PARITY_INVESTIGATION.md). Repository juga belum memiliki workflow/output Altair explicit-rating yang terverifikasi; ini tidak membuktikan operator tersebut tidak tersedia di instalasi Altair.

Usulan ini sejalan dengan makna fitur produk, **tetapi belum disetujui**. Skala 1–5 bersifat ordinal. Penggunaan cosine raw-rating, rata-rata berbobot, MAE, dan RMSE menganggap jarak antar-rating cukup bermakna secara numerik; asumsi ini harus disetujui dan dijelaskan di skripsi.

## Definisi metode yang diusulkan

### 1. Cosine Similarity explicit-rating

Misalkan `r(u,i)` adalah rating user `u` untuk makanan `i`. Untuk dua user `u` dan `v`, `Iᵤᵥ` adalah kumpulan makanan yang **keduanya** beri rating. Similarity yang dipakai Python saat ini:

```text
sim(u,v) = Σ[i∈Iᵤᵥ] r(u,i) × r(v,i)
           / (sqrt(Σ[i∈Iᵤᵥ] r(u,i)²) × sqrt(Σ[i∈Iᵤᵥ] r(v,i)²))
```

Hanya makanan co-rated masuk ke vektor; rating yang hilang tidak dianggap nol. Kode juga memiliki pilihan zero-filled, tetapi bukan pilihan baseline pada evaluasi yang dilaporkan. Minimum jumlah makanan co-rated adalah parameter `m` dan perlu ditetapkan dalam protokol.

### 2. Pemilihan tetangga

Untuk user target:

1. Keluarkan target itu sendiri.
2. Keluarkan user dengan kurang dari `m` makanan co-rated.
3. Pertahankan similarity positif (`sim > 0`).
4. Urutkan similarity dari terbesar; jika seri, urutkan `user_id` terkecil lebih dulu.
5. Ambil paling banyak `k` user teratas.

`k` adalah jumlah tetangga, bukan jumlah rekomendasi. Parameter baseline saat ini memakai `k=3` dan `m=1`; keduanya **belum** ditetapkan sebagai parameter penelitian.

### 3. Prediksi rating

Untuk kandidat makanan `i`, gunakan hanya tetangga terpilih yang sudah memberi rating pada makanan tersebut:

```text
pred(u,i) = Σ[v∈Nₖ(u), r(v,i) tersedia] sim(u,v) × r(v,i)
            / Σ[v∈Nₖ(u), r(v,i) tersedia] sim(u,v)
```

Hasil adalah weighted average rating pada skala 1–5. Jika tidak ada tetangga terpilih yang menilai `i`, hasil dinyatakan **tidak tersedia**, bukan nol. Baseline Python tidak mengisi nilai yang hilang dengan popularitas atau rata-rata global/user. Penanganan kasus itu harus tetap dilaporkan sebagai coverage, bukan disembunyikan.

### 4. Ranking Top-N

Kandidat adalah makanan aktif yang belum dinilai user target pada data training. Urutkan berdasarkan prediksi rating dari terbesar ke terkecil. Jika prediksi sama, Python memakai `food_id` terkecil lebih dulu. Aturan ini deterministik untuk reproduksi; aturan tie Altair tidak diketahui dan tidak akan ditiru secara artifisial.

### Contoh perhitungan manual

Anggap target user 1 memberi rating `(makanan 1, makanan 2) = (5,1)`.

- User 2 memberi `(5,1)`: `sim(1,2) = (5×5 + 1×1)/26 = 1`.
- User 3 memberi `(1,5)`: `sim(1,3) = (5×1 + 1×5)/26 = 5/13 ≈ 0,3846`.
- Dengan `k=2`, user 2 dan 3 terpilih. Untuk makanan 10, user 2 memberi 4 dan user 3 memberi 5:

```text
pred(1,10) = (1×4 + (5/13)×5) / (1 + 5/13)
           = 77/18 ≈ 4,2778
```

Jika makanan 20 memiliki rating tetangga yang sama, prediksinya seri. Ranking Python menempatkan ID makanan yang lebih kecil lebih dulu. Test oracle independen dari holdout memverifikasi nilai similarity, prediksi, perubahan nilai rating, dan tie ranking: [`test_explicit_rating_methodology.py`](../services/recommender/tests/test_explicit_rating_methodology.py).

## Audit provenance data

| Data | Bukti yang tersedia | Klasifikasi yang aman untuk skripsi |
| --- | --- | --- |
| `foodrec_snapshot_879.csv` | 879 baris, 22 user, 40 makanan; SHA-256 `a2cda622ac8702538c3ba0d9c0ae0ad73be9e88c5d3699e3933cd215c2f23337`. Panduan menyebut nama sumber `foodrec-ratings-20261024T132014Z-9da9769a.csv`, tetapi manifest menyebut “earlier conversation upload or generated artifact”. Paket masuk repository pada commit `6499923`. | **Tidak layak diklaim sebagai data penelitian asli saat ini.** Audit lanjutan menemukan 800 baris untuk ID user 4–23 memiliki sidik formula kuat yang konsisten dengan seed-demo; eksekusi langsung belum terbukti dan timestamp filename mendahului commit seed. Detail bukti dan batasnya di [`DATASET_PROVENANCE.md`](DATASET_PROVENANCE.md). |
| `foodrec_offline_train_264.csv` dan `foodrec_offline_test_66.csv` | Panduan mencatat seed `20261025`, pemilihan 15 rating per user (12 train + 3 test), nilai tidak diubah. SHA-256 train `19e34a779d3637b12667f4a7c3f4f369c8c901c45513b25f2965811ffa6fa349`; test `a5bf580b2d951864937f7f3803de9df50f7280556f02e5d0d32c38a6945dfaea`. Audit file mengonfirmasi 264 + 66 baris adalah bagian dari snapshot dengan nilai sama, tanpa pasangan user-food tumpang tindih; 549 baris snapshot tidak dipakai. | **Turunan/sampel eksperimen**, bukan observasi baru. Provenance mengikuti snapshot 879 dan tetap belum terverifikasi. Tidak tepat disebut data real tambahan atau dataset independen. Seed tercatat, tetapi skrip pembangkit split tidak ada di repository; seed saja tidak cukup untuk mereproduksi split dengan pasti. |
| `ratings_uji_collaborative_filtering_43.csv` | 43 baris, 8 user, 6 makanan. README fixture menyebutnya toy/fixture dan “not real research results”; manifest menyebut earlier upload atau generated artifact. | **Data toy/fixture, bukan hasil penelitian.** Asal rinci—dibuat sintetis atau disediakan sebagai contoh—tidak dapat dibuktikan dari artefak yang ada. Jangan gunakan sebagai bukti empiris. |
| `synthetic_ratings.csv` | Fixture unit test berisi contoh kecil dengan pola nilai yang dipilih untuk hitung manual. | **Sintetis untuk pengujian kode**, bukan data responden. |
| Demo ratings dari `prisma/seed-demo-ratings.ts` | Script membentuk 20 akun `example.test`; rating dibuat deterministik dengan rumus modulo untuk setiap makanan. Versi kini dibatasi ke lokal `_test`, tetapi versi pertama di Git juga mengizinkan lokal `foodrec`. | **Sintetis/demo berdasarkan kode.** Bukan data penelitian. Sidik formula tampak pada 800 baris snapshot, tetapi audit ini tidak membaca database dan tidak menemukan log eksekusi; lihat [`DATASET_PROVENANCE.md`](DATASET_PROVENANCE.md). |

Data seed katalog Food berbeda dari data rating. Seed utama katalog tidak membuat rating dummy. Tidak ada database yang dibaca, diubah, atau di-reset untuk proposal ini.

### Status data untuk penelitian

Sebelum Bab III menyebut 879 rating sebagai data penelitian, minta sumber primer, proses pengumpulan, definisi responden, izin penggunaan, dan konfirmasi apakah nilai dibuat oleh pengguna nyata atau generator/demo. Jika bukti tersebut tidak tersedia, perlakukan 879/264/66 hanya sebagai **pilot teknis**; gunakan data berprovenance terverifikasi untuk kesimpulan penelitian. Jangan mengarang asal dataset.

## Rancangan eksperimen yang diusulkan

Tidak ada optimasi final dijalankan dalam pekerjaan ini. Konfigurasi berikut adalah rancangan untuk disetujui, bukan hasil eksperimen.

### Tahap A — verifikasi dan kunci data

1. Dapatkan sumber primer serta izin, dokumentasikan instrumen rating dan arti angka 1–5.
2. Simpan sumber mentah hanya-baca. Catat nama sumber, tanggal penerimaan, jumlah baris, data dictionary, transformasi, dan SHA-256.
3. Validasi ID user/makanan, nilai rating integer 1–5, pasangan duplikat, nilai hilang, serta hubungan sumber ke file turunan. Hilangkan PII dari file eksperimen.
4. Jika memakai snapshot saat ini, tandai sebagai data pilot sampai provenance disahkan. Jangan gabungkan rating demo/test ke snapshot penelitian.

### Tahap B — split dan reproduksibilitas

Split 264/66 yang sudah dilihat hasilnya adalah **pilot**, bukan final test yang masih blind. Untuk evaluasi utama, jika sumber 879 tervalidasi, usulkan **5-fold cross-validation per user**: bagi pasangan user-food setiap user ke lima fold, pertahankan setidaknya satu rating user di training, dan pastikan pasangan test tidak muncul di training. Ini mengevaluasi rekomendasi untuk user yang sudah dikenal; bukan cold-start user.

Pemilihan `k` harus berlangsung hanya pada validation folds di dalam training fold (nested validation), bukan pada outer test fold. Usulan kandidat awal: `k ∈ {1, 3, 5, 10}`; jumlah user lain maksimum 21. `m` dapat dikunci di 1 untuk baseline atau diuji pada nilai terbatas yang disetujui pembimbing. Usulan primary metric rating adalah MAE, dengan RMSE dan coverage wajib dilaporkan; syarat minimum coverage harus disepakati sebelum run. Di inner validation, pilih MAE terendah di antara konfigurasi yang lolos syarat coverage; jika seri, pilih `k` lebih kecil. Jangan memilih k atau m dari satu hasil 264/66.

**Spesifikasi reproduksi yang diusulkan (belum dijalankan):** lakukan 5 outer folds × 5 pengulangan dengan seed `20261111, 20261112, 20261113, 20261114, 20261115`. Untuk setiap user, urutkan baris menurut `(user_id, food_id)`, acak dengan `random.Random(seed + user_id)`, lalu bagikan bergiliran ke lima fold. Untuk inner folds pada outer-training, pakai prosedur sama dengan seed `seed + 1000 + outer_fold_index`. Catat versi Python dan skrip pembagi karena keduanya bagian dari reproduksi. Skrip harus menolak fold yang membuat user tanpa rating training atau pasangan user-food bocor ke test. Ini proposal untuk persetujuan—tidak ada split atau pencarian konfigurasi baru yang dijalankan.

Sebelum run, protokol perlu mencatat seed, urutan canonical baris, algoritme pembagian fold, versi Python, commit kode, checksum input, parameter, dan output per fold. Manifest run setidaknya mengikat `repeat,fold,user_id,food_id,actual_rating,predicted_rating,k,m,covered,missing_reason` ke checksum input dan versi skrip. Skrip pembagi 264/66 saat ini tidak tersedia; jangan mengklaim split lama dapat dibuat ulang hanya dari seed. Tambahkan skrip versi-terkendali setelah protokol disetujui. Jika snapshot 879 tidak dapat diverifikasi, jangan menjalankan cross-validation tersebut sebagai penelitian empiris.

Karena hasil pada split 264/66 sudah dilihat, perlakukan sebagai pilot eksploratif, bukan final test blind. Nested cross-validation baru pada snapshot yang sama dapat memberi estimasi internal yang lebih baik, tetapi tidak menghapus ketidakpastian provenance atau menjadi validasi eksternal. Untuk klaim konfirmatori, utamakan data baru/independen yang provenance-nya disahkan; bila tidak tersedia, jelaskan batasan desain secara terbuka.

### Tahap C — baseline dan metrik

**Prediksi rating:** bandingkan UBCF sekurangnya dengan:

- **Rata-rata global** rating training: baseline sederhana untuk seluruh user/item.
- **Rata-rata user** dari rating training user target: menguji apakah personalisasi tetangga menambah nilai di atas kecenderungan rating user.
- **Rata-rata item** dari rating training makanan target: baseline preferensi umum makanan.

Semua baseline dihitung dari training fold saja. Laporkan coverage setiap metode. Untuk perbandingan error yang adil, laporkan metrik baseline juga pada pasangan yang sama-sama diprediksi UBCF; selain itu laporkan performa dan coverage masing-masing pada seluruh test fold.

Untuk pasangan test yang memiliki prediksi, hitung:

```text
MAE  = Σ |prediksi − rating aktual| / jumlah prediksi tersedia
RMSE = sqrt(Σ (prediksi − rating aktual)² / jumlah prediksi tersedia)
Coverage = jumlah pasangan test dengan prediksi / jumlah seluruh pasangan test
```

MAE/RMSE tidak memberi penalti pada kasus tanpa prediksi; karena itu selalu tampilkan coverage, jumlah missing, dan alasan missing. Ambang minimal coverage/error harus dipilih sebelum melihat hasil final.

**Ranking Top-N:** evaluasi terpisah dari MAE/RMSE. Usulan awal: makanan dengan rating test `≥4` dianggap relevan; ambang ini perlu disetujui. Bentuk kandidat hanya dari training, lalu laporkan Precision@N, Recall@N, dan NDCG@N pada N yang dipra-tetapkan. Bandingkan dengan ranking rata-rata rating item dan popularitas item dari training saja. Rating yang tidak teramati bukan otomatis negatif; jelaskan bahwa relevance label test mungkin tidak lengkap.

### Tahap D — pelaporan

Laporkan hasil per fold dan agregat (rata-rata serta variasi/interval ketidakpastian), `k` terpilih dari validation saja, coverage, MAE, RMSE, alasan missing, metrik ranking terpisah, dan hasil baseline. Sertakan checksum data, script/commit, seed, konfigurasi, dan log yang cukup untuk mengulang run. Jangan menyebut job berhasil atau ranking cocok sebagai bukti kebenaran metodologi.

## Mengapa hasil awal 42/66 belum final

Hasil pilot saat ini memakai `k=3`, minimum overlap 1, pada satu split kecil: 42 prediksi tersedia, coverage 63,64%, MAE 0,571609, RMSE 1,086003; 24 kasus tidak terprediksi karena tiga neighbor terpilih tidak menilai makanan holdout. Angka ini belum cukup untuk kesimpulan karena:

1. MAE/RMSE hanya dihitung pada 42 kasus tercakup. Kasus yang hilang tidak setara dengan error nol; subset tercakup bisa lebih mudah diprediksi.
2. Coverage 63,64% meninggalkan lebih dari sepertiga pasangan test tanpa rating prediksi. Penerimaan coverage belum ditetapkan.
3. Hanya satu konfigurasi `k=3` dan satu split yang diuji; belum ada validasi parameter, baseline pembanding, replikasi, atau interval ketidakpastian.
4. Split sudah dianalisis, seed tidak disertai generator, dan provenance sumber 879 belum dikonfirmasi. Maka ini bukan blind confirmation atau bukti data responden nyata.
5. Hasil train-264 Top-1 mengukur kesamaan ranking item dengan Altair, bukan akurasi rating pada test. Keduanya tidak boleh digabung menjadi satu klaim.

## Keputusan untuk persetujuan pembimbing

- [ ] Apakah tujuan penelitian memprediksi **tingkat preferensi rating** atau hanya menemukan **interaksi**? Setujui explicit-rating UBCF sebagai rekomendasi, atau pilih binary dan revisi pertanyaan penelitian.
- [ ] Apakah angka 1–5 boleh diperlakukan sebagai nilai numerik dengan jarak bermakna? Setujui raw-rating cosine/weighted average, atau minta metode yang mengoreksi perbedaan skala user untuk diuji.
- [ ] Apakah snapshot 879 asli, demo, atau sintetis? Sumber primer, populasi, sampling, dan izin apa yang dapat dibuktikan?
- [ ] Setujui split per user, 5-fold, nested validation, seed/prosedur reproducibility, dan status 264/66 sebagai pilot yang telah dilihat.
- [ ] Setujui kandidat `k={1,3,5,10}`, minimum overlap, Top-N, serta aturan tie sebelum eksperimen final.
- [ ] Pilih primary metric, baseline, target MAE/RMSE dan coverage; setujui relevance threshold dan metrik ranking secara terpisah.
- [ ] Apakah parity Altair wajib? Jika ya, workflow/build dan output explicit-rating apa yang menjadi rujukan? Artefak saat ini belum membuktikan ada workflow tersebut.
- [ ] Setelah hasil penelitian dan technical validation lulus, apakah pengguna mengizinkan perubahan production? Persetujuan membuka gate dan aktivasi auto-processing/publication harus terpisah.

## Ringkasan draf Bab III

> Penelitian ini mengusulkan metode User-Based Collaborative Filtering untuk memperkirakan rating makanan yang belum dinilai berdasarkan kemiripan pola rating pengguna. Kemiripan dua pengguna dihitung menggunakan Cosine Similarity pada makanan yang dinilai bersama. Pengguna dengan similarity positif dan jumlah rating bersama yang memenuhi batas minimum diperingkat sebagai tetangga; sebanyak `k` tetangga teratas dipilih. Rating kandidat diperkirakan menggunakan rata-rata berbobot similarity dari tetangga yang telah memberi rating pada kandidat. Makanan aktif yang belum dinilai diurutkan berdasarkan prediksi rating menurun untuk menghasilkan Top-N. Evaluasi prediksi rating menggunakan MAE dan RMSE pada pasangan test yang berhasil diprediksi serta prediction coverage pada seluruh pasangan test. Evaluasi ranking Top-N menggunakan threshold relevansi dan metrik ranking yang ditetapkan terpisah. Data, arti skala rating, nilai parameter, split, dan ambang penerimaan akan ditetapkan setelah persetujuan dosen pembimbing.

**Catatan sebelum naskah final:** paragraf ini masih proposal. Jangan isi sumber data sebagai “data asli”, nyatakan parameter sebagai hasil optimal, atau klaim parity Altair sebelum bukti dan persetujuan tersedia.

## Status operasional FoodRec

Proposal ini tidak mengubah production engine, database, workflow Altair, atau validation gate. Mathematical parity tetap **PENDING VALIDATION**; artifact tetap **UNVERIFIED**; auto-processing dan automatic publication tetap **OFF**. Tidak ada database reset, deploy, atau push.
