# MASTER PRODUCT REQUIREMENTS DOCUMENT (PRD) — VERSI 4.0

## LabCheck — Sistem Pencatatan & Rekapitulasi Tugas Praktikum Mobile-First + Sinkronisasi ICLabs

> **Ringkasan:** Penyatuan spesifikasi **LabCheck Mobile-First & Tablet-Optimized (v3.0)** dengan kapabilitas **Sinkronisasi Langsung Data Kelas & Peserta dari API ICLabs** (`rekap-peserta.mjs`), sambil tetap mempertahankan penuh mode **Tambah Kelas Manual**, **Import CSV/Excel**, dan **Kelola Praktikan Satuan**.

| Atribut | Detail |
|---|---|
| **Nama Produk** | **LabCheck** (Mobile-First Lab Assessment PWA + ICLabs Sync) |
| **Versi Dokumen** | 4.0 — Unified Mobile-First & ICLabs Direct Sync Blueprint |
| **Target Perangkat Utama** | Smartphone (`360px–430px`, One-Handed Thumb Operation) & Tablet (`768px–1024px`); tetap responsif penuh di Desktop (`>= 1024px`) |
| **Target Pengguna** | Asisten Laboratorium yang berkeliling meja praktikan (Multi-User Self-Service dengan Isolasi Workspace) |
| **Arsitektur & Runtime** | Cloudflare Pages (React 19 + TypeScript + Vite + Tailwind CSS v4 + PWA) + Cloudflare Pages Functions / Workers (Hono v4) + Turso LibSQL (Drizzle ORM) |
| **Integrasi Eksternal** | API ICLabs (`https://iclabs.fikom.umi.ac.id/api/v1`) — `POST /auth/login`, `GET /praktikum/kelas`, `GET /praktikum/kelas/{id}` (server-side proxy, on-demand tanpa menyimpan kredensial) |
| **Tanggal Penyusunan** | 22 November 2026 |

---

## 1. Visi Produk & Konteks Penggunaan Mobile di Lapangan

### 1.1 Realitas Operasional di Ruang Praktikum
Saat sesi praktikum berlangsung dengan ~50 praktikan, asisten berjalan berkeliling dari satu meja ke meja lainnya sambil memegang smartphone atau tablet untuk memeriksa hasil kerja setiap nomor tugas (4, 6, 8, atau lebih nomor tugas per modul). Di sisi lain, daftar kelas dan peserta praktikum (NIM & Nama) sudah tersedia di portal backend **ICLabs** sehingga input manual atau export-import berulang kali memperlambat persiapan sesi praktikum.

### 1.2 Prinsip Desain LabCheck v4.0
1. **Zero Horizontal Scroll pada Layar Utama Mobile:** Pada layar smartphone (`360px–430px`), daftar praktikan dirender sebagai **Mobile Student Task Cards** dengan grid tombol tugas `T1..Tn` yang terbungkus otomatis (*wrap*) dalam satu layar penuh tanpa geser samping.
2. **Thumb-Zone & Large Touch Targets (Min. `44x44px`):** Seluruh tombol nomor tugas (`T1..Tn`), bilah pencarian cepat, filter status, dan navigasi utama diletakkan di jangkauan ibu jari dengan area sentuh minimal `44x44px` (tombol tugas `48x48px`) dan jarak antar tombol minimal `8px`.
3. **Dual-Mode Onboarding Kelas (ICLabs Sync + Manual):** Asisten dapat menarik langsung seluruh kelas dan daftar NIM + Nama peserta yang diampu dari backend ICLabs dalam hitungan detik, sekaligus tetap leluasa membuat kelas secara manual, mengimpor file `.csv`/`.xlsx`, dan mengelola praktikan satuan.
4. **Progressive Web App (PWA — Installable):** Dilengkapi `manifest.webmanifest`, ikon aplikasi, dan service worker ringan agar bisa di-install ke Home Screen HP/tablet layaknya aplikasi native.
5. **Instant Optimistic Sync + Haptic Feedback + Auto-Retry:** Ketukan tombol tugas mengubah status secara instan (`0ms`), memberi getaran halus (`navigator.vibrate(15)`), memperbarui skor skala 100 seketika, dan otomatis mencoba ulang jika koneksi lab sempat putus.

