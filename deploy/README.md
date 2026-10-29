# Deployment dan operasi

## 1. VPS: MySQL dan API

Gunakan Linux dengan Node 24 LTS, MySQL 8, Nginx, certbot, akun sistem `nuansua`, dan SSH key. Tempatkan checkout di `/srv/nuansua`. MySQL bind ke `127.0.0.1`; port 3306 tidak dibuka ke publik. Buat database `nuansua-api` utf8mb4 dan user aplikasi khusus dengan hak hanya database tersebut. Migrasi memerlukan CREATE/ALTER/INDEX; akun runtime dapat dipisahkan setelah migrasi.

Simpan env privat `/etc/nuansua/api.env` dengan mode 600, owner root. Salin field dari `apps/api/.env.example`, kemudian isi:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
DATABASE_URL=mysql://nuansua_app:URL_ENCODED_PASSWORD@127.0.0.1:3306/nuansua-api
WEB_ORIGIN=https://portfolio.example.com
API_PUBLIC_URL=https://api.example.com
REVALIDATE_URL=https://portfolio.example.com/api/revalidate
UPLOAD_DIR=/var/lib/nuansua/uploads
OWNER_EMAIL=you@example.com
COOKIE_SAME_SITE=lax
TRUST_PROXY=1
```

Isi tiga secret dengan nilai acak minimal 32 karakter. Jangan mengisi `COOKIE_DOMAIN` untuk proxy admin first-party. `SESSION_SECRET` juga mengenkripsi secret TOTP; simpan aman bersama backup konfigurasi. Mengganti secret ini memerlukan enrollment TOTP ulang.

Dari root checkout, jalankan `npm ci`, build contracts, build API. Jalankan migrate/seed dari working directory `apps/api` dengan env di atas dimuat oleh shell aman atau file `.env` privat sementara. Seed menulis enrollment owner ke `.local/`; pindahkan secara privat ke password manager lalu hapus salinan server yang tidak diperlukan. Buat `/var/lib/nuansua/uploads` dengan owner `nuansua`. Pasang `nuansua-api.service` ke `/etc/systemd/system/`, lalu daemon-reload dan enable/start service.

Terbitkan TLS untuk `api.example.com`, sesuaikan `nginx.conf`, jalankan `nginx -t`, lalu reload. Buka firewall hanya SSH/80/443. API tetap bind localhost. Health `GET /healthz` harus mengembalikan `{ok:true,db:true}`.

## 2. Vercel: web dan admin satu aplikasi

Import repo dengan Root Directory **apps/web**. Izinkan file di luar root directory untuk workspace contracts. `apps/web/vercel.json` mengatur install/build; framework Next.js dan output bawaan. Gunakan Node 24.

Set env server:

```dotenv
API_URL=https://api.example.com
SITE_URL=https://portfolio.example.com
REVALIDATE_SECRET=SAME_VALUE_AS_API
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_ADMIN_API_URL=
```

Admin memanggil `/api/admin/*` pada origin web; Next.js memproksikan ke Express. Cookie httpOnly tetap first-party, sehingga tidak bergantung pada third-party cookies Vercel/VPS. API tetap memeriksa Origin dan CSRF. Contact dan analytics langsung memanggil API supaya IP visitor sampai ke Nginx. Jangan isi `NEXT_PUBLIC_ADMIN_API_URL` kecuali sengaja memakai API langsung pada domain satu situs.

API harus sehat ketika build berjalan. Setelah deploy, sesuaikan `WEB_ORIGIN`, `REVALIDATE_URL`, dan `SITE_URL` ke URL produksi tepat, restart API, kemudian publish kecil untuk memeriksa revalidation. Untuk deployment preview, jangan membagikan cookie/secret produksi pada origin preview; gunakan lingkungan uji terpisah.

## 3. Backup dan restore

Buat akun backup terbatas yang dapat SELECT, SHOW VIEW, TRIGGER, EVENT pada database; mysqldump memakai `--no-tablespaces`. Simpan `/etc/nuansua/backup.cnf` berdasarkan contoh dengan mode 600. Backup memuat pesan dan password hashes: batasi akses, gunakan disk/tujuan kedua yang terenkripsi, dan simpan secret enkripsi TOTP di password manager terpisah.

Contoh cron harian (jalankan sebagai akun yang bisa membaca konfigurasi/upload; direktori backup harus ada pada disk atau mount kedua):

```cron
0 3 * * * MYSQL_OPTION_FILE=/etc/nuansua/backup.cnf BACKUP_DIR=/mnt/backups/nuansua UPLOAD_DIR=/var/lib/nuansua/uploads /srv/nuansua/deploy/backup.sh >> /var/log/nuansua-backup.log 2>&1
```

Backup membuat dump konsisten, arsip upload, checksum, dan retensi 14 hari. Pastikan file script executable. Pantau exit code/log backup secara operasional; dashboard tidak mengklaim backup berhasil tanpa pemeriksaan nyata.

Uji restore ke database kosong, misalnya `nuansua-restore-test`, dan folder upload kosong. Gunakan opsi MySQL untuk akun yang berhak pada tujuan, kemudian:

```bash
MYSQL_OPTION_FILE=/etc/nuansua/restore.cnf RESTORE_DATABASE=nuansua-restore-test RESTORE_UPLOAD_DIR=/srv/restore-test/uploads ./deploy/restore.sh /mnt/backups/nuansua/nuansua-YYYYMMDDTHHMMSSZ.tar.gz
```

Untuk restore produksi: hentikan API, buat backup tambahan, gunakan database/folder tujuan kosong, restore, sesuaikan env ke tujuan, jalankan health dan cek publikasi/login/satu gambar sebelum membuka trafik. Jangan mencampur folder upload lama dengan hasil restore. Retensi pesan berjalan harian otomatis selama API hidup; `npm run maintenance -w @rf/api` tersedia untuk eksekusi manual. Backup lama tetap mengandung pesan sampai arsip berumur 14 hari dihapus.

## 4. Pemulihan akses owner

Dari konsol server yang dipercaya dan env API yang benar:

```bash
npm run owner:recover -w @rf/api -- you@example.com /private/new-owner-enrollment
```

Perintah menghasilkan password/secret TOTP baru, menyimpan enrollment privat tanpa menimpa file lama, dan membatalkan semua sesi. Atur `OWNER_EMAIL` ke email yang sama lalu restart API. Tidak ada recovery endpoint publik. Perintah ini sengaja tidak dijalankan terhadap owner lokal yang sudah dibuat.

## 5. Verifikasi setelah deploy

Periksa `/healthz`, halaman homepage dan tiga rute proyek, English/Indonesia, light/dark, login owner+authenticator, perubahan draft yang belum publik, review/publish, pesan Contact di Messages, satu upload WebP, dan restore versi. Cek origin tepat dan HTTPS. Metadata sitemap memakai `SITE_URL`. Konten EXAMPLE dan kontak dummy harus diganti pemilik sebelum peluncuran publik.
