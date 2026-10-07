---
type: "query"
date: "2026-10-02T09:18:09.418723+00:00"
question: "pada modul overview kartu traceability dihapus saja, diganti dengan line chart"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Traceability di E-Report", "renderSummary()", "renderActivity()"]
---

# Q: pada modul overview kartu traceability dihapus saja, diganti dengan line chart

## Answer

Expanded from original query via graph vocab: [traceability, render, report, summary, activity]. Replaced the Overview Traceability/Data Lineage card with a responsive daily QC transaction line chart rendered from the currently filtered report rows. The chart fills zero-volume dates across selections up to 366 days, shows totals and peak volume, includes an accessible SVG label and empty state, and was verified in demo mode.

## Outcome

- Signal: useful

## Source Nodes

- Traceability di E-Report
- renderSummary()
- renderActivity()