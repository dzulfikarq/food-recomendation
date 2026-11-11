# FoodRec Research Collection — Launch Checklist

## Keputusan saat ini

**NO-GO untuk responden sungguhan dan deployment.** Implementasi teknis lulus PostgreSQL `_test`, Chromium desktop/mobile viewport, dan axe scan pada alur terpilih. Checklist operasional di bawah belum disetujui atau diverifikasi pada production. Jangan ubah studi menjadi `OPEN` untuk penelitian nyata sampai semua gate metodologi, consent, kontak, screening, retensi, backup, dan monitoring selesai.

Penelitian memakai ID participant pseudonim, bukan anonim. Relasi akun tetap tersimpan untuk consent dan withdrawal. Aplikasi tidak memverifikasi identitas, usia, kelayakan, atau kebenaran pernyataan “pernah mencoba”. Persetujuan akun bukan persetujuan etik. Minta keputusan pembimbing/otoritas yang relevan; dokumen ini bukan nasihat hukum atau etik.

## Gate sebelum merekrut responden

Catat pemilik, tanggal, dan tautan bukti untuk setiap item. Kotak yang belum dicentang berarti **jangan buka studi**.

| Status | Gate wajib | Bukti / pemilik |
| --- | --- | --- |
| [ ] | Metodologi dan prosedur pengumpulan disetujui pembimbing/otoritas penelitian yang relevan; tentukan apakah persetujuan etik institusi diperlukan dan peroleh sebelum rekrutmen. | |
| [ ] | Naskah consent final disetujui: tujuan, kesukarelaan, data, penggunaan, risiko, retensi, withdrawal, kontak, dan batas salinan eksternal. Simpan versi final yang persis ditampilkan di aplikasi. | |
| [ ] | Nama, email, dan jalur kontak penanggung jawab benar-benar aktif; bukan nilai uji `example.test`. Tunjuk petugas pengganti dan waktu respons. | |
| [ ] | Kriteria inklusi/eksklusi, usia/kelayakan bila relevan, cara screening, serta siapa yang berwenang menilai kelayakan ditetapkan. Screening saat ini **di luar aplikasi**; jangan simpulkan akun USER membuktikan kelayakan. | |
| [ ] | Rencana sampling/rekrutmen, kanal undangan, target dan alasan ukuran sampel, instrumen rating, katalog Food yang digunakan, serta rencana analisis disetujui. | |
| [ ] | Tanggal dan zona waktu mulai/tutup sesuai protokol. Minta Admin kedua memeriksa konfigurasi dan consent sebelum membuka studi. | |
| [ ] | Prosedur withdrawal menentukan kanal permintaan, SLA pemrosesan Admin, penghapusan rating/history, pencatatan export terdampak, pemberitahuan penerima, dan batas kemampuan menarik salinan eksternal. Uji prosedur di staging. | |
| [ ] | `retentionUntil` dan `retentionPolicy` disetujui, termasuk penanggung jawab dan disposal manual atas database, file export, backup, dan salinan penerima. Aplikasi **tidak** menghapus data otomatis saat tanggal retensi. | |
| [ ] | Backup production database **dan** `FOODREC_STORAGE_DIR/research-exports` dienkripsi, akses dibatasi, jadwal/retensi ditetapkan, dan restore production-artifact diuji pada recovery environment terisolasi. Tetapkan rekonsiliasi withdrawal pasca-checkpoint. Prosedur ada di [`RESEARCH_DEPLOYMENT_RUNBOOK.md`](./RESEARCH_DEPLOYMENT_RUNBOOK.md); backup/restore production belum dilakukan. | Operator infra |
| [ ] | Monitoring/alert production untuk error API, kesehatan database, checksum/storage, backup age/restore, serta withdrawal tertunda aktif dan diuji. Tetapkan pemilik on-call. Aplikasi menghasilkan log terstruktur aman; tidak mengirim alert eksternal. | Operator infra |
| [ ] | Admin dan operator memahami bahwa dataset pseudonim, bukan anonim; CSV/manifest dan log tidak boleh dipublikasikan tanpa review disclosure. | |

**Launch gate:** hanya setelah semua kotak lengkap, bukti ditinjau, dan penanggung jawab memberi persetujuan tertulis, Admin boleh membuat studi final lalu membukanya. Studi uji harus tetap `CLOSED`/`ARCHIVED`; gunakan staging untuk simulasi.