---

## 2. Arsitektur UI/UX Adaptif (Mobile vs Tablet vs Desktop)

### 2.1 Perilaku Layout Responsif
| Viewport / Perangkat | Tata Letak Board Pencatatan Tugas | Pola Navigasi & Kontrol |
|---|---|---|
| **Mobile (`< 768px`)**<br>Smartphone saat keliling lab | **Stacked Student Cards:** Tiap kartu menampilkan Nama, NIM, badge Nilai (mis. `75`), tombol `Tuntaskan`, dan grid tombol besar `T1..Tn` (4–5 kolom per baris) tanpa geser samping. | Sticky Top Search & Filter Bar + **Bottom Navigation Bar** (`Modul`, `Praktikan`, `Rekap`) di area ibu jari bawah. |
| **Tablet (`768px–1023px`)**<br>Mode berdiri / duduk | **2-Column Card Grid:** Menampilkan 2 kartu praktikan berdampingan dengan tombol sentuh besar. | Top Tab Navigation + Sticky Quick Search. |
| **Desktop (`>= 1024px`)**<br>Laptop saat rekap / import | **Full High-Density Matrix Table:** Baris 50+ praktikan dengan header sticky dan kolom `T1..Tn` sejajar horizontal. | Top Header Navigation + Keyboard Shortcuts (`/` cari, `Esc` reset pencarian). |

### 2.2 Ergonomi Mobile Khusus di Lapangan
- **Anti-Zoom Input iOS/Android:** Seluruh `<input>` dan `<select>` menggunakan font minimal `16px` (`text-base`) agar Safari iOS / Chrome Android tidak melakukan auto-zoom saat mengetik NIM.
- **Safe-Area Inset Support:** Menggunakan `env(safe-area-inset-top)` dan `env(safe-area-inset-bottom)` agar navigasi bawah tidak tertutup gesture bar HP modern.
- **Touch Safety:** Tombol destruktif (hapus kelas, hapus modul, hapus praktikan) selalu ditempatkan di dalam menu aksi terpisah + dialog konfirmasi, tidak pernah bersebelahan dengan tombol ceklis `T1..Tn`.
- **Screen Wake Lock (Opsional):** Tombol aktifkan `navigator.wakeLock.request('screen')` di layar Board Checklist agar layar HP tidak cepat mati saat berkeliling memeriksa praktikan.

---

## 3. Arsitektur Sistem & Tech Stack

| Komponen | Teknologi | Standar Implementasi |
|---|---|---|
| **Frontend & PWA** | React 19 + TypeScript + Vite + Tailwind CSS v4 | Mobile-first utility classes, Web App Manifest + Service Worker ringan. |
| **Backend API** | Hono v4 (Cloudflare Pages Functions / Workers) | Latensi rendah di edge, validasi payload ketat dengan `@hono/zod-validator` & `zod`, server-side proxy ke API ICLabs (bebas CORS). |
| **Database & ORM** | Turso LibSQL (`@libsql/client/web`) + Drizzle ORM | SQLite edge 3NF dengan *sparse storage* untuk `task_completions`. Mendukung lokal `file:./local.db` saat development. |
| **Autentikasi** | Email & Password + Web Crypto PBKDF2 + HttpOnly JWT | PBKDF2-SHA256 (16-byte salt acak, 100.000 iterasi) + JWT HS256 via Web Crypto pada cookie `HttpOnly; SameSite=Lax`. |
| **Sinkronisasi ICLabs** | Server-side `fetch` ke `ICLABS_BASE_URL` | Mengambil kelas & peserta secara on-demand via Hono Worker dengan retry otomatis untuk HTTP `429`. **Kredensial ICLabs tidak disimpan permanen di database.** |
| **Import / Export** | SheetJS (`xlsx`) client-side | Import CSV (delimiter `;` atau `,`) & Excel `.xlsx`, export rekap per modul & kelas ke `.xlsx` / `.csv`. |
| **Cetak PDF** | CSS `@media print` (A4 Portrait/Landscape) | Layout laporan A4 bersih dengan kop kelas/modul, nama asisten, tanggal cetak, tanpa tombol navigasi. |

