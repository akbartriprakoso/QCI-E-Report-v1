# Data Flow — QCI E-Report

## Alur Utama

```text
Truck / Incoming Material
        |
        v
Q1ST / DATAQC
        |
      ID_LAP
        |
   +----+-------------------------+
   |                              |
   v                              v
Sampling Step 1/2            Videometer
PARAM_CHECK                  VDM_RAW / RAW_D
   |                              |
   +--------------+---------------+
                  |
                  v
             QC Result
                  ^
                  |
          BulkSampler20
          /             \
      TruckId          RawData
      Shelter/PO       Moisture
                  |
                  v
             QCI E-Report
```

## Report → Source Mapping

| Report | Working source | Existing legacy endpoint |
|---|---|---|
| Corn Q1ST | DATAQC + BulkSampler20 | `/api/q1st-corn-data` |
| RM Local | DATAQC | `/api/q1st-rmlocal-data` |
| Moisture / PRG | BulkSampler20 | `/api/moisture-raw-data` |
| Kett / Dryer | DATAPRODUKSI | `/api/q1st-kett-data` |
| Videometer | DATAQC + BulkSampler20 | `/api/q1st-vdm-data` |

## Integration Key

`ID_LAP` dipakai sebagai identifier utama lintas modul. `ID_ANTRIAN` digunakan sebagai identifier tambahan pada alur antrean/VDM.

## Prinsip Migrasi

Fase 1 — Adapter ke backend Portal QC lama.

Fase 2 — Adapter baru membaca source database menggunakan service account read-only.

Fase 3 — Backend lama tidak lagi dibutuhkan untuk E-Report.

UI dan kontrak API E-Report tetap sama sehingga pergantian sumber data tidak memerlukan rewrite frontend.
