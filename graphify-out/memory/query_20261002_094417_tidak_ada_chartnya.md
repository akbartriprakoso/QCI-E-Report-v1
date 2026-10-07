---
type: "query"
date: "2026-10-02T09:44:17.356892+00:00"
question: "tidak ada chartnya"
contributor: "graphify"
outcome: "corrected"
correction: "Use versioned static asset URLs so the browser fetches the renderTrend implementation; a chart also requires a successful report response."
source_nodes: ["serveStatic()", "app.js", "loadReport()"]
---

# Q: tidak ada chartnya

## Answer

Expanded from original query via graph vocab: [render, app, static, serve, load, report, public, server]. The live page had the new chart HTML but Edge reused an older /app.js response because static assets were cached with max-age=300. Added versioned asset URLs for app.js and styles.css, reloaded the live LAN page, loaded 53 RM Local rows for 2-3 October 2026, and verified the SVG line chart renders on Overview. The default Corn request may still show an empty chart when its upstream legacy source times out.

## Outcome

- Signal: corrected
- Correction: Use versioned static asset URLs so the browser fetches the renderTrend implementation; a chart also requires a successful report response.

## Source Nodes

- serveStatic()
- app.js
- loadReport()