## Implementasi dan batas saat ini

- `/research` menampilkan informasi studi dan consent; `/research/rate` hanya menulis ke `ResearchRating` setelah consent versi aktif dan attestation eksplisit.
- Export berisi `user_id` pseudonim (`ResearchParticipant.id`), `food_id`, `rating`; tidak memakai nama/email/User ID. Akses download/manifest Admin-only.
- `Rating` lama, demo/fixture, dataset Altair, worker/job, dan rekomendasi tidak menjadi sumber atau tujuan data penelitian. Rating count/revision aplikasi biasa tetap terisolasi.
- Withdrawal segera mengecualikan participant dari export baru, menandai export lama, memblokir download, dan meminta Admin memproses penghapusan serta revokasi. Aplikasi tidak dapat menghapus salinan yang telah diunduh pihak lain.
- Retensi manual. Tidak ada scheduler penghapusan. Jangan menjalankan SQL untuk memintas guard lifecycle.
- Tidak ada gate software untuk persetujuan etik atau screening responden. `OPEN` merupakan tindakan Admin, bukan bukti kesiapan metodologi.
- Recommendation Engine tetap tidak terhubung. Automatic processing/publication **OFF**, validation status **PENDING_VALIDATION**, worker artifacts **UNVERIFIED**.

## Audit migration

Fitur penelitian memakai migration additive berikut; tidak memodifikasi atau menyalin baris dari `Rating`, revision state, `DatasetExport`, atau tabel Recommendation:

1. `20261113000000_research_data_collection` — enum/model/tabel penelitian dan constraint dasar.
2. `20261114000000_research_consent_version_revocation` — consent version, source rating, dan bukti revocation penelitian.
3. `20261115000000_research_data_retention` — metadata retensi dan guard lifecycle studi.
4. `20261116000000_research_audit_integrity` — consent/withdrawal/export-membership immutability serta deletion/status guards penelitian.

Keempat migration diterapkan pada `foodrec_test` dan `foodrec_e2e_test` oleh integration/E2E runner. Pada perbaikan error sebelumnya, keempatnya juga diterapkan ke database development lokal `localhost:5432/foodrec`; `prisma migrate status` kini up to date pada DB lokal tersebut. **Tidak ada migration production dalam readiness review ini.** Audit SQL tidak menemukan perubahan riset ke tabel `Rating`; perubahan `ALTER TABLE Rating` yang ditemukan berada di migration foundation existing, bukan migration penelitian. Sebelum production, reviewer wajib membaca ulang SQL aktual di `prisma/migrations`, mencocokkan migration history target, dan memastikan backup/restore plan siap.

## Environment audit

Jangan menaruh secret dalam repository, tiket, screenshot, manifest, atau log. Local `.env` diabaikan Git dan nama/bentuk variabel lolos pemeriksaan dasar tanpa membaca/mencatat nilainya. `.env` production tidak diperiksa; production secret, storage ACL, DB grants/network/TLS tetap **unknown** dan belum lulus audit.

| Variable | Production requirement |
| --- | --- |
| `DATABASE_URL` | Secret manager; hanya PostgreSQL production yang disetujui, private network/TLS sesuai platform. Sebelum migration, verifikasi host/database/account dari jalur aman. Jangan arahkan ke `_test`. |
| `AUTH_SECRET` | Secret unik, acak, minimal 32 karakter; bukan contoh atau nilai dev. |
| `AUTH_URL` | Origin aplikasi HTTPS yang benar. Cookie secure/origin checks mengikuti nilai ini. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Pasangan harus konsisten bila dipakai seed; gunakan secret manager dan akun Admin bernama, akses minimum. Jangan pakai kredensial seed/test setelah bootstrap. |
| `FOODREC_STORAGE_DIR` | Absolute path persistent, tidak berada di web root/static hosting, permission terbatas. Backup dan restore harus mencakup `research-exports` bersama metadata DB. App menyimpan CSV plain di filesystem; enkripsi-at-rest harus disediakan storage/platform. |
| `FOODREC_WORKER_SECRET`, `FOODREC_WORKER_API_URL` | Variabel sistem worker existing; rahasiakan. Tidak memberi izin menghubungkan research data ke worker. Automation tetap OFF. |
| `FOODREC_TEST_DATABASE_URL`, `FOODREC_E2E_DATABASE_URL`, `FOODREC_ORIGINAL_DATABASE_URL`, `FOODREC_TEST_RUN`, `FOODREC_TEST_STORAGE_DIR`, `FOODREC_NEXT_DIST_DIR` | Test/runner only. Jangan set atau gunakan sebagai target production. Runner memerlukan database lokal terpisah bernama `_test`. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Konfigurasi Docker/local pada `.env.example`; bukan pengganti secrets deployment terkelola. |

