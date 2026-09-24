'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8090);
const DATA_MODE = String(process.env.DATA_MODE || 'demo').toLowerCase();
const LEGACY_API_BASE = String(process.env.LEGACY_API_BASE || 'http://10.13.5.151:5000/api').replace(/\/$/, '');
const PUBLIC_DIR = path.join(__dirname, 'public');

const ENDPOINTS = {
  corn: 'q1st-corn-data',
  rmlocal: 'q1st-rmlocal-data',
  moisture: 'moisture-raw-data',
  kett: 'q1st-kett-data',
  vdm: 'q1st-vdm-data'
};

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || /^\s*#/.test(line) || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function csvEscape(value) {
  if (value == null) return '';
  const s = Array.isArray(value) ? value.join(' | ') : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toNumber(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function first(...values) {
  return values.find(v => v !== undefined && v !== null && v !== '');
}

function normalizeStatus(v) {
  const x = String(v || '').trim().toUpperCase();
  if (!x) return 'UNKNOWN';
  if (/(ACCEPT|PASS|OK|RELEASE|NORMAL|APPROVE)/.test(x)) return 'ACCEPT';
  if (/(REJECT|FAIL|NG)/.test(x)) return 'REJECT';
  if (/(HOLD|RETEST|SAMPLING 2|RESAMPLE|PENDING|WAIT)/.test(x)) return 'HOLD';
  return x;
}

function normalizeRow(type, item, idx) {
  const base = {
    type,
    rowKey: `${type}-${first(item.ID_LAP, item.id_Lap, item.DataKey, item.ID_ANTRIAN, idx)}`,
    idLap: first(item.ID_LAP, item.id_Lap, item.ID_LAPORAN, ''),
    idAntrian: first(item.ID_ANTRIAN, item.IdAntrian, ''),
    qcDoc: first(item.QCDOC, item.QC_DOC, ''),
    date: first(item.ENTRY_DATE, item.SAMPLE_DATE, item.TimeStart, item.TANGGAL, item.tanggal, item.LAST_UPD, ''),
    truckNo: first(item.TRUCK_NO, item.TruckNo, item.TRUCKNO, ''),
    truckType: first(item.TRUCK_TYPE, item.TruckType, ''),
    poNumber: first(item.PoNumber, item.PO, item.PO_NUMBER, item.PONUMBER, ''),
    shelter: first(item.ShelterCode, item.SHELTER_CODE, item.SHELTER, ''),
    supplier: first(item.SUPPLIER, item.Supplier, ''),
    materialCode: first(item.MATERIAL, item.MaterialCode, item.MATERIAL_CODE, ''),
    materialName: first(item.MATERIAL_DESCRIPTION, item.MaterialDescription, item.MaterialName, item.MATERIAL_NAME, ''),
    sampling1: first(item.SAMPLING_1_RESULT, item.SAMPLING1_RESULT, ''),
    sampling2: first(item.SAMPLING_2_RESULT, item.SAMPLING2_RESULT, ''),
    finalResult: normalizeStatus(first(item.TEST_RESULT, item.FINAL_RESULT, item.RESULT, item.REMARKS, '')),
    reason: first(item.TEST_REASON, item.REASON, item.NOTE, ''),
    moisture: toNumber(first(item.MOISTURE, item.MoistureAvg, item.MC, item.moisture)),
    moisture2: toNumber(first(item.MOISTURE2, item.MOISTURE_FINAL2, '')),
    density: toNumber(first(item.DENSITY, item.SAMPLE_DENSITY, item.TRUE_DENSITY, '')),
    density2: toNumber(first(item.DENSITY2, '')),
    screenTest: toNumber(first(item.SCREEN_TEST, item.SCREEN_TEST1, '')),
    temperature: toNumber(first(item.TEMPERATURE, item.TEMPERATURE_AVG, '')),
    rawMoisture: first(item.MOISTURE_FINAL, item.Moisture, []),
    operator: first(item.OperatorName, item.OPERATOR, item.operator, ''),
    source: sourceFor(type),
    raw: item
  };

  if (type === 'moisture') {
    base.finalResult = 'MEASUREMENT';
    base.materialCode = first(item.MaterialCode, base.materialCode);
    base.materialName = first(item.MaterialDescription, item.MaterialName, base.materialName);
    base.moisture = toNumber(item.MoistureAvg);
    base.rawMoisture = Array.isArray(item.Moisture) ? item.Moisture : [];
  }

  if (type === 'kett') {
    base.finalResult = 'MEASUREMENT';
    base.truckNo = first(item.TRUCK_NO, item.TruckNo, 'DRYER');
    base.materialName = first(item.MATERIAL_DESCRIPTION, item.MATERIAL, 'Dryer / Kett');
    base.moisture = toNumber(first(item.moisture, item.MOISTURE, item.kett_reading));
    base.reason = first(item.test_stage, item.TEST_STAGE, item.NOTE, '');
    base.operator = first(item.operator, item.OPERATOR, '');
  }

  if (type === 'vdm') {
    base.finalResult = first(item.REMARKS, item.NOTE, 'MEASUREMENT');
    base.moisture = toNumber(first(item.MC, item.MOISTURE, base.moisture));
    base.density = toNumber(first(item.SAMPLE_DENSITY, item.TRUE_DENSITY, base.density));
  }

  return base;
}

function sourceFor(type) {
  return {
    corn: ['DATAQC', 'BulkSampler20'],
    rmlocal: ['DATAQC'],
    moisture: ['BulkSampler20'],
    kett: ['DATAPRODUKSI'],
    vdm: ['DATAQC', 'BulkSampler20']
  }[type] || ['Unknown'];
}

async function fetchLegacy(type, start, end) {
  const endpoint = ENDPOINTS[type];
  if (!endpoint) throw new Error(`Unsupported report type: ${type}`);
  const url = new URL(`${LEGACY_API_BASE}/${endpoint}`);
  url.searchParams.set('startDate', start);
  url.searchParams.set('endDate', end);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`Legacy API returned HTTP ${resp.status}`);
    const body = await resp.json();
    const rows = Array.isArray(body) ? body : (Array.isArray(body.data) ? body.data : []);
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

function demoRows(type, start, end) {
  const today = start || new Date().toISOString().slice(0,10);
  const shared = [
    { ID_LAP: 'KRN-260923-001', QCDOC: 'QC260923001', TRUCK_NO: 'L 8321 AA', TRUCK_TYPE: 'TRONTON', SUPPLIER: 'SUPPLIER ALPHA', MATERIAL: '101201', MATERIAL_DESCRIPTION: 'Wet Corn', PoNumber: '4500123456', ShelterCode: 'S1', ENTRY_DATE: `${today}T08:12:00`, SAMPLING_1_RESULT: 'RETEST', SAMPLING_2_RESULT: 'PASS', TEST_RESULT: 'ACCEPT', MOISTURE: 29.12, MOISTURE2: 28.78, DENSITY: 704, SCREEN_TEST: 2.1, TEMPERATURE: 31.4, MOISTURE_FINAL: [29.4,29.1,28.9,29.2] },
    { ID_LAP: 'KRN-260923-002', QCDOC: 'QC260923002', TRUCK_NO: 'W 9183 QZ', TRUCK_TYPE: 'TRAILER', SUPPLIER: 'SUPPLIER BETA', MATERIAL: '101227', MATERIAL_DESCRIPTION: 'Dry Corn', PoNumber: '4500123461', ShelterCode: 'S3', ENTRY_DATE: `${today}T08:49:00`, SAMPLING_1_RESULT: 'PASS', TEST_RESULT: 'ACCEPT', MOISTURE: 14.18, DENSITY: 721, SCREEN_TEST: 1.7, TEMPERATURE: 30.8, MOISTURE_FINAL: [14.0,14.2,14.3,14.1] },
    { ID_LAP: 'KRN-260923-003', QCDOC: 'QC260923003', TRUCK_NO: 'N 7712 KB', TRUCK_TYPE: 'TRONTON', SUPPLIER: 'SUPPLIER GAMMA', MATERIAL: '210300', MATERIAL_DESCRIPTION: 'Soybean Meal', PoNumber: '4500123477', ENTRY_DATE: `${today}T09:25:00`, SAMPLING_1_RESULT: 'HOLD', TEST_RESULT: 'HOLD', MOISTURE: 12.03, DENSITY: 612, TEST_REASON: 'Waiting laboratory confirmation' },
    { ID_LAP: 'KRN-260923-004', QCDOC: 'QC260923004', TRUCK_NO: 'L 2291 TU', TRUCK_TYPE: 'TRAILER', SUPPLIER: 'SUPPLIER DELTA', MATERIAL: '232200', MATERIAL_DESCRIPTION: 'Rice Bran', PoNumber: '4500123490', ENTRY_DATE: `${today}T10:05:00`, SAMPLING_1_RESULT: 'FAIL', TEST_RESULT: 'REJECT', MOISTURE: 15.92, DENSITY: 455, TEST_REASON: 'Out of specification' }
  ];
  if (type === 'corn') return shared.filter(x => ['101201','101205','101227'].includes(String(x.MATERIAL)));
  if (type === 'rmlocal') return shared.filter(x => !['101201','101205','101227'].includes(String(x.MATERIAL)));
  if (type === 'moisture') return shared.slice(0,2).map((x,i) => ({ DataKey: 9001+i, id_Lap:x.ID_LAP, ShelterCode:x.ShelterCode, TruckNo:x.TRUCK_NO, PoNumber:x.PoNumber, TimeStart:x.ENTRY_DATE, TimeEnd:x.ENTRY_DATE, OperatorName:'QC AUTOMATION', MaterialCode:x.MATERIAL, MaterialDescription:x.MATERIAL_DESCRIPTION, MoistureAvg:x.MOISTURE, MoistureMin:x.MOISTURE-0.3, MoistureMax:x.MOISTURE+0.3, QuantityRawData:x.MOISTURE_FINAL.length, Moisture:x.MOISTURE_FINAL }));
  if (type === 'kett') return [
    { id_lap:'DRY-260923-01', tanggal:today, shift:'1', operator:'Operator Kett', PO:'4500123555', test_stage:'IN', moisture:28.4, kett_id:'KETT-01', kett_reading:28.4 },
    { id_lap:'DRY-260923-01', tanggal:today, shift:'1', operator:'Operator Kett', PO:'4500123555', test_stage:'OUT', moisture:14.2, kett_id:'KETT-01', kett_reading:14.2 }
  ];
  if (type === 'vdm') return [
    { ID_LAP:'KRN-260923-002', ID_ANTRIAN:'A-025', SAMPLE_DATE:today, START_TIME:'09:00', END_TIME:'09:08', VDM_NO:'VDM-01', PROTOCOL_NO:'P-240', PO:'4500123461', TRUCK_NO:'W 9183 QZ', MC:14.18, SAMPLE_DENSITY:721, GOOD_KERNEL:94.8, BROKEN:2.2, MOLD_DAMAGE:0.4, REMARKS:'NORMAL' }
  ];
  return shared;
}

async function getReport(type, start, end) {
  const raw = DATA_MODE === 'legacy-api' ? await fetchLegacy(type, start, end) : demoRows(type, start, end);
  return raw.map((x, i) => normalizeRow(type, x, i));
}

function summarize(rows) {
  const total = rows.length;
  const accepted = rows.filter(x => x.finalResult === 'ACCEPT').length;
  const rejected = rows.filter(x => x.finalResult === 'REJECT').length;
  const hold = rows.filter(x => x.finalResult === 'HOLD').length;
  const moistures = rows.map(x => x.moisture).filter(Number.isFinite);
  const avgMoisture = moistures.length ? moistures.reduce((a,b)=>a+b,0)/moistures.length : null;
  const sourceSet = new Set(rows.flatMap(r => r.source || []));
  return { total, accepted, rejected, hold, avgMoisture, activeSources: sourceSet.size };
}

function filterRows(rows, q) {
  const search = String(q.get('search') || '').trim().toLowerCase();
  const status = String(q.get('status') || '').trim().toUpperCase();
  if (!search && !status) return rows;
  return rows.filter(r => {
    const text = [r.idLap,r.qcDoc,r.truckNo,r.poNumber,r.supplier,r.materialCode,r.materialName,r.shelter].join(' ').toLowerCase();
    return (!search || text.includes(search)) && (!status || r.finalResult === status);
  });
}

function asCsv(rows) {
  const cols = [
    ['Type','type'],['ID_LAP','idLap'],['ID_ANTRIAN','idAntrian'],['QC Doc','qcDoc'],['Date','date'],['Truck No','truckNo'],['PO','poNumber'],['Shelter','shelter'],['Supplier','supplier'],['Material Code','materialCode'],['Material','materialName'],['Sampling 1','sampling1'],['Sampling 2','sampling2'],['Final Result','finalResult'],['Reason','reason'],['Moisture','moisture'],['Moisture 2','moisture2'],['Density','density'],['Density 2','density2'],['Screen Test','screenTest'],['Temperature','temperature'],['Operator','operator'],['Source','source']
  ];
  return [cols.map(c=>csvEscape(c[0])).join(','), ...rows.map(r => cols.map(c=>csvEscape(r[c[1]])).join(','))].join('\n');
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//,'');
  const safe = path.normalize(rel).replace(/^\.\.(\/|\\|$)+/, '');
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file).toLowerCase();
  const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' }[ext] || 'application/octet-stream';
  const data = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
  res.end(data);
  return true;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = u.pathname;
  try {
    if (pathname === '/api/health') {
      return json(res, 200, {
        ok: true,
        app: process.env.APP_TITLE || 'QCI E-Report',
        plant: process.env.PLANT_NAME || 'Krian',
        owner: process.env.APP_OWNER || 'Akbar Tri Prakoso',
        mode: DATA_MODE,
        legacyApiConfigured: Boolean(LEGACY_API_BASE),
        timestamp: new Date().toISOString()
      });
    }

    if (pathname === '/api/source-status') {
      return json(res, 200, {
        mode: DATA_MODE,
        gateway: DATA_MODE === 'legacy-api' ? LEGACY_API_BASE : 'Demo data generator',
        sources: [
          { id:'dataqc', name:'DATAQC', role:'Q1ST incoming QC + VDM', via:'Legacy API adapter', reports:['corn','rmlocal','vdm'] },
          { id:'bulk1', name:'BulkSampler20', role:'Automatic sampling + raw moisture + screen', via:'Legacy API adapter', reports:['corn','moisture','vdm'] },
          { id:'production', name:'DATAPRODUKSI', role:'Kett / Dryer', via:'Legacy API adapter', reports:['kett'] },
          { id:'qcportal', name:'QCPortal', role:'Legacy manual/application data', via:'Not required by E-Report v1', reports:[] }
        ]
      });
    }

    if (pathname === '/api/probe') {
      const type = u.searchParams.get('type') || 'corn';
      const d = new Date().toISOString().slice(0,10);
      const started = Date.now();
      try {
        const rows = DATA_MODE === 'legacy-api' ? await fetchLegacy(type, d, d) : demoRows(type, d, d);
        return json(res, 200, { ok:true, type, rows:rows.length, latencyMs:Date.now()-started, mode:DATA_MODE });
      } catch (e) {
        return json(res, 502, { ok:false, type, error:e.message, latencyMs:Date.now()-started, mode:DATA_MODE });
      }
    }

    if (pathname === '/api/report' || pathname === '/api/export') {
      const type = u.searchParams.get('type') || 'corn';
      const start = u.searchParams.get('start') || new Date().toISOString().slice(0,10);
      const end = u.searchParams.get('end') || start;
      if (!ENDPOINTS[type]) return json(res, 400, { error:'Unsupported report type', allowed:Object.keys(ENDPOINTS) });
      let rows = await getReport(type, start, end);
      rows = filterRows(rows, u.searchParams);
      if (pathname === '/api/export') {
        const data = Buffer.from('\uFEFF' + asCsv(rows), 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${start}_${type}_qci_ereport.csv"`,
          'Content-Length': data.length
        });
        return res.end(data);
      }
      return json(res, 200, { type, start, end, mode:DATA_MODE, summary:summarize(rows), rows });
    }

    if (serveStatic(req, res, pathname)) return;
    json(res, 404, { error:'Not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.name === 'AbortError' ? 'Data source timeout' : err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`QCI E-Report running at http://127.0.0.1:${PORT}`);
  console.log(`DATA_MODE=${DATA_MODE}`);
  if (DATA_MODE === 'legacy-api') console.log(`LEGACY_API_BASE=${LEGACY_API_BASE}`);
});
