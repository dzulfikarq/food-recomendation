# UX FoodRec

Dokumen ini menjelaskan pengalaman produk yang berjalan. Status data rekomendasi tetap berasal dari backend; tampilan tidak membuat rating, batch, tanggal, atau hasil contoh.

## Prinsip

- Gunakan Bahasa Indonesia yang jelas. Istilah penelitian hanya tampil di panduan ADMIN.
- Bantu pengguna mengambil tindakan berikutnya tanpa mewajibkan mereka menilai makanan yang tidak dikenal.
- Rating tersimpan eksplisit setelah tombol simpan ditekan. Perubahan tidak dianggap tersimpan sebelum server berhasil merespons.
- Rekomendasi hanya tampil setelah batch tervalidasi dan diterbitkan. Rating baru tidak memicu pemrosesan otomatis.
- Sajikan informasi bertahap: tugas utama lebih dulu, detail teknis dan riwayat di bagian lanjutan.
- Pertahankan alur penelitian, otorisasi, CSV, snapshot immutable, filter hasil, dan riwayat audit yang sudah ada.

## Alur pengguna

### Guest

Beranda → jelajahi katalog aktif → daftar atau masuk untuk memberi rating. Katalog dapat dibaca tanpa login; penulisan rating hanya untuk USER.

### USER

Daftar/masuk → beranda personal → jelajahi makanan → beri atau perbarui rating → lihat Rating Saya → lihat Rekomendasi.

Partisipasi penelitian terpisah dan sukarela: `/research` → baca dokumen → consent checkbox unchecked → `/research/rate` → nilai makanan pernah dicoba, lewati yang lain → lanjutkan atau selesaikan → withdrawal tersedia pada status penelitian.

Beranda menampilkan sapaan, jumlah rating tersimpan, langkah berikutnya, tautan katalog/rating, status rekomendasi, dan tanggal publikasi jika tersedia. Jumlah rating tidak menjadi ambang dan bukan jaminan hasil.

### ADMIN

Dashboard operasional dan monitoring → siapkan dataset → unduh CSV → jalankan Altair manual → impor hasil → validasi → konfirmasi publikasi → tinjau riwayat.

Python UBCF menjadi engine utama aplikasi. Hanya E2E lokal dengan database `_test` dapat mengantrekan job setelah rating dan menerbitkan hasil sesudah verifikasi teknis. Di lingkungan lain, rating tidak memulai komputasi dan batch tetap mengikuti workflow manual Admin.

## Halaman

| Halaman | Tujuan dan perilaku |
| --- | --- |
| `/` untuk Guest | Jelaskan katalog, rating, dan penerbitan hasil; CTA daftar/masuk dan jelajah makanan. |
| `/` untuk USER | Dashboard personal berbasis rating dan status database. Tawarkan tindakan eksplorasi tanpa target rating wajib. |
| `/foods` | Cari nama/kode, filter kategori, urutkan, dan paginasi. USER dapat memilih semua, belum dinilai, atau sudah dinilai. Progres menghitung rating pada makanan aktif sebagai ringkasan, bukan target. Filter tanpa hasil menjelaskan cara mengubah pencarian. |
| `/foods/[id]` | Foto/placeholder, nama, kategori, deskripsi, asal/rasa, serta kontrol rating. |
| `/my-ratings` | Ringkasan jumlah dan rata-rata rating, navigasi kembali ke katalog, serta riwayat akun aktif. Rating makanan aktif dapat diubah; makanan nonaktif tetap terlihat sebagai riwayat. |
| `/recommendations` | Judul “Rekomendasi Untukmu”, penjelasan pola rating, tanggal pembaruan, kartu berperingkat dan tautan detail. Empty state dibedakan berdasarkan status backend. |
| `/research` | Baca studi, tujuan, data, penggunaan, kontak, periode/retensi, teks consent; status consent/progress, partisipasi sukarela, withdrawal. Consent checkbox tidak dicentang default. |
| `/research/rate` | Search, filter kategori/status, catalog Food ID, mobile-friendly bintang 1–5 dan label, tried-food attestation, progress, save/update feedback, skip, continue, complete tanpa target. Tidak menampilkan rating user lain. |
| `/admin` | Statistik aktual: makanan aktif, pengguna pemberi rating, total rating, dataset, batch aktif, dan publikasi terakhir. Monitoring menampilkan revision dataset, gate, job terbaru, heartbeat worker, serta langkah berikutnya kondisional. |
| `/admin/foods` | Katalog dengan pencarian/filter server-side, pagination, status, CRUD, dan empty state berbeda untuk katalog kosong vs filter tanpa hasil. |
| `/admin/ratings` | Jumlah rating, pembuatan snapshot, pencarian ID/nama file, riwayat snapshot berpaginasi, checksum, unduhan terproteksi, loading dan empty state. |
| `/admin/recommendations` | Overview engine dan job monitoring terpisah dari enam tahap workflow manual. Dataset, unduhan CSV, panduan Altair, impor, validasi, dan publikasi tampil berurutan; filter/pencarian riwayat ada di detail audit. |
| `/admin/research` | Study CRUD/status dan consent text, statistik aktual tanpa PII respondent, distribusi/density deskriptif, withdrawal pending, CSV + manifest/checksum, download dan revocation review. |

## Status rekomendasi USER

Semantics status backend tidak berubah.