Export research menolak path di bawah `public`, memeriksa real path/symlink, dan mewajibkan absolute `FOODREC_STORAGE_DIR` saat runtime production. POSIX export directory/file dibuat mode `0700`/`0600`; kode tidak mengatur NTFS ACL. Audit lokal menemukan ACL inherited broad pada direktori export E2E Windows (data sintetis saja); jangan gunakan direktori tersebut untuk data responden. Production path, ACL, encryption-at-rest, persistence, dan multi-instance behavior belum diverifikasi. Deployment serverless/local ephemeral tetap **NO-GO** tanpa private persistent/shared storage yang restore-tested.

## Migration, backup, rollback, dan deploy plan

Belum ada production migration atau deployment yang dijalankan. Prosedur siap di [`RESEARCH_DEPLOYMENT_RUNBOOK.md`](./RESEARCH_DEPLOYMENT_RUNBOOK.md); jalankan hanya setelah instruksi dan otorisasi deployment terpisah.

### Sebelum migration

1. Pastikan semua gate responden di atas lengkap dan environment secrets sudah direview dua orang.
2. Verifikasi database target dari secret manager dan jalankan `npx prisma migrate status` terhadap target yang benar. Periksa migration SQL satu per satu; stop jika ada migration pending yang tidak tercantum di release.
3. Ambil backup PostgreSQL konsisten (format custom) dan snapshot/copy aman seluruh `FOODREC_STORAGE_DIR`, termasuk file export. Hentikan sementara write penelitian atau gunakan snapshot koordinasi agar metadata dan file cocok.
4. Enkripsi backup, batasi akses, simpan kunci terpisah, catat checksum/retensi, dan uji restore di environment terisolasi. Jangan pernah restore test dump ke production.
5. Rekam baseline jumlah row `Rating`, revision state, recommendation config/gate, migration history, dan status studi. Jangan tampilkan PII dalam tiket.

### Apply dan smoke test

1. Di staging, deploy kode dan apply versi migration yang sama. Jalankan seluruh smoke test di bawah dengan akun/data fiktif.
2. Pada production hanya setelah approval: jalankan `npx prisma migrate deploy` melalui release job yang memakai target production terverifikasi. **Jangan** gunakan `prisma migrate dev`, `db push`, `migrate reset`, seed demo, atau runner integration/E2E pada production.
3. Jalankan `npx prisma migrate status`; verifikasi empat migration tercatat, tabel/constraint Research ada, tidak ada studi `OPEN`, jumlah/revision `Rating` sama dengan baseline, dan recommendation gates tetap OFF/PENDING_VALIDATION.
4. Smoke production bersifat read-only: Admin login, buka dashboard penelitian dan pastikan tidak ada studi nyata terbuka. Jangan buat consent, rating, export, atau studi smoke di production. Uji seluruh mutasi hanya di staging.

### Backup/rollback

- Jika migration gagal, hentikan release dan diagnosis sebelum retry. Jangan menghapus row `_prisma_migrations`, menjalankan SQL downgrade ad hoc, atau menghapus tabel/trigger penelitian.
- Sebelum ada data responden, rollback kode ke versi lama boleh membiarkan tabel additive tetap ada; fitur FoodRec existing harus tetap jalan. Buat forward fix untuk migration, jangan reset database.
- Setelah ada data responden, **jangan** downgrade/drop tabel atau restore backup lama tanpa prosedur incident dan persetujuan pemilik data. Tutup studi melalui alur Admin, jaga consent/withdrawal/export audit, dan deploy forward fix.
- Restore harus memulihkan database dan private export files dari checkpoint yang cocok. Setelah restore, rekonsiliasi withdrawal/revocation yang terjadi setelah checkpoint sebelum file dapat diunduh kembali; backup lama dapat berisi data yang sudah ditarik.
- Validasi checksum file pulih, storage ACL, akses Admin, `Rating` baseline, dan recommendation gate sebelum membuka read/write kembali.

