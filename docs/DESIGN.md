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

Beranda menampilkan sapaan, jumlah rating tersimpan, langkah berikutnya, tautan katalog/rating, status rekomendasi, dan tanggal publikasi jika tersedia. Jumlah rating tidak menjadi ambang dan bukan jaminan hasil.

### ADMIN

Dashboard → siapkan snapshot → proses manual di Altair → impor dan validasi CSV → tinjau preview/warning → konfirmasi publikasi → tinjau riwayat.

FoodRec tidak menghitung UBCF/Cosine Similarity, tidak terhubung otomatis ke Altair, dan tidak mengubah batch saat rating disimpan.

## Halaman

| Halaman | Tujuan dan perilaku |
| --- | --- |
| `/` untuk Guest | Jelaskan katalog, rating, dan penerbitan hasil; CTA daftar/masuk dan jelajah makanan. |
| `/` untuk USER | Dashboard personal berbasis rating dan status database. Tawarkan tindakan eksplorasi tanpa target rating wajib. |
| `/foods` | Cari nama/kode, filter kategori, urutkan, dan paginasi. USER dapat memilih semua, belum dinilai, atau sudah dinilai. Progres menghitung rating pada makanan aktif sebagai ringkasan, bukan target. Filter tanpa hasil menjelaskan cara mengubah pencarian. |
| `/foods/[id]` | Foto/placeholder, nama, kategori, deskripsi, asal/rasa, serta kontrol rating. |
| `/my-ratings` | Ringkasan jumlah dan rata-rata rating, navigasi kembali ke katalog, serta riwayat akun aktif. Rating makanan aktif dapat diubah; makanan nonaktif tetap terlihat sebagai riwayat. |
| `/recommendations` | Judul “Rekomendasi Untukmu”, penjelasan pola rating, tanggal pembaruan, kartu berperingkat dan tautan detail. Empty state dibedakan berdasarkan status backend. |
| `/admin` | Statistik aktual: makanan aktif, pengguna pemberi rating, total rating, jumlah snapshot, batch aktif, dan waktu publikasi terakhir. CTA berikutnya mengikuti kondisi data. |
| `/admin/foods` | Katalog dengan pencarian/filter server-side, pagination, status, CRUD, dan empty state berbeda untuk katalog kosong vs filter tanpa hasil. |
| `/admin/ratings` | Jumlah rating, pembuatan snapshot, pencarian ID/nama file, riwayat snapshot berpaginasi, checksum, unduhan terproteksi, loading dan empty state. |
| `/admin/recommendations` | Empat tahap terpandu dan status stepper berbasis snapshot/batch. Dataset, panduan Altair, impor, validasi, dan konfirmasi publikasi tampil berurutan; filter/pencarian riwayat ada di detail audit. |

## Status rekomendasi USER

Semantics status backend tidak berubah.

| Status | Penjelasan | Tindakan yang tersedia |
| --- | --- | --- |
| `NO_RATINGS` | Belum ada rating pada akun. | Jelajahi dan nilai makanan yang dikenal. |
| `NO_BATCH` | Rating ada, tetapi belum ada batch yang diterbitkan. | Lihat rating atau lanjut jelajah; tidak ada janji kapan hasil terbit. |
| `NOT_INCLUDED` | Akun tidak tercantum pada batch aktif. | Jelajahi katalog atau tinjau rating; hasil baru perlu batch diterbitkan admin. |
| `ALL_RATED` | Semua rekomendasi aktif sudah dinilai. | Lihat Rating Saya atau jelajahi katalog. |
| `NO_AVAILABLE_FOODS` | Tidak ada kandidat aktif yang dapat ditampilkan. | Jelajahi katalog aktif atau lihat rating. |
| `READY` | Ada rekomendasi aktif yang belum dinilai. | Buka detail makanan dan beri rating bila dikenal. |

## Tahap workflow ADMIN

1. **Siapkan Dataset** — lihat pengguna pemberi rating, makanan aktif, jumlah rating/snapshot, buat snapshot, pilih snapshot tersimpan, dan unduh CSV privat. Peringatan cakupan tinggi memakai heuristik 90% yang dijelaskan pada UI; snapshot/audit tidak ditimpa.
2. **Proses di Altair** — ikuti langkah impor, UBCF, Cosine Similarity, dan user k-NN secara manual. Penjelasan pemula dan kontrak CSV ada di bagian teknis; k/Top-N harus dicatat sesuai eksperimen. FoodRec tidak membuat integrasi Altair.
3. **Impor dan Validasi** — pilih dataset sumber, pilih file CSV, lihat nama/ukuran, isi parameter tanpa default penelitian, lalu tinjau jumlah valid/invalid, peringatan stale, error, dan preview user/makanan.
4. **Tinjau dan Publikasikan** — periksa dataset, waktu impor FoodRec, parameter, warning, dan hasil. Batch kosong/invalid tidak bisa diterbitkan; server melakukan validasi ulang dan publikasi atomik. Riwayat punya filter status, pencarian batch/nama file, pagination, checksum, admin, waktu, dan detail.

Stepper menunjukkan tahap saat ini/selesai berdasarkan snapshot dan batch tersimpan. Navigasi tahap memakai anchor pada halaman yang sama; refresh membangun ulang status dari database, sedangkan unggahan file tetap pada kontrol browser sampai dikirim.

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
- `FoodGridSkeleton` — state loading katalog dan riwayat rating.

## Sistem visual dan aksesibilitas

- Primary `#F97316`; hover `#EA580C`; latar cream `#FFF7ED`; kartu putih; border neutral; teks utama gelap.
- Plus Jakarta Sans, ikon Lucide, sudut kartu 16px, tombol dengan target sentuh minimal 40–44px.
- Mobile-first; filter dan kartu menumpuk pada layar sempit, tabel audit memiliki scroll horizontal.
- Form memakai label, status/error yang diumumkan screen reader, fokus terlihat, dan status tombol pending.
- Rating memakai input radio native agar mendukung Tab dan tombol panah; teks skala tidak bergantung pada warna atau ikon.
- Ikuti preferensi reduced motion yang telah diterapkan stylesheet.

Review manual desktop/mobile, keyboard, screen reader, kontras akhir, dan usability dengan pengguna awam tetap perlu dilakukan sebelum menyatakan UX lulus.
