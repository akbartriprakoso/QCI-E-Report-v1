---
type: "query"
date: "2026-10-07T10:25:14.553989+00:00"
question: "buat ambil datanya langsung dari sumber databasenya, tidak dari server 10.13.5.151:5000"
contributor: "graphify"
outcome: "useful"
source_nodes: ["server", "fetchLegacy()", "v1.1 — Direct Read-Only Integration", "Data Flow — QCI E-Report"]
---

# Q: buat ambil datanya langsung dari sumber databasenya, tidak dari server 10.13.5.151:5000

## Answer

Expanded from original query via graph vocab: [data, source, sumber, server, api, endpoint, fetch, direct, pengambilan, integration, url, env]. Implemented direct read-only SQL Server integration: production now uses DATA_MODE=database, pooled parameterized queries read DATAQC, two BulkSampler20 sources, and DATAPRODUKSI, while the old API host is removed from defaults and startup scripts. Live API verification returned HTTP 200 for corn, rmlocal, moisture, kett, and vdm.

## Outcome

- Signal: useful

## Source Nodes

- server
- fetchLegacy()
- v1.1 — Direct Read-Only Integration
- Data Flow — QCI E-Report