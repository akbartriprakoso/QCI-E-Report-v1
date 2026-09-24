# Field Lineage / Sumber Pengambilan Data

## Corn Q1ST

Header transaksi dan hasil utama berasal dari `DATAQC.TB_QC_INCOMING_TRUCK`.

Parameter QC berasal dari `DATAQC.TB_QC_INCOMING_PARAM_CHECK` dan dipisahkan berdasarkan `SAMPLING_STEP`.

Moisture final terkait incoming berasal dari `DATAQC.TB_QC_INCOMING_MOISTURE`.

Shelter dan PO tambahan dicocokkan ke `BulkSampler20.TruckId` menggunakan identifier transaksi yang tersedia (`ID_LAP`).

Raw moisture dapat berasal dari `BulkSampler20.RawData`.

## RM Local

Header: `DATAQC.TB_QC_INCOMING_TRUCK`.

Parameter: `DATAQC.TB_QC_INCOMING_PARAM_CHECK`.

Material jagung `101201`, `101205`, dan `101227` dikeluarkan dari kelompok RM Local dan masuk report Corn.

## Moisture / PRG

Header sampler: `BulkSampler20.TruckID`.

Raw reading: `BulkSampler20.RawData`.

Relasi utama pada implementasi legacy: `DataKey`.

Data yang ditampilkan antara lain `DataKey`, `id_Lap`, `ShelterCode`, `TruckNo`, `PoNumber`, `TimeStart`, `TimeEnd`, `OperatorName`, `MaterialCode`, `MoistureMin`, `MoistureMax`, `MoistureAvg`, `QuantityRawData`, dan array raw moisture.

## Kett / Dryer

Header: `DATAPRODUKSI.TB_LAP_DRIER`.

Detail: `DATAPRODUKSI.TB_LAP_DRIER_D`.

Relasi: `id_lap`.

Tahap measurement dibedakan dengan `test_stage`, terutama `IN` dan `OUT`.

## Videometer

Header: `DATAQC.TB_QC_INCOMING_VDM_RAW`.

Detail parameter: `DATAQC.TB_QC_INCOMING_VDM_RAW_D`.

Informasi incoming tambahan: `DATAQC.TB_QC_INCOMING_TRUCK`.

Parameter QC tambahan: `DATAQC.TB_QC_INCOMING_PARAM_CHECK`.

Automatic screen data dapat berasal dari `BulkSampler20.TB_ABS_SCREEN_T`.

## Traceability di E-Report

Setiap row hasil normalisasi membawa:

- `type`
- `idLap`
- `idAntrian`
- `source[]`
- `raw`

`raw` menyimpan payload yang diterima dari adapter sehingga field dapat ditelusuri kembali ketika ada perbedaan angka.
