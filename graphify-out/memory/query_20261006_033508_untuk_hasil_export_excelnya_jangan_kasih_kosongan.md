---
type: "query"
date: "2026-10-06T03:35:08.562189+00:00"
question: "untuk hasil export excelnya jangan kasih kosongan yang bernilai 0"
contributor: "graphify"
outcome: "useful"
source_nodes: ["toNumber()", "normalizeRow()"]
---

# Q: untuk hasil export excelnya jangan kasih kosongan yang bernilai 0

## Answer

Expanded from original query via vocab: [export, data, field, number, row, rows, report, mapping]. Fixed the Excel Raw Data fallback in server.js to use nullish fallback so numeric 0 remains 0 while genuinely missing values remain blank. Added an end-to-end XLSX regression test; npm test passes (1/1).

## Outcome

- Signal: useful

## Source Nodes

- toNumber()
- normalizeRow()