## Smoke tests staging

- [ ] Admin membuat draft lengkap, teks consent dan kontak terlihat benar; retention date sesudah close date.
- [ ] Admin membuka studi uji hanya di staging; pastikan maksimal satu OPEN.
- [ ] USER baru daftar dari `/research`, kembali ke halaman studi, login lagi dari CTA, lalu memberi consent eksplisit terpisah.
- [ ] Rating 1–5, update tersimpan, rating makanan belum dicoba tidak tersimpan, sesi dapat dilanjutkan dan diselesaikan tanpa minimum.
- [ ] USER lain tidak dapat membaca rating responden pertama; Admin dashboard hanya menunjukkan agregat aktual.
- [ ] CSV hanya berisi header `user_id,food_id,rating`; tidak ada `User.id`, nama, email, atau PII. Hitung ulang SHA-256 byte CSV dan cocokkan manifest/count.
- [ ] Withdrawal mengeluarkan participant dari export berikutnya, menandai export lama `REVOCATION_REQUIRED`, memblokir download lama, dan menyediakan proses Admin untuk deletion/revocation.
- [ ] Ordinary `Rating` count/revision dan Recommendation Engine state sama sebelum/sesudah. Pastikan tidak ada auto-job, Altair import, atau publication.
- [ ] Tutup/arsipkan studi uji. Lakukan smoke desktop dan mobile viewport; manual screen reader, contrast, dan physical-device review tetap diperlukan sebelum rekrutmen.

## Monitoring dan security checks

- Next.js request-error hook dan route export mencatat route template/jenis error atau kode aman; tidak mencatat request URL, headers, error message, consent, rating, identitas, atau CSV. Ini hanya application logs, bukan dashboard/alert.
- `docker-compose.yml` punya PostgreSQL `pg_isready` healthcheck untuk local Compose saja. Konfigurasikan monitoring platform untuk 5xx/latency endpoint `/api/research/*` dan `/api/admin/research/*`, koneksi/migration DB, error read/write/permission/checksum storage, kapasitas disk, backup age/restore status, withdrawal tertunda, dan revocation-required export. Production monitoring belum diuji/aktif.
- `npm audit --omit=dev` bersih. Full `npm audit` melaporkan 7 moderate advisories di dev dependency tree `typescript-eslint`/`minimatch`; perbaikan otomatis yang disarankan memerlukan perubahan major. Tinjau/upgrade terpisah; jangan jalankan `npm audit fix --force` sebagai bagian readiness tanpa review.
- Jangan log request body, consent text, email/nama responden, rating, session cookie, URL kredensial, atau CSV.
- Uji HTTPS, secret rotation/storage, DB least privilege/private network, Admin-only API/download, CSRF/origin, no-store responses, rate limits, storage path/ACL, file checksum, backup encryption, dan akses audit.
- Pastikan private export directory tidak dapat disajikan sebagai static file. Jika platform tidak menyediakan persistent private storage bersama, deployment **NO-GO**.
- Scan dependencies/security policy sesuai proses organisasi. Review manual authorization dan audit event; technical E2E bukan penetration test.
- Python engine, Altair, validation gate, automatic processing/publication tidak termasuk perubahan ini dan harus tetap tak berubah.

## Bukti pemeriksaan terakhir

Review lokal: `npm test` 24/24, `npm run lint`, `npm run typecheck`, `npm run test:integration` 7/7 pada `foodrec_test`, `npm run test:db-restore` membandingkan 25 public tables dan membersihkan dump/scratch DB, `npm run test:e2e` 5/5 Chromium, `npm audit --omit=dev` 0 temuan, dan `git diff --check`. Full `npm audit` masih menemukan 7 moderate pada dev dependency tree (`typescript-eslint`/`minimatch`); remediation major-version belum diterapkan. E2E mencakup axe scan WCAG otomatis pada halaman riset/Admin terpilih, 1440px/390px viewport, dan alur consent/withdrawal/export; bukan audit WCAG penuh. Build E2E dan restore memakai database `_test`; database E2E dipakai tanpa reset dan studi uji ditutup/arsipkan oleh test. Pemeriksaan fisik perangkat dan screen reader/contrast manual, production backup/restore, production secrets/ACL/security, ethics/methodology approval, serta production monitoring/alert **belum dilakukan**. Jangan simpulkan production siap dari bukti lokal.
