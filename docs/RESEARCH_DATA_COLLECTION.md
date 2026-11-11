# Pengumpulan Data Penelitian FoodRec

## Status dan batas

V1 menyediakan studi, persetujuan, rating responden, dashboard, snapshot CSV, dan alur withdrawal yang terpisah dari aplikasi biasa. Status implementasi dan pemeriksaan terbaru tercatat di [Roadmap](ROADMAP.md); keberadaan fitur tidak membuktikan kualitas metodologi atau kelayakan etik.

- Better Auth dan role `USER`/`ADMIN` existing dipakai. Akun USER lama tidak dianggap responden sampai pemilik akun membaca lalu menyetujui versi persetujuan studi.
- `ResearchRating` hanya menyimpan aksi melalui endpoint penelitian. Data tidak disalin dari `Rating`, seed, fixtures, Altair `DatasetExport`, worker, job queue, batch, atau publikasi.
- Source dicatat sebagai `CONSENTED_USER_ACTION`; ini membuktikan jalur aplikasi dan checkbox “pernah mencoba”, bukan identitas, kelayakan responden, maupun klaim independen bahwa makanan benar-benar dicoba.
- Export menggunakan ID participant numerik pseudonim dan `Food.id`. Database masih menyimpan relasi participant ke User; data **pseudonymous, bukan anonymous**.
- Mathematical parity Altair tetap **PENDING VALIDATION**; Python artifacts **UNVERIFIED**; auto-processing dan automatic publication **OFF**.

## Alur admin

1. Buka `/admin/research`, buat draft, lalu isi deskripsi, tujuan, data yang dikumpulkan, penggunaan, teks persetujuan lengkap, kontak, periode, tanggal retensi, dan kebijakan retensi.
2. Buka pengumpulan hanya setelah periode dimulai dan seluruh konfigurasi lengkap. PostgreSQL partial unique index mengizinkan maksimal satu studi `OPEN`.
3. Saat studi `OPEN`, perubahan material memerlukan consent version baru. Version yang pernah disetujui tidak dapat digunakan kembali. Participant harus memberi persetujuan baru sebelum mengirim rating dengan versi baru; rating lama tidak otomatis memenuhi versi baru.
4. Tutup studi untuk membekukan konfigurasinya; hanya transisi ke `ARCHIVED` yang diizinkan. Snapshot ekspor lama tetap immutable.
5. Dashboard menampilkan hitungan partisipan, kontributor, rating, distribusi, sparsity deskriptif, ekspor, dan withdrawal tertunda. Tidak ada ambang kecukupan ilmiah yang dikonfigurasi.
6. Buat snapshot baru. File bernama versi, disimpan privat, dan memiliki manifest/checksum. Unduh manifest/CSV hanya melalui ADMIN endpoint.

## Alur responden

1. Buka `/research`; baca tujuan, data, penggunaan, kontak, periode, retensi, withdrawal, dan dokumen persetujuan yang disediakan Admin.
2. Masuk dengan akun USER existing. Kotak persetujuan mulai tidak dicentang. Setuju secara eksplisit; server menyimpan versi, salinan dokumen, dan timestamp.
3. Di `/research/rate`, cari/filter katalog dan nilai hanya makanan yang pernah dicoba. Item lain boleh dilewati. Tidak ada rating pengguna lain yang ditampilkan atau target minimum.
4. Rating dapat dilanjutkan kemudian sebelum selesai. Perubahan disimpan dengan idempotency key dan riwayat perubahan. Menyelesaikan sesi tidak mengharuskan jumlah rating tertentu.
5. Dari `/research`, responden dapat meminta withdrawal. Permintaan segera mencabut consent aktif, menghentikan perubahan rating, mengecualikan baris dari export baru, dan menandai ekspor sebelumnya untuk review.

## Export dan verifikasi provenance

CSV utama hanya memiliki header `user_id,food_id,rating`. `user_id` adalah `ResearchParticipant.id`, bukan `User.id`; `food_id` adalah ID katalog Food. Dataset hanya mengambil baris dengan consent versi current yang valid, participant aktif/selesai, rating source `CONSENTED_USER_ACTION`, dan tidak withdrawn. Kontak, email, nama, session, IP, dan data tabel `Rating` tidak diekspor.

Setiap export menyimpan dataset version, study ID, jumlah participant kontributor, jumlah rating dan Food unik, waktu, SHA-256, consent version, status sumber, kebijakan retensi, dan kebijakan withdrawal. Download memverifikasi SHA-256 sebelum mengirim file. Manifest tidak memuat storage key.

Verifikasi: unduh CSV dan manifest sebagai ADMIN, hitung SHA-256 atas byte CSV, lalu cocokkan dengan `sha256`; cocokkan jumlah baris data dengan `ratingCount`, jumlah ID participant/Food unik dengan manifest, dan pastikan header tiga kolom. Simpan salinan manifest bersama data. Export tidak masuk ke `DatasetExport` existing maupun pipeline rekomendasi.

## Withdrawal dan retensi

Withdrawal punya dua tahap: permintaan responden segera menghentikan partisipasi; ADMIN memproses permintaan dengan menghapus rating dan riwayat perubahan penelitian. Bukti consent/revocation, status withdrawal, dan membership ekspor terdampak tetap disimpan untuk audit. Export lama diblokir dari unduhan baru, diberi status `REVOCATION_REQUIRED`, lalu Admin harus mencatat tindakan revokasi, menyatakan penerima eksternal telah diberi tahu, dan menghapus file server. Salinan yang sudah diunduh tidak dapat dihapus oleh aplikasi; follow-up ke penerima harus dilakukan di luar sistem dan dicatat.

Retensi wajib ditentukan sebelum studi dibuka: tanggal dan kebijakan tersimpan pada studi serta manifest. Tidak ada scheduler yang otomatis menghapus data saat tanggal itu tercapai; penanggung jawab harus melakukan review/penghapusan terkontrol dan mendokumentasikan hasil. CLOSED/ARCHIVED tetap beku; jangan mengubah histori melalui SQL.

## Batas klaim

- Demo, synthetic fixture, dan 879 rating existing **bukan** data penelitian terverifikasi. Fitur ini tidak mengimpor atau memperbaiki provenance dataset lama.
- Login dan consent membuktikan tindakan akun, bukan usia, identitas, representasi sampling, atau persetujuan etik.
- Studi tidak menyatakan kepatuhan hukum/etik. Penanggung jawab harus memastikan protokol, izin, dan keputusan institusi yang relevan sebelum mengundang responden.
- Ukuran sampel, kelayakan Collaborative Filtering, dan evaluasi metodologi ditentukan terpisah bersama pemilik penelitian.
