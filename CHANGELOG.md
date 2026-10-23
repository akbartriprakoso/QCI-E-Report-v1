# Changelog

## 2.3

- Removed the Demo Mode badge; footer label is now v2.3.
- Added the Precisa XM60 module and an API-key-protected ingest API (`/api/precisa/measurements`) with its own NDJSON store.

## Direct database integration

- Added pooled, parameterized, read-only SQL Server adapters for `DATAQC`, `BulkSampler20`, and `DATAPRODUKSI`.
- Changed production startup scripts to `DATA_MODE=database` and removed the Portal QC API server from the active data path.
- Moved all database credentials to `.env`; no password is stored in source control.

## 1.0.0 — 23 Sep 2026

- Rebuilt E-Report UI for QCI Krian.
- Added unified report contract based on `ID_LAP`.
- Added legacy API adapter so currently working Portal QC data flow can be reused during transition.
- Added Corn Q1ST, RM Local, Moisture/PRG, Kett/Dryer, and Videometer reports.
- Added KPI dashboard, date/search/status filters, detail drill-down, raw payload traceability, CSV export, Print/PDF, source monitor, and connection probe.
- Added demo mode for offline development.
- Removed need to copy production SQL credentials into the new source code.
