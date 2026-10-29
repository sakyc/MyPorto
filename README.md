# RF / Nuansua Portfolio

Portofolio publik dan dashboard berada dalam satu aplikasi **Next.js + React + TypeScript**. API **Express + MySQL** berjalan terpisah. Tampilan, font, CSS, aset, splash, tema, sidebar, dan template proyek berasal dari desain yang disetujui di `prototypes/`.

## Menjalankan di komputer ini

Database `nuansua-api` sudah dibuat, dimigrasikan, dan diisi konten awal. Akun aplikasi database memakai user khusus; akun root lokal tidak diubah. Konfigurasi yang sudah terisi ada di `apps/api/.env` dan `apps/web/.env.local`. Jangan menimpanya dengan contoh env.

```powershell
npm run dev
```

- Portofolio: http://localhost:3000
- Dashboard: http://localhost:3000/admin
- Kesehatan API/database: http://localhost:4000/healthz
- Kredensial pemilik: `.local/OWNER-ACCESS.md`
- QR authenticator: `.local/owner-2fa.png`; secret manual di `.local/owner-access.json`

Tambahkan QR tersebut ke aplikasi authenticator, lalu login dengan password privat dan kode enam digit. Tidak ada password demo atau bypass 2FA. File `.local/` dan env diabaikan Git; jangan unggah folder tersebut.

Kolom login kosong dengan placeholder dan menerima username atau email. Ubah username, email login, dan password melalui **Settings → Account & security → Your sign-in details**. Masukkan password saat ini dan kode authenticator baru untuk menyimpan; password baru boleh dikosongkan untuk mempertahankannya. Perubahan langsung aktif tanpa publish, mengganti token sesi saat ini, serta mengeluarkan sesi lain. Email login terpisah dari email kontak publik. File akses lokal berisi kredensial awal dan tidak diperbarui otomatis saat akun diubah melalui dashboard.

Di bagian yang sama, **Your second step** memilih authenticator atau PIN pribadi enam digit. PIN disimpan sebagai hash Argon2id dan dapat diganti; password tetap wajib pada langkah pertama. Konfirmasi perubahan memakai metode yang saat ini aktif. Saat berpindah dari PIN ke authenticator, masukkan juga kode authenticator baru untuk memastikan aplikasi sudah terhubung. Authenticator adalah faktor kepemilikan; PIN adalah kode tambahan yang tetap sampai diganti.

**Connect your authenticator → Show authenticator QR** menampilkan QR akun yang sudah ada setelah konfirmasi password. QR tidak dikirim pada pemuatan Settings, tidak disimpan di browser, dan disembunyikan setelah dua menit atau saat tab ditinggalkan. Akun yang belum bisa login harus dipulihkan melalui konsol server; fitur ini tidak membuat jalur bypass login. Lihat `deploy/SECURITY-UPDATE.md` sebelum memperbarui produksi.

## Fitur yang tersambung

- Portofolio English default, pilihan Indonesia tersimpan, tema light/dark, splash yang bisa dilewati, animasi dengan dukungan reduced motion, command menu, terminal jawaban preset, detail sertifikat, dan navigasi keyboard.
- Halaman proyek nyata `/projects` dan `/projects/[slug]`, filter melalui `?category=javascript`. Hash section tetap digunakan untuk navigasi dalam homepage.
- Contact mengirim nama, email, telepon opsional, pesan, dan persetujuan ke MySQL. Telepon dinormalisasi; pesan tampil pada Messages, bisa ditandai dibaca, dibalas lewat email/WhatsApp, dan dihapus. Pesan otomatis dihapus setelah 365 hari.
- Login argon2id + TOTP, sesi httpOnly 12 jam, CSRF, rate limit, validasi teks/URL, serta generic login errors. Cookie admin diproksikan lewat origin Next.js agar tetap first-party saat frontend di Vercel dan API di VPS.
- CRUD projects, experience, certificates, stack, assistant; terjemahan Indonesia, urutan, featured, draft/published, upload gambar, profile/contact/settings.
- Autosave draft, review diff per field, publish snapshot immutable, dan cache revalidation. Tombol refresh cache tersedia pada Review & publish. Halaman History dihapus; snapshot dan endpoint restore tetap disimpan pada backend.
- Gambar PNG/JPEG/WebP diverifikasi, dikonversi ke WebP, metadata dihapus, ukuran dibatasi 1600 px dan 5 MB. Media yang masih dirujuk draft/riwayat publikasi tidak bisa dihapus.
- Statistik agregat harian: unique perkiraan, views, halaman, dan host referrer. Tanpa cookie analytics dan tanpa menyimpan IP mentah; hash pengunjung dihapus setelah dua hari. DNT dan bot dihormati.

