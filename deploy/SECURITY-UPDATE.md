# Update pilihan authenticator/PIN

Implementasi mencakup Express, contracts, UI Next.js, dan migrasi `0003_smart_whiplash.sql`. Akun lama tetap memakai authenticator secara default. Migrasi hanya menambah `users.verification_method` dan `users.pin_hash`; tidak merotasi password atau secret TOTP.

## Urutan produksi

Frontend tetap mengikuti push GitHub ke Vercel. Backend diperbarui manual melalui SCP sesuai pilihan pemilik. Jangan deploy frontend ini lebih dahulu: backend lama belum menerima field pengaturan baru.

1. Buat backup database, konfigurasi privat, dan uploads sebelum migrasi. Pertahankan `SESSION_SECRET` karena mengenkripsi secret authenticator.
2. Upload source backend beserta contracts dan manifest workspace ke lokasi staging. Jangan kirim `.env`, `.local`, `node_modules`, database, atau uploads lokal. Lokasi aktif VPS adalah `/srv/nuansua-api`; runtime Node `/opt/nuansua-api/node/bin`; konfigurasi `/etc/nuansua-api/api.env`; service `nuansua-api`; container MySQL `nuansua-api-db`.
3. Install dependencies dan build contracts/API di staging. Setelah build sukses, lakukan pergantian source pada jendela pemeliharaan singkat dan jalankan `db:migrate` dengan environment produksi yang dimuat melalui `EnvironmentFile` systemd. Jangan menjalankan seed atau owner recovery saat update biasa.
4. Restart service yang sama. Cek health internal dan `https://api.nuansua.xyz/healthz`; keduanya harus memberikan `ok:true, db:true`.
5. Push frontend ke `main`, tunggu Vercel Ready. Uji login authenticator, QR dengan konfirmasi password, lalu perubahan metode jika memang diinginkan pemilik. Panggilan QR adalah POST `/api/admin/authenticator/qr`, membutuhkan sesi owner, CSRF, dan password saat ini; respons tidak boleh dicache.

Rollback aplikasi dapat memakai source/build sebelumnya sambil mempertahankan kolom migrasi tambahan. Jika sudah mengaktifkan PIN, jangan rollback ke backend yang hanya memahami TOTP sebelum mengembalikan metode ke authenticator dan memastikan kodenya bekerja.

## Verifikasi lokal

`npm test` menggunakan database sementara dan menguji CSRF, pembatasan percobaan, penolakan replay TOTP, hashing dan penggantian PIN, single-use challenge, revokasi sesi, konfirmasi authenticator sebelum perpindahan kembali, serta proteksi endpoint QR. Tidak mengubah akun lokal atau produksi.

`node scripts/security-ui-check.cjs` memakai fixture akun dan endpoint mock untuk memeriksa UI PIN/QR, konfirmasi PIN, pengosongan input rahasia, dan tampilan mobile. Instalasi Playwright opsional sama seperti `scripts/browser-check.cjs`. Screenshot hanya disimpan pada `.local/` yang diabaikan Git.
