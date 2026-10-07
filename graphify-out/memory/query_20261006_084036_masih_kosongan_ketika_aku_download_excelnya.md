---
type: "query"
date: "2026-10-06T08:40:36.880320+00:00"
question: "masih kosongan ketika aku download excelnya"
contributor: "graphify"
outcome: "useful"
source_nodes: ["server", "Endpoint E-Report Baru"]
---

# Q: masih kosongan ketika aku download excelnya

## Answer

Expanded from original query via vocab: [export, server, report, data, rows, endpoint, file]. The active server on port 8090 started before the XLSX zero-fill code was modified, so it is serving stale in-memory code. A fresh server on port 8091 exported live VDM data with 1,873 rows: both worksheets had 0 blank cells (43,170 and 34,831 numeric zero cells). The stale elevated process could not be restarted from the current non-elevated session; restart the existing QCI E-Report server window.

## Outcome

- Signal: useful

## Source Nodes

- server
- Endpoint E-Report Baru