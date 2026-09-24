# Graph Report - QCI-E-Report-v1  (2026-09-24)

## Corpus Check
- 9 files · ~3,314 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 90 nodes · 125 edges · 12 communities (9 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app.js
- server.js
- package.json
- QCI E-Report — Akbar Version v1.0
- Field Lineage / Sumber Pengambilan Data
- server
- Data Flow — QCI E-Report
- Roadmap QCI E-Report
- normalizeRow
- Changelog
- Mapping Endpoint Portal QC Lama → E-Report Baru
- asCsv

## God Nodes (most connected - your core abstractions)
1. `loadReport()` - 9 edges
2. `server` - 9 edges
3. `QCI E-Report — Akbar Version v1.0` - 8 edges
4. `renderTable()` - 7 edges
5. `Field Lineage / Sumber Pengambilan Data` - 7 edges
6. `renderActivity()` - 6 edges
7. `openDetail()` - 6 edges
8. `normalizeRow()` - 6 edges
9. `esc()` - 5 edges
10. `api()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `getReport()` --calls--> `normalizeRow()`  [EXTRACTED]
  server.js → server.js  _Bridges community 8 → community 5_
- `server` --calls--> `asCsv()`  [EXTRACTED]
  server.js → server.js  _Bridges community 11 → community 5_

## Import Cycles
- None detected.

## Communities (12 total, 3 thin omitted)

### Community 0 - "app.js"
Cohesion: 0.26
Nodes (16): api(), boot(), esc(), fmt(), fmtDate(), loadReport(), loadSources(), openDetail() (+8 more)

### Community 1 - "server.js"
Cohesion: 0.18
Nodes (9): DATA_MODE, ENDPOINTS, fs, http, LEGACY_API_BASE, path, PORT, PUBLIC_DIR (+1 more)

### Community 2 - "package.json"
Cohesion: 0.20
Nodes (9): description, engines, node, name, private, scripts, demo, start (+1 more)

### Community 3 - "QCI E-Report — Akbar Version v1.0"
Cohesion: 0.22
Nodes (8): Cara Menjalankan — Demo / Laptop di Luar Jaringan Plant, Cara Menjalankan — Production/LAN Transition Mode, Catatan Keamanan, Endpoint E-Report Baru, Konfigurasi .env, QCI E-Report — Akbar Version v1.0, Report v1, Tujuan

### Community 4 - "Field Lineage / Sumber Pengambilan Data"
Cohesion: 0.25
Nodes (7): Corn Q1ST, Field Lineage / Sumber Pengambilan Data, Kett / Dryer, Moisture / PRG, RM Local, Traceability di E-Report, Videometer

### Community 5 - "server"
Cohesion: 0.36
Nodes (8): demoRows(), fetchLegacy(), filterRows(), getReport(), json(), server, serveStatic(), summarize()

### Community 6 - "Data Flow — QCI E-Report"
Cohesion: 0.33
Nodes (5): Alur Utama, Data Flow — QCI E-Report, Integration Key, Prinsip Migrasi, Report → Source Mapping

### Community 7 - "Roadmap QCI E-Report"
Cohesion: 0.33
Nodes (5): Roadmap QCI E-Report, v1.0 — Transition E-Report, v1.1 — Direct Read-Only Integration, v1.2 — Report Governance, v2 — QCI Operations Platform Integration

### Community 8 - "normalizeRow"
Cohesion: 0.40
Nodes (5): first(), normalizeRow(), normalizeStatus(), sourceFor(), toNumber()

## Knowledge Gaps
- **39 isolated node(s):** `name`, `version`, `private`, `description`, `start` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 48 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `name`, `version`, `private` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._