| Status | Penjelasan | Tindakan yang tersedia |
| --- | --- | --- |
| `NO_RATINGS` | Belum ada rating pada akun. | Jelajahi dan nilai makanan yang dikenal. |
| `NO_BATCH` | Rating ada, tetapi belum ada batch yang diterbitkan. | Lihat rating atau lanjut jelajah; selain prototipe `_test`, publikasi tetap manual. |
| `NOT_INCLUDED` | Akun tidak tercantum pada batch aktif. | Jelajahi katalog atau tinjau rating; hasil baru perlu batch diterbitkan admin. |
| `ALL_RATED` | Semua rekomendasi aktif sudah dinilai. | Lihat Rating Saya atau jelajahi katalog. |
| `NO_AVAILABLE_FOODS` | Tidak ada kandidat aktif yang dapat ditampilkan. | Jelajahi katalog aktif atau lihat rating. |
| `READY` | Ada rekomendasi aktif yang belum dinilai. | Buka detail makanan dan beri rating bila dikenal. |

## Tahap workflow ADMIN

1. **Siapkan Dataset** — lihat ringkasan rating/katalog, buat snapshot immutable, dan pilih sumber data.
2. **Unduh CSV** — unduh snapshot privat yang akan dipakai, agar input Altair dan hasil impor merujuk dataset yang sama.
3. **Jalankan Altair** — ikuti panduan manual UBCF, Cosine Similarity, dan user k-NN. FoodRec tidak menjalankan atau mengonfirmasi proses Altair; k/Top-N harus dicatat sesuai eksperimen.
4. **Impor Hasil** — pilih snapshot sumber dan unggah CSV. Masukkan parameter yang benar-benar dipakai; tidak ada nilai default yang diklaim sebagai hasil penelitian.
5. **Validasi** — tinjau referensi, rank, warning stale, error, dan preview. Validasi struktur FoodRec bukan bukti kesesuaian matematis dengan Altair.
6. **Publikasikan** — tinjau batch valid dan tidak kosong, lalu konfirmasi publikasi manual. Server memvalidasi ulang dan menerbitkan secara atomik; riwayat/checksum tetap tersedia.

Stepper menunjukkan tahap saat ini/selesai berdasarkan snapshot dan batch tersimpan. Monitoring memakai API Admin yang ada dan membedakan job dihitung, artifact `UNVERIFIED`, validasi, serta batch published. Worker online hanya jika heartbeat aktual berumur kurang dari 90 detik. Tak ada kontrol UI untuk membuka production gate; prototipe `_test` hanya diaktifkan oleh env E2E. Navigasi tahap memakai anchor; refresh membangun ulang status dari database.

Kecocokan format dengan ekspor penelitian Altair yang sebenarnya tetap **Pending Validation** sampai file tersebut diuji. Panduan tidak menyatakan workflow berhasil dengan data penelitian asli.

## Komponen utama

- `PublicHeader` — navigasi publik responsif untuk beranda, katalog, rating, dan rekomendasi.
- `FoodCard` — gambar/placeholder, nama, kategori, deskripsi, asal/rasa, dan pintasan detail/rating.
- `FoodRatingControl` — radio bintang native yang dapat dioperasikan keyboard, label skala 1–5, perubahan belum tersimpan, tombol simpan, dan feedback hasil.
- `RecommendationsClient` / `RecommendationCard` — status loading/error/retry, narasi status, waktu publikasi, rank, dan navigasi detail.
- `AdminNavigation` — navigasi admin desktop dan mobile.
- `RecommendationImportForm` — input dataset/CSV/k/Top-N dan feedback impor.
- `RecommendationValidationReportView` — ringkasan, stale warnings, error per baris, dan preview.
- `PublishRecommendationBatch` — konfirmasi publikasi custom dan feedback transaksi.
- `EngineMonitoring` — ringkasan engine/job, heartbeat, safe error summary, revision dan artifact status melalui endpoint Admin terlindungi.
- `ConsentPanel` / `ResearchRatingExperience` — persetujuan unchecked, checklist pernah mencoba, skala bernama, status/error/loading, tanpa target minimum.
- `ResearchDashboard` / `ResearchStudyForm` — konfigurasi masa retensi, statistik pseudonim, export, dan tindakan withdrawal/revocation berotorisasi.
- `FoodGridSkeleton` — state loading katalog dan riwayat rating.

## Sistem visual dan aksesibilitas

- Primary `#F97316`; hover `#EA580C`; latar cream `#FFF7ED`; kartu putih; border neutral; teks utama gelap.
- Plus Jakarta Sans, ikon Lucide, sudut kartu 16px, tombol dengan target sentuh minimal 40–44px.
- Mobile-first; filter dan kartu menumpuk pada layar sempit, tabel monitoring/audit memiliki scroll horizontal.
- Form memakai label, status/error yang diumumkan screen reader, fokus terlihat, dan status tombol pending.
- Rating memakai input radio native agar mendukung Tab dan tombol panah; teks skala tidak bergantung pada warna atau ikon.
- Ikuti preferensi reduced motion yang telah diterapkan stylesheet.
- Phase F Chromium checks pass for 390px/820px/desktop overflow, visible keyboard focus, form labels, guest mobile login, logout name, and USER/Admin journeys. These are smoke checks, not a full accessibility audit.

Manual screen-reader, contrast, and usability review with users remains Pending Validation; browser automation does not replace it.
