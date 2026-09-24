# Mapping Endpoint Portal QC Lama → E-Report Baru

| Portal QC lama | E-Report baru | Tujuan |
|---|---|---|
| `/api/q1st-corn-data` | `/api/report?type=corn` | Corn Q1ST |
| `/api/q1st-rmlocal-data` | `/api/report?type=rmlocal` | RM Local |
| `/api/moisture-raw-data` | `/api/report?type=moisture` | PRG/raw moisture |
| `/api/q1st-kett-data` | `/api/report?type=kett` | Kett/Dryer |
| `/api/q1st-vdm-data` | `/api/report?type=vdm` | VDM |

E-Report baru menormalisasi bentuk response legacy menjadi satu kontrak row agar frontend tidak bergantung langsung pada struktur tabel database.

## Unified Row Contract

```json
{
  "type": "corn",
  "idLap": "...",
  "idAntrian": "...",
  "qcDoc": "...",
  "date": "...",
  "truckNo": "...",
  "poNumber": "...",
  "shelter": "...",
  "supplier": "...",
  "materialCode": "...",
  "materialName": "...",
  "sampling1": "...",
  "sampling2": "...",
  "finalResult": "ACCEPT | HOLD | REJECT | MEASUREMENT",
  "moisture": 0,
  "density": 0,
  "screenTest": 0,
  "temperature": 0,
  "source": ["DATAQC", "BulkSampler20"],
  "raw": {}
}
```