Konten awal tetap bertanda EXAMPLE, sesuai desain. Ganti contoh proyek/pengalaman/sertifikat, email, sosial, dan screenshot dengan data asli sebelum mengumumkan situs. Tidak ada pengalaman atau hasil kerja yang dibuat-buat.

## Struktur dan desain

```text
apps/web              Next.js → Vercel
apps/api              Express / Drizzle / MySQL → VPS
packages/contracts    Tipe dan validasi Zod bersama
prototypes            Referensi desain asli, tidak ditimpa
scripts               Ekstraksi desain dan pemeriksaan browser
deploy                Nginx, systemd, backup, restore
```

Markup asli diekstrak menjadi pohon React di `apps/web/src/design/`. Template publik yang melakukan escaping dipakai kembali untuk SSR dan interaksi browser agar tampilan konsisten. Dashboard/editor menggunakan state React dan API nyata. Jalankan `python scripts/extract-design.py` hanya ketika sengaja memperbarui sumber desain; CSS tambahan fitur admin berada di `apps/web/public/design/admin-live.css`.

## Setup di lingkungan baru

Gunakan Node 24 LTS, npm dan MySQL 8. Buat database bernama `nuansua-api` dengan charset utf8mb4 dan user aplikasi yang hanya mendapat hak pada database itu. Salin kedua `.env.example`, isi semua secret dengan nilai acak berbeda minimal 32 karakter. `REVALIDATE_SECRET` harus sama di web dan API. `NEXT_PUBLIC_*` terlihat publik; jangan memasukkan rahasia.

```powershell
npm ci
npm run build -w @rf/contracts
npm run db:migrate
npm run db:seed
npm run dev
```

Seed hanya mengisi instalasi kosong dan mempertahankan konten/owner yang sudah ada. `npm run db:generate` menghasilkan migrasi untuk perubahan skema; tinjau SQL sebelum menjalankan `db:migrate`. Jangan menjalankan migrasi produksi memakai root.

Cache npm diarahkan ke `.cache/npm` di drive proyek. Jika drive sistem penuh, arahkan juga TEMP/TMP ke `.cache/tmp` sebelum instalasi atau pemeriksaan browser.

## Pemeriksaan

```powershell
npm run check
npm audit
```

`check` menjalankan lint, typecheck, integration test, dan production build. Integration test memakai database sementara `nuansua-api-test-<pid>` dan menghapusnya setelah selesai; database pemilik tidak disentuh. Secara lokal koneksi admin tes menggunakan root tanpa password sesuai konfigurasi mesin ini. Atur `TEST_MYSQL_URL` di lingkungan lain. Tes memeriksa autentikasi/CSRF/replay/expiry, draft-public isolation, stale diff, publish/rollback, CRUD, gambar palsu dan berukuran besar, inbox, honeypot, throttling, analytics, dan retensi.

Build membutuhkan API dan database yang sehat; build gagal jika publikasi tidak dapat dibaca. Halaman publik sudah di-render dan dicache, sehingga situs yang sudah dibangun tetap dapat melayani publikasi terakhir ketika API sementara mati. Pengiriman pesan dan dashboard memerlukan API online.

Pemeriksaan browser lokal opsional memakai Chrome yang sudah terpasang dan kredensial privat di `.local/owner-access.json`. Jalankan aplikasi terlebih dahulu, lalu:

```powershell
npm install --no-save --prefix .cache/browser-check playwright
node scripts/browser-check.cjs
```

Skrip menguji login nyata, navigasi publik, bahasa, Contact → Messages, dan editor admin. Draft/pesan milik tes dibersihkan setelah selesai; skrip tidak memublikasikan konten. Hasil verifikasi lainnya dicatat di `PROJECT-STATUS.md`.

## Deploy

Ikuti `deploy/README.md`. Konfigurasi Vercel, Nginx, service Linux, backup dan restore sudah disediakan. Domain, akses VPS, dan akun Vercel belum diberikan, sehingga belum ada deployment eksternal. Gunakan secret produksi terpisah dan owner email asli.

Git belum memiliki commit. Source, lockfile, migrasi, dan prototipe siap ditinjau; env, kredensial, database, upload, cache, dan hasil pemeriksaan privat tidak ikut Git.
