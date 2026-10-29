# RF — revisi prototipe

Revisi desain HTML untuk diskusi sebelum implementasi aplikasi. File asli di Downloads tidak diubah.

## Navigasi publik

- Top bar hero (RF., independent portfolio, Let's talk) dihapus. Brand RF. tetap di sidebar.
- Bahasa dan akses dashboard ditempatkan di area utilitas sidebar.
- Bahasa menggunakan ID / EN dengan penanda bahasa aktif. Default Inggris; pilihan ID/EN disimpan di browser dan tetap dihormati pada kunjungan berikutnya.
- Akses pemilik menggunakan ikon gembok, bidang aksen kuning tipis, dan label ketika sidebar terbuka. Tautannya membuka login dashboard.
- Mobile memakai dua baris bawah: utilitas, lalu navigasi section yang bisa digulir. Bahasa dan akses pemilik selalu terlihat. Arsip/detail tetap menyediakan baris utilitas.
- Perubahan bahasa mencakup isi, teks bantuan, dialog, judul halaman, dan label aksesibilitas. Nama proyek, teknologi, perintah terminal, dan URL dipertahankan.

## Gerak dan tema dashboard

- Splash dibuat minimal dan personal: sapaan “Hey, I’m Rifki.” / “Glad you’re here.”, tipografi terpusat, aksen bintang kecil, dan transisi naik yang halus. Dashboard menyapa “Hey, Rifki.” / “Welcome back.”. Bahasa publik mengikuti ID/EN.
- Intro singkat tanpa angka, progress bar, atau label teknis. Tersedia Skip dan Escape; reduced motion melewati intro.
- Pergantian tema memakai circular reveal dari tombol, selaras dengan portofolio. Tema disimpan dengan preferensi yang sama pada origin yang sama.
- Login, perpindahan view, dialog, dan grafik memakai animasi masuk yang ringan.
- Reduced motion meniadakan splash dan animasi. Fokus keyboard dikembalikan setelah intro.
- Halaman login dan dashboard menyediakan tautan kembali ke portofolio.

## Eksplorasi proyek pertama

- Kartu Task Manager App dan halaman detailnya memakai desain baru. Proyek lain serta arsip tetap memakai versi sebelumnya agar perubahan dapat dibandingkan.
- Visual tanpa screenshot menampilkan nomor proyek dan label placeholder yang jelas. Tidak ada UI produk, metrik, atau hasil yang direkayasa.
- Halaman detail memakai urutan masalah, kontribusi, tantangan, dan hasil, dengan navigasi bab serta tautan proyek berikutnya.
- Checkpoint sebelum perubahan: `checkpoints/before-projects-redesign/portfolio.html`. File pendukung disalin bersama manifest SHA-256 untuk rollback.

## Batas prototipe

Login masih simulasi dari desain awal: isi password apa saja, lalu kode `123456`. Publish, statistik, pesan, dan editor masih data demo; bukan backend produksi. Dashboard masih berbahasa Inggris; permintaan ID/EN diterapkan pada portofolio publik.

Katalog `locale-id.js` dan adapter DOM mempertahankan perilaku prototipe HTML awal. Pada aplikasi produksi, gunakan konten EN/ID terstruktur per field, route locale yang dapat diindeks, metadata/hreflang, dan status kelengkapan terjemahan di admin. Bahasa bukan sekadar mengganti label navigasi.

## Membuka pratinjau

Jalankan `python -m http.server 4173 --bind 127.0.0.1` dari folder ini, kemudian buka `http://127.0.0.1:4173/portfolio.html`.

HTML juga dapat dibuka langsung; server lokal lebih konsisten untuk preferensi lintas halaman. Seluruh file CSS/JS di folder ini perlu tetap bersebelahan dengan HTML.
