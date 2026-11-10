# FoodRec — Dataset Turunan untuk Pengujian Offline

Sumber: foodrec-ratings-20261024T132014Z-9da9769a.csv
SHA-256 sumber: a2cda622ac8702538c3ba0d9c0ae0ad73be9e88c5d3699e3933cd215c2f23337
Jumlah sumber: 879 baris; 22 pengguna; 40 makanan. Data asli TIDAK dimodifikasi.

## Strategi pengambilan
Random seed Python: 20261025
Dari setiap pengguna dipilih acak 15 rating yang sudah tersedia pada sumber:
- 12 rating per pengguna masuk **train** (264 baris = 22 × 12).
- 3 rating per pengguna masuk **test/holdout** (66 baris = 22 × 3).
- Sisa 549 baris sumber tidak dipakai dalam eksperimen split ini.
- Split tidak mengubah angka rating maupun user_id/food_id.
- Semua 40 makanan muncul pada train, masing-masing sedikitnya 3 rating.
- Train/test tidak mempunyai pasangan pengguna–makanan yang sama.

## Cara memakai file
1. **Offline Top-N:** impor hanya `foodrec_offline_train_264.csv` ke Altair, set role user identification/item identification/label, kemudian jalankan workflow Item Recommendation. Ini menciptakan kandidat yang belum dinilai **menurut TRAIN**, bukan menurut database asli.
2. **Evaluasi prediksi rating (MAE/RMSE):** latih User k-NN Rating Prediction hanya pada TRAIN dan gunakan TEST sebagai query untuk prediksi; bandingkan predicted rating dengan nilai rating TEST. Jangan jalankan Split Data kedua lagi pada TRAIN.
3. **Evaluasi ranking Top-N:** rating TEST bisa digunakan sebagai holdout ground truth. Hasil rekomendasi dibandingkan dengan item relevan pada TEST (misalnya rating >= 4), dengan catatan item yang tidak diamati tidak otomatis dianggap tidak relevan dan beberapa rekomendasi mungkin tidak terdapat di TEST.
4. Jangan mengimpor rekomendasi dari TRAIN ke database aplikasi FoodRec yang masih menyimpan 879 rating asli. Banyak item tersebut sudah dinilai di database sehingga validasi impor atau filter UI dapat menolaknya/menyembunyikannya. Uji impor end-to-end memakai DATABASE TEST TERPISAH dengan akun, makanan, dan rating TRAIN yang ID-nya cocok, atau minta pengguna baru memberi sebagian rating lalu gunakan snapshot mereka.

## Batas interpretasi
Ini adalah **data uji offline turunan dengan rating sengaja disembunyikan untuk simulasi**, bukan kumpulan rating baru dari perilaku pengguna nyata. Sampling hanya membuat matriks masukan lebih jarang; tidak membuktikan dataset menjadi representatif bagi populasi atau perilaku penggunaan sebenarnya. Jika rating sumber adalah dummy, hasilnya tetap studi dengan data dummy. Laporkan proses sampling dan seed dengan jujur dalam skripsi. Jangan menghapus atau mengubah 879 rating sumber di aplikasi untuk keperluan uji ini.
