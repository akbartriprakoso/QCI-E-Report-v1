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

## Integrasi Aktif

Adapter backend membaca database sumber secara langsung menggunakan service account read-only dan connection pool terpisah untuk `DATAQC`, `BulkSampler20` S3, `BulkSampler20` lokal, serta `DATAPRODUKSI`.

Backend Portal QC lama tidak lagi berada di jalur data production E-Report. UI dan kontrak API E-Report tetap sama, sehingga frontend tidak perlu mengetahui struktur tabel atau credential database.
