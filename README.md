# QCI E-Report — Akbar Version v1.0

E-Report operasional untuk QCI Krian yang dibangun ulang berdasarkan alur data nyata dari Portal QC lama.

## Tujuan

- Menggantikan halaman E-Report lama dengan UI yang lebih terstruktur.
- Mempertahankan sumber data production yang sudah berjalan.
- Menambahkan traceability: setiap report menampilkan asal sumber data.
- Menjadikan `ID_LAP` sebagai kunci integrasi utama.
- Menyediakan jalur migrasi bertahap dari backend Portal QC lama ke adapter/direct integration baru.

## Report v1

1. Corn Q1ST — DATAQC + BulkSampler20
2. RM Local Q1ST — DATAQC
3. Moisture Analysis / PRG — BulkSampler20
4. Kett / Dryer — DATAPRODUKSI
5. Videometer — DATAQC + BulkSampler20
6. Source Monitor — status adapter dan tes koneksi

## Cara Menjalankan — Production/LAN Transition Mode

Persyaratan: Node.js 18+ (direkomendasikan Node.js 22).

Windows:

```bat
START_WINDOWS.bat
```

Lalu buka:

`http://127.0.0.1:8090`

Default mode adalah `legacy-api` dan mengambil data dari backend Portal QC lama:

`http://10.13.5.151:5000/api`

Backend lama harus dapat diakses dari laptop/PC yang menjalankan aplikasi.

## Cara Menjalankan — Demo / Laptop di Luar Jaringan Plant

```bat
START_DEMO_WINDOWS.bat
```

atau:

```bash
DATA_MODE=demo node server.js
```

## Konfigurasi .env

Copy `.env.example` menjadi `.env` jika ingin mengubah konfigurasi tanpa mengedit source code.

```env
PORT=8090
DATA_MODE=legacy-api
LEGACY_API_BASE=http://10.13.5.151:5000/api
PLANT_NAME=Krian
APP_TITLE=QCI E-Report
APP_OWNER=Akbar Tri Prakoso
```

## Endpoint E-Report Baru

- `GET /api/health`
- `GET /api/source-status`
- `GET /api/probe?type=corn`
- `GET /api/report?type=corn&start=2026-09-01&end=2026-09-23`
- `GET /api/export?type=corn&start=2026-09-01&end=2026-09-23`

Tipe report: `corn`, `rmlocal`, `moisture`, `kett`, `vdm`.

## Catatan Keamanan

E-Report v1 **tidak menyimpan credential SQL Server lama**. Pada fase transisi ia membaca API lama yang sudah digunakan production. Untuk deployment final, adapter API lama diganti dengan service account read-only atau internal integration API resmi.

Aplikasi ini adalah modul reporting read-only. Authentication/SSO sebaiknya dipasang di QCI Operations Platform/Core Portal sebelum rollout multi-user production.
