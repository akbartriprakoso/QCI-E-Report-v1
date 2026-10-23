# QCI E-Report — Akbar Version v1.0

E-Report operasional untuk QCI Krian yang dibangun ulang berdasarkan alur data nyata dari Portal QC lama.

## Tujuan

- Menggantikan halaman E-Report lama dengan UI yang lebih terstruktur.
- Mempertahankan sumber data production yang sudah berjalan.
- Menambahkan traceability: setiap report menampilkan asal sumber data.
- Menjadikan `ID_LAP` sebagai kunci integrasi utama.
- Membaca database sumber secara langsung melalui service account read-only.

## Report v1

1. Corn Q1ST — DATAQC + BulkSampler20
2. RM Local Q1ST — DATAQC
3. Moisture Analysis / PRG — BulkSampler20
4. Kett / Dryer — DATAPRODUKSI
5. Videometer — DATAQC + BulkSampler20
6. Source Monitor — status adapter dan tes koneksi

## Cara Menjalankan — Production/LAN Direct Database Mode

Persyaratan: Node.js 18+ (direkomendasikan Node.js 22).

Windows untuk menjalankan manual:

```bat
START_WINDOWS.bat
```

Script tersebut menjalankan server LAN pada port `8090`. Buka dari PC yang sama melalui:

`http://127.0.0.1:8090`

Dari laptop atau HP pada jaringan kantor, gunakan alamat IPv4 PC server:

`http://IP_PC_KANTOR:8090`

Saat server berjalan, alamat LAN yang terdeteksi akan ditampilkan di jendela command prompt. `START_E_REPORT_LOCAL.bat` hanya membuka akses lokal pada PC server, sedangkan `START_E_REPORT_LAN.bat` membuka akses dari jaringan kantor.

E-Report dapat dijalankan pada PC yang sama dengan `QCI_PM_Local_v1_3`: QCI PM memakai port `8787`, sementara E-Report memakai port `8090`.

Default mode adalah `database`. E-Report membuat koneksi read-only langsung ke `DATAQC`, dua sumber `BulkSampler20`, dan `DATAPRODUKSI`; backend Portal QC lama tidak diperlukan.

Sebelum menjalankan aplikasi, salin `.env.example` menjadi `.env`, lalu isi `DB_USER` dan `DB_PASSWORD` dengan service account SQL Server yang hanya memiliki izin `SELECT`. Jika tiap database memakai credential berbeda, isi variabel `*_DB_USER` dan `*_DB_PASSWORD` per sumber.

## Menjalankan otomatis saat Windows mulai

Untuk menjadikan PC kantor sebagai server LAN seperti QCI PM v1.3, klik dua kali `install_e_report_startup.bat`. Script akan meminta hak Administrator, mendaftarkan E-Report sebagai Scheduled Task, membuka TCP port `8090` hanya untuk `LocalSubnet`, lalu menjalankan server.

Untuk melepas startup otomatis dan rule firewall, jalankan `stop_e_report.bat` sebagai Administrator.

## Cara Menjalankan — Database Produksi

```bat
START_E_REPORT_LAN.bat
```

Launcher Windows lama berikut juga sekarang menggunakan database produksi:

```bat
START_DEMO_WINDOWS.bat
```

Pastikan PC terhubung ke jaringan plant dan konfigurasi akun database pada `.env` sudah tersedia.

## Konfigurasi .env

Copy `.env.example` menjadi `.env` jika ingin mengubah konfigurasi tanpa mengedit source code.

```env
PORT=8090
SERVER_HOST=0.0.0.0
DATA_MODE=database
DB_USER=qci_ereport_ro
DB_PASSWORD=change-me
DATAQC_DB_SERVER=10.13.5.193
DATAQC_DB_DATABASE=DATAQC
BULK_S3_DB_SERVER=10.13.10.167
BULK_S3_DB_DATABASE=BulkSampler20
BULK_LOCAL_DB_SERVER=10.13.5.193
BULK_LOCAL_DB_DATABASE=BulkSampler20
PRODUCTION_DB_SERVER=10.13.5.193
PRODUCTION_DB_DATABASE=DATAPRODUKSI
REPORT_CACHE_TTL_MS=5000
REPORT_STALE_TTL_MS=30000
PLANT_NAME=Krian
APP_TITLE=QCI E-Report
APP_OWNER=Akbar Tri Prakoso
```

## Endpoint E-Report Baru

- `GET /api/health`
- `GET /api/source-status`
- `GET /api/probe?type=corn`
- `GET /api/report?type=corn&start=2026-09-01&end=2026-09-23`
- `GET /api/report/detail?type=corn&start=2026-09-01&end=2026-09-23&rowKey=...` (detail on demand)
- `GET /api/export?type=corn&start=2026-09-01&end=2026-09-23&format=xlsx` (Excel workbook)
- `GET /api/export?type=corn&start=2026-09-01&end=2026-09-23&format=csv` (CSV compatibility)

Endpoint report memakai cache in-memory dan request de-duplication. Daftar report tidak lagi membawa payload mentah; payload mentah dimuat hanya saat detail dibuka. `REPORT_CACHE_TTL_MS` mengatur durasi data fresh, sedangkan `REPORT_STALE_TTL_MS` mengatur durasi data stale yang tetap bisa ditampilkan sambil refresh di background.

Tipe report: `corn`, `rmlocal`, `moisture`, `kett`, `vdm`.

## API Precisa XM60

Hasil analisa moisture dari aplikasi XM60 Reader disimpan oleh E-Report sendiri (file `data/precisa-measurements.ndjson`, lokasi bisa diubah dengan `PRECISA_DATA_DIR`) dan ditampilkan di menu **Precisa XM60**.

- `POST /api/precisa/measurements` — header `X-API-Key: <PRECISA_API_KEY>`, body `{"schema_version":"xm60.q1st.v1","results":[{"idempotency_key":"<analysis_id>","result":{"ANALYSIS_ID":"...","ID_LAP":"...","MOISTURE_PERCENT":12.3, ...}}]}`. Maksimal 200 item per request. Respons berisi status per item: `stored`, `duplicate` (idempotent, aman dikirim ulang) atau `rejected`.
- `GET /api/precisa/measurements?start=YYYY-MM-DD&end=YYYY-MM-DD&search=...` — daftar hasil.

Isi `PRECISA_API_KEY` di `.env` (wajib untuk menerima data; tanpa itu POST dijawab 503), jalankan server dengan `--lan` agar bisa diakses dari PC XM60, dan buka port server di firewall PC server. Di XM60 Reader: Pengaturan → **E-Report server** → isi URL (`http://IP-PC-SERVER:PORT`) dan API key, lalu tekan TEST E-REPORT.

## Catatan Keamanan

Credential SQL Server tidak disimpan di source code dan file `.env` tidak ikut Git. Gunakan service account khusus E-Report dengan izin `SELECT` saja pada tabel/view yang dibutuhkan. Connection pooling dibatasi oleh `DB_POOL_MAX`; timeout koneksi dan query dapat diatur melalui `.env`.

Aplikasi ini adalah modul reporting read-only. Authentication/SSO sebaiknya dipasang di QCI Operations Platform/Core Portal sebelum rollout multi-user production.