---

## 4. Spesifikasi Fungsional & Aturan Bisnis

### 4.1 Autentikasi Mandiri (Multi-User Asisten)
- **FR-AUTH-01:** Registrasi menggunakan Nama Lengkap, Email (unik, lowercase), dan Password (min. 6 karakter), dilanjutkan auto-login dengan cookie `HttpOnly`.
- **FR-AUTH-02:** Password di-hash menggunakan Web Crypto API `PBKDF2-SHA256` (16-byte salt, 100.000 iterasi). Seluruh endpoint memvalidasi kepemilikan `userId` sehingga data antar asisten terisolasi penuh.

### 4.2 Manajemen Kelas, Sinkronisasi ICLabs & Praktikan
- **FR-CLS-01 (Tambah Kelas Manual — Wajib Judul):** Asisten dapat membuat kelas manual dengan wajib mengisi Judul Kelas (opsional Deskripsi) sebelum menambah praktikan/modul.
- **FR-CLS-02 (Multi-Kelas & Modul Independen):** Satu asisten dapat mengelola banyak kelas (baik manual maupun hasil sync ICLabs) dengan daftar praktikan dan modul yang independen.
- **FR-CLS-03 (Sync Langsung dari Backend ICLabs — Fitur Gabungan `rekap-peserta.mjs`):**
  1. Asisten membuka dialog **"Sync dari ICLabs"**, memasukkan `identitas` (email/username ICLabs), `password`, dan opsional `id_periode_akademik` (kosong = periode akademik aktif).
  2. Server Hono melakukan `POST /auth/login` lalu mengambil semua halaman `GET /praktikum/kelas?per_page=100&page=N` (dengan retry otomatis saat HTTP `429`).
  3. Aplikasi menampilkan **Preview Daftar Kelas** yang diampu asisten (kode MK, nama MK, kelompok, dan status apakah kelas sudah ada di LabCheck).
  4. Asisten memilih kelas yang diinginkan dan menekan **Sinkronkan**. Server menarik `GET /praktikum/kelas/{id}` (`data.peserta[]`) untuk setiap kelas terpilih.
  5. Kelas di-upsert berdasarkan `(userId, externalClassId)` dan peserta (`nim`, `nama`, `status`) di-upsert berdasarkan `(classId, nim)` **tanpa menghapus progres ceklis `task_completions` yang sudah ada**.
  6. Kredensial ICLabs **tidak pernah disimpan ke database**; hanya dipakai saat proses sync berlangsung.
- **FR-CLS-04 (Import CSV / Excel `.xlsx`):** Mendukung file `.csv` (termasuk format delimiter `;` dengan BOM UTF-8 dari `rekap-peserta.mjs` maupun delimiter `,`) dan `.xlsx`/`.xls` berisi kolom `nim` & `nama`/`name`. Menampilkan preview, deteksi NIM ganda, lalu batch upsert aman.
- **FR-CLS-05 (Kelola Praktikan Satuan):** Tambah 1 praktikan susulan, edit NIM/Nama/Status, dan hapus praktikan melalui modal ramah sentuhan.

