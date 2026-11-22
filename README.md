# LabCheck — Pencatatan & Rekapitulasi Tugas Praktikum Mobile-First + ICLabs Sync

Aplikasi web **PWA Mobile-First & Tablet-Optimized** untuk asisten laboratorium mencatat progres tugas praktikum (`T1..Tn`) saat berkeliling ruangan, dengan **sinkronisasi langsung daftar kelas & peserta (NIM + Nama) dari backend ICLabs**, serta tetap mendukung penuh **pembuatan kelas manual** dan **import CSV/Excel**.

Lihat spesifikasi lengkap pada [PRD_LabCheck_v4.md](./PRD_LabCheck_v4.md).

## Fitur Utama

- **Dual-Mode Onboarding Kelas:**
  - **Sync Langsung dari ICLabs:** Login on-demand ke API ICLabs (`POST /auth/login`, `GET /praktikum/kelas`, `GET /praktikum/kelas/{id}`) via server Hono (bebas CORS, kredensial tidak disimpan di DB), pilih kelas yang diampu, dan upsert peserta tanpa menghapus progres nilai yang sudah ada.
  - **Mode Manual & Import File:** Buat kelas manual (wajib judul), impor praktikan dari `.csv` (`;` atau `,`) / `.xlsx` (kompatibel dengan output `rekap-peserta.mjs`), dan kelola praktikan satuan.
- **Board Checklist Mobile-First:**
  - Mobile (`< 768px`): Stacked Student Cards tanpa horizontal scroll, tombol sentuh besar `T1..Tn` (`>= 48x48px`), haptic feedback, sticky search bar (font `16px` anti auto-zoom), filter pill (`Semua`, `Belum Tuntas`, `Tuntas 100%`), tombol `Tuntaskan`, dan toggle **Screen Wake Lock**.
  - Tablet (`768px–1023px`): 2-Column Card Grid.
  - Desktop (`>= 1024px`): High-Density Matrix Table + shortcut `/` (cari) & `Esc` (reset).
- **Bobot Otomatis Skala 100:** Setiap modul (`1–30` tugas) otomatis menghitung `100 / Jumlah_Tugas` per soal, dan rekap kelas menghitung rata-rata lintas modul.
- **Rekap, Export & Cetak PDF:** Rekap per modul (dengan statistik penyelesaian per soal `T1..Tn`) & rekap lintas modul kelas, export `.xlsx`/`.csv`, dan cetak/simpan PDF A4 bersih (`@media print`).
- **CLI Exporter (`rekap-peserta.mjs`):** Tetap tersedia lewat `npm run rekap:cli` bila ingin mengekspor CSV langsung dari terminal.

## Menjalankan Secara Lokal

1. Instal dependensi:
   ```bash
   npm install
   ```
2. Salin `.env.example` ke `.env` (opsional — jika `TURSO_DATABASE_URL` belum diisi, otomatis memakai SQLite lokal `file:./local.db`):
   ```bash
   cp .env.example .env
   ```
3. Jalankan backend Hono + frontend Vite bersamaan:
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:5173`
   - API Hono: `http://localhost:8787`

## Database Turso & Deploy Cloudflare Pages

1. Set environment variables / secrets (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `ICLABS_BASE_URL`).
2. Push skema Drizzle ke Turso:
   ```bash
   npm run db:push
   ```
3. Build produksi:
   ```bash
   npm run build
   ```
4. Deploy folder `dist/` + `functions/api/[[route]].ts` ke Cloudflare Pages (`wrangler pages deploy dist`).

## Pengujian

```bash
npm test
```
