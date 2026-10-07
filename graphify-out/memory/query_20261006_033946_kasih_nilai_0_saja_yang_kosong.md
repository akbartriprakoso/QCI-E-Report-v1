---
type: "query"
date: "2026-10-06T03:39:46.401702+00:00"
question: "kasih nilai 0 saja yang kosong"
contributor: "graphify"
outcome: "corrected"
correction: "All genuinely empty XLSX cells should be filled with numeric 0; they should not remain blank."
source_nodes: ["toNumber()", "Report v1"]
---

# Q: kasih nilai 0 saja yang kosong

## Answer

Expanded from original query via vocab: [export, data, field, number, rows, report]. Updated XLSX export so every missing cell is emitted as numeric 0. Date columns use a three-section number format so empty dates display as 0 instead of January 1900. End-to-end tests cover the VDM columns shown by the user and pass.

## Outcome

- Signal: corrected
- Correction: All genuinely empty XLSX cells should be filled with numeric 0; they should not remain blank.

## Source Nodes

- toNumber()
- Report v1