### 4.3 Manajemen Modul & Kalkulasi Bobot Nilai Otomatis (Skala 100 — Pembulatan Ke Atas / Tanpa Desimal)
- **FR-MOD-01:** Tambah modul per kelas dengan Nama Modul dan Jumlah Tugas (`1–30`).
- **FR-MOD-02 (Formula Deterministik Skala 100 — Bilangan Bulat Pembulatan Ke Atas):**
  - Seluruh nilai menggunakan **pembulatan ke atas (`Math.ceil`)** ke bilangan bulat (`0–100`) tanpa angka desimal.
  - `Bobot per Tugas = ceil(100 / Jumlah_Tugas)` (contoh: 4 tugas → `@25`, 6 tugas → `@17`, 8 tugas → `@13`).
  - `Nilai Modul Praktikan = min(100, ceil((Jumlah_Tugas_Selesai * 100) / Jumlah_Tugas))` (contoh pada 6 tugas: 1 selesai → `17`, 4 selesai → `67`, 6 selesai → `100`).
  - `Nilai Akhir Rekap Kelas = min(100, ceil((Total Nilai Semua Modul) / (Jumlah Modul)))`.
- **FR-MOD-03 (Edit Jumlah Tugas Aman):** Jika jumlah tugas diperkecil setelah ada progres, sistem menampilkan dialog konfirmasi dan otomatis menghapus `task_completions` dengan `taskNumber > taskCount baru`.

### 4.4 Board Pencatatan Tugas Mobile-First
- **FR-BRD-01:** Toggle biner 1 ketukan (`Belum <-> Selesai`) secara instan (optimistic update), warna hijau emerald + centang, dan getaran haptic ringan (`navigator.vibrate(15)`).
- **FR-BRD-02:** Endpoint idempotent `POST /api/modules/:id/toggle` dengan payload eksplisit `{ studentId, taskNumber, completed: boolean }` + auto-retry otomatis jika jaringan terputus.
- **FR-BRD-03:** Sticky search bar NIM/Nama (`16px`, tombol clear besar) + filter pill `Semua`, `Belum Tuntas`, dan `Tuntas 100%`.
- **FR-BRD-04:** Tombol 1-tap `Tuntaskan` (atau `Reset` bila sudah 100%) pada setiap praktikan.

### 4.5 Rekapitulasi, Export XLSX/CSV & Cetak PDF
- **FR-RCP-01 (Rekap Per Modul):** Ringkasan rata-rata nilai, jumlah tuntas 100%, persentase penyelesaian per nomor tugas `T1..Tn`, dan daftar nilai seluruh praktikan.
- **FR-RCP-02 (Rekap Per Kelas — Lintas Modul):** Nilai tiap modul dan Nilai Akhir Rata-Rata per praktikan.
- **FR-RCP-03 (Export Excel `.xlsx` & CSV):** Download langsung di browser untuk rekap per modul maupun rekap lintas modul kelas.
- **FR-RCP-04 (Cetak / Simpan PDF):** Stylesheet `@media print` A4 bersih siap cetak/simpan PDF.

---

## 5. Desain Database (Drizzle ORM — Turso SQLite 3NF)

```ts
// Ringkasan 5 tabel utama di server/db/schema.ts
// 1. users: id, name, email (unique), passwordHash, createdAt
// 2. classes: id, userId (FK), title, description, source ('manual' | 'iclabs'),
//             externalClassId, courseCode, groupName, lastSyncedAt, createdAt
// 3. students: id, classId (FK), nim, name, status, createdAt  [unique (classId, nim)]
// 4. modules: id, classId (FK), title, taskCount, orderIndex, createdAt
// 5. taskCompletions: id, moduleId (FK), studentId (FK), taskNumber, completedAt
//                     [unique (moduleId, studentId, taskNumber)]
```

---

## 6. Kontrak REST API (Hono v4)

| Method | Endpoint | Payload | Fungsi & Otorisasi |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{ name, email, password }` | Registrasi asisten, hash PBKDF2, set cookie JWT. |
| `POST` | `/api/auth/login` | `{ email, password }` | Login & set cookie JWT `HttpOnly`. |
| `POST` | `/api/auth/logout` | — | Hapus cookie sesi. |
| `GET` | `/api/auth/me` | — | Profil asisten aktif. |
| `GET` | `/api/classes` | — | Daftar kelas milik user + jumlah praktikan & modul. |
| `POST` | `/api/classes` | `{ title, description? }` | Buat kelas manual baru (wajib `title`). |
| `GET` | `/api/classes/:id` | — | Detail kelas + daftar modul. |
| `PATCH / DELETE` | `/api/classes/:id` | `{ title?, description? }` | Update / hapus kelas (owner-checked). |
| `POST` | `/api/iclabs/preview` | `{ identitas, password, periode? }` | Login on-demand ke ICLabs & ambil daftar kelas yang diampu (tanpa simpan password). |
| `POST` | `/api/iclabs/sync` | `{ iclabsToken?, identitas?, password?, periode?, classes: [...] }` | Tarik peserta kelas terpilih dari ICLabs & upsert aman kelas + praktikan ke DB LabCheck. |
| `GET` | `/api/classes/:id/students` | — | Daftar praktikan urut NIM ascending. |
| `POST` | `/api/classes/:id/students` | `{ nim, name, status? }` | Tambah 1 praktikan. |
| `POST` | `/api/classes/:id/students/import` | `{ students: [{ nim, name, status? }] }` | Batch upsert praktikan dari CSV/Excel. |
| `PATCH / DELETE` | `/api/students/:id` | `{ nim?, name?, status? }` | Edit / hapus praktikan satuan. |
| `GET` | `/api/classes/:id/modules` | — | Daftar modul dalam kelas + ringkasan progres. |
| `POST` | `/api/classes/:id/modules` | `{ title, taskCount }` | Buat modul baru (`1..30` tugas). |
| `PATCH / DELETE` | `/api/modules/:id` | `{ title?, taskCount? }` | Edit modul (otomatis pangkas completions `> taskCount`) / hapus modul. |
| `GET` | `/api/modules/:id/board` | — | Metadata modul, praktikan, dan completions untuk Board Checklist. |
| `POST` | `/api/modules/:id/toggle` | `{ studentId, taskNumber, completed }` | Idempotent upsert/delete status 1 nomor tugas. |
| `POST` | `/api/modules/:id/complete-all` | `{ studentId, completed }` | Tuntaskan / reset seluruh tugas 1 praktikan pada modul. |
| `GET` | `/api/modules/:id/recap` | — | Rekap nilai & statistik per soal `T1..Tn` untuk 1 modul. |
| `GET` | `/api/classes/:id/recap` | — | Rekap nilai lintas seluruh modul + nilai akhir rata-rata kelas. |

---

## 7. Acceptance Criteria
- **AC-01 (Mobile Ergonomics):** Di viewport `375x812`, Board Checklist tanpa horizontal overflow, tombol `T1..Tn` minimal `44x44px`, dan input pencarian minimal `16px` (anti auto-zoom).
- **AC-02 (Dual-Mode Kelas — ICLabs Sync & Manual):** Asisten dapat menarik kelas & praktikan langsung dari backend ICLabs (dengan re-sync aman tanpa hapus progres) sekaligus tetap bisa membuat kelas manual dan import CSV/Excel.
- **AC-03 (Bobot Otomatis Skala 100 — Bulat Ke Atas):** 4 tugas → `@25`, 6 tugas → `@17`, 8 tugas → `@13`; seluruh nilai modul dan rata-rata rekap kelas berupa bilangan bulat (`Math.ceil`) tanpa desimal.
- **AC-04 (One-Tap Sync):** Ketukan tugas langsung tersinkronisasi idempotent dan bertahan setelah refresh.
- **AC-05 (Rekap, Export & PDF):** Rekap per modul & kelas rapi di mobile/desktop, dapat diekspor `.xlsx`/`.csv`, dan dicetak ke PDF A4 bersih.
