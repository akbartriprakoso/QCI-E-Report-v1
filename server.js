'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const zlib = require('zlib');
const ExcelJS = require('exceljs');

loadEnvFile(path.join(__dirname, '.env'));

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const PORT = Number(cliValue('--port') || process.env.PORT || 8090);
const DATA_MODE = String(cliValue('--data-mode') || process.env.DATA_MODE || 'demo').toLowerCase();
const SERVER_HOST = String(
  process.argv.includes('--lan') ? '0.0.0.0' :
  process.argv.includes('--local') ? '127.0.0.1' :
  cliValue('--host') || process.env.SERVER_HOST || '0.0.0.0'
);
const LEGACY_API_BASE = String(cliValue('--legacy-api-base') || process.env.LEGACY_API_BASE || 'http://10.13.5.151:5000/api').replace(/\/$/, '');
const PUBLIC_DIR = path.join(__dirname, 'public');
function envMilliseconds(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}
const REPORT_CACHE_TTL_MS = envMilliseconds('REPORT_CACHE_TTL_MS', 5000);
const REPORT_STALE_TTL_MS = envMilliseconds('REPORT_STALE_TTL_MS', 30000);
const MAX_REPORT_CACHE_ENTRIES = 50;
const reportCache = new Map();
const reportRequests = new Map();

const ENDPOINTS = {
  corn: 'q1st-corn-data',
  rmlocal: 'q1st-rmlocal-data',
  moisture: 'moisture-raw-data',
  kett: 'q1st-kett-data',
  vdm: 'q1st-vdm-data'
};

const REPORT_COLUMNS = [
  ['Type', 'type', 12], ['ID_LAP', 'idLap', 20], ['ID_ANTRIAN', 'idAntrian', 16],
  ['QC Doc', 'qcDoc', 16], ['Date', 'date', 22], ['Truck No', 'truckNo', 16],
  ['PO', 'poNumber', 16], ['Shelter', 'shelter', 12], ['Supplier', 'supplier', 24],
  ['Material Code', 'materialCode', 16], ['Material', 'materialName', 24],
  ['Sampling 1', 'sampling1', 16], ['Sampling 2', 'sampling2', 16],
  ['Final Result', 'finalResult', 16], ['Reason', 'reason', 30],
  ['Moisture', 'moisture', 12], ['Moisture 2', 'moisture2', 12],
  ['Density', 'density', 12], ['Density 2', 'density2', 12],
  ['Screen Test', 'screenTest', 14], ['Temperature', 'temperature', 14],
  ['Operator', 'operator', 22], ['Source', 'source', 24]
];

const RAW_DATA_HEADERS = [
  'DataKey', 'id_Lap', 'ShelterCode', 'TruckNo', 'PoNumber', 'TimeStart', 'TimeEnd',
  'OperatorName', 'Category', 'MaterialCode', 'MaterialName', 'MaterialDescription',
  'MoistureMax', 'MoistureMin', 'MoistureAvg', 'QuantityRawData', 'BATAS_RAW_DATA',
  ...Array.from({ length: 71 }, (_, i) => `Raw Data ${i + 1}`)
];

const CORN_HEADERS = [
  'ID_LAP', 'QCDOC', 'TRUCK_NO', 'TRUCK_TYPE', 'ShelterCode', 'PoNumber', 'SUPPLIER',
  'MATERIAL', 'MATERIAL_DESCRIPTION', 'PACK', 'QUANTITY', 'QTYBAG', 'ENTRY_DATE', 'LAST_UPD',
  'SAMPLING_1_RESULT', 'SAMPLING_2_RESULT', 'TEST_RESULT', 'TEST_REASON',
  'BATAS_SAMPLING_1', 'GRADE_REFRAKSI_JAGUNG', 'GRADE_RAF_JAGUNG', 'SCREEN_TEST', 'DENSITY',
  'SEVERE_MOLDY_GRAIN', 'FOREIGN_MATERIAL', 'MOLDY_SEED', 'BROKEN_SEED', 'OTHER_DAMAGE_SEED',
  'TEMPERATURE', 'AFLATOXIN_UV', 'MOISTURE', 'BATAS_SAMPLING_2', 'GRADE_REFRAKSI_JAGUNG2',
  'GRADE_RAF_JAGUNG2', 'SCREEN_TEST2', 'DENSITY2', 'SEVERE_MOLDY_GRAIN2', 'FOREIGN_MATERIAL2',
  'MOLDY_SEED2', 'BROKEN_SEED2', 'OTHER_DAMAGE_SEED2', 'TEMPERATURE2', 'AFLATOXIN_UV2',
  'MOISTURE2', 'MOISTURE_FINAL2', 'BATAS_RAW_DATA',
  ...Array.from({ length: 74 }, (_, i) => `Raw Data ${i + 1}`)
];

const LOCAL_ALL_HEADERS = [
  'QCDOC', 'ID_LAP', 'ENTRY_DATE', 'SUPPLIER', 'TRUCK_NO', 'PO', 'MATERIAL',
  'MATERIAL_DESCRIPTION', 'QTYBAG', 'QUANTITY', 'TRUCK_TYPE', 'PACK', 'LAST_UPD',
  'SAMPLING_1_RESULT', 'SAMPLING_2_RESULT', 'TEST_RESULT', 'TEST_REASON',
  'SAMPLING_1_REASON', 'DRIVER_NAME', 'DO_REFF', 'SLOC', 'BATAS_HASIL_Q1st', 'MOISTURE',
  'PROTEIN', 'FAT', 'FIBER', 'ASH', 'NA', 'NACL', 'CALCIUM', 'PHOSPHOR', 'INDEX', 'PEPSIN',
  'KOH', 'UA', 'TIA', 'CL', 'AFLATOXIN_UV', 'ZEARALENONE', 'FUMONISIN', 'OCHRATOXIN',
  'DEOXINYVALENOL', 'T2-TOXIN', 'TVBNNEW', 'ETHOXIQUIN', 'STARCH', 'GELATINIZATION',
  'PHOSPHOR SOLUBILITY', 'XANTHOPHYL', 'GLUCONSINOLATE', 'FFA', 'IOV', 'ACID VALUE', 'HULLS',
  'SHELL', 'SAND', 'WETGLUTEN', 'AIM', 'IMPURITY', 'LEACHING', 'FFA', 'ACID VALUE (DEFATTED)',
  'BRIX', 'RVAINDEX', 'PDI', 'POV', 'ANISIDINE', 'TOTOX', 'PH', 'DENSITY', 'CHOLINE CHLORIDE',
  'LACTOSE', 'REDUCING SUGAR', 'GE', 'AME', 'AMEN', 'CP_SOL', 'P_CP_SOL', 'DM', 'CYS',
  'ASPARTIC ACID', 'GLUTAMIC ACID', 'SERINE', 'GLYCINE', 'HISTIDINE', 'ARG', 'THR', 'ALANINE',
  'PROLINE', 'MET', 'VAL', 'ILE', 'LEU', 'PHE', 'LYS', 'TRP', 'MC', 'NDF', 'NFE', 'PCI_EVO',
  'KOH_EVO', 'TIA_EVO', 'PDI_EVO', 'LYS_REACTIVE', 'LYS_RATIO', 'LYS_AVAILABLE', 'KOH_PS',
  'FB', 'PHYTIC_ACID', 'ADF', 'H-MOISTURE'
];

const LOCAL_SHEET_BASE_HEADERS = [
  'ID_LAP', 'QCDOC', 'TRUCK_NO', 'TRUCK_TYPE', 'PO', 'SUPPLIER', 'MATERIAL',
  'MATERIAL_DESCRIPTION', 'PACK', 'QUANTITY', 'QTYBAG', 'ENTRY_DATE', 'LAST_UPD',
  'SAMPLING_1_RESULT', 'SAMPLING_2_RESULT', 'TEST_RESULT', 'TEST_REASON',
  'SAMPLING_1_REASON', 'DRIVER_NAME', 'DO_REFF', 'SLOC', 'BATAS_HASIL_Q1st'
];

const LOCAL_DETAIL_ORDER = [
  ...LOCAL_ALL_HEADERS.slice(22),
  'SCREEN_TEST', 'TEXTURE335MM', 'TEXTURE2MM', 'TEXTURE1MM', 'TEMPERATURE', 'PD',
  'H-MOISTURE', 'SCREEN_TEST2', 'TEXTURE335MM2', 'TEXTURE2MM2', 'TEXTURE1MM2', 'TEMPERATURE2',
  'PD2', 'H-MOISTURE2'
];

const KETT_MOISTURE_HEADERS = [
  'ID_Lap', 'Tanggal', 'Shift', 'Operator', 'MC', 'PO', 'Kett_ID', 'Kett_Calibration',
  'Test_Stage', 'Avg_Moisture', 'Min_Moisture', 'Max_Moisture', 'BATAS_MOISTURE',
  ...Array.from({ length: 8 }, (_, i) => `Moisture ${i + 1}`)
];

const KETT_READ_HEADERS = [
  'ID_Lap', 'Tanggal', 'Shift', 'Operator', 'MC', 'PO', 'Kett_ID', 'Kett_Calibration',
  'Test_Stage', ...Array.from({ length: 8 }, (_, i) => `KettRead ${i + 1}`)
];

const KETT_ADJUSTMENT_HEADERS = [
  'ID_Lap', 'Tanggal', 'Shift', 'Operator', 'MC', 'PO', 'Kett_ID', 'Kett_Calibration',
  'Test_Stage', ...Array.from({ length: 8 }, (_, i) => `AdjustmentVal ${i + 1}`)
];

const VDM_RAW_HEADERS = [
  'Date Log', 'Start Time', 'End Time', 'VDM No.', 'Protocol No.', 'PO', 'TRUCK NO',
  'ID ANTRIAN', 'REMARK', 'NOTE', 'Kode Sample', 'MC (%)', 'Total Weight (gr)', 'On 5 MM (gr)',
  'On 2 MM (gr)', 'Pass 2 MM (gr)', 'True Density (gr/l)', 'Sample Density (gr/l)',
  'TOTAL COUNT (count)', '01 Good Kernel (%)', '02 Broken (%)', '03 Mold damage (%)',
  '04 Mold damage strong (%)', '05 Damaged (%)', '06 Insect damage (%)',
  '07 Insect damage severe (%)', '08 Mold damage severe (count)', '09 Ad mixture (%)',
  '10.Breeding Seed (count)', '11 Multiples (count)', '12 Glumes (count)', 'Weird Seed (%)',
  '14 Chipped (%)', '15 Cracked (%)', '16 Light Damage (%)', '17 Light Mold (%)',
  '18 White Striped Mold (%)', '19 Material 2-5mm (%)', '20 Material <2mm (%)',
  'SEVERE DAMAGE (count)', 'BREEDING SEED (count)', 'Moisture', 'Density', 'Total (G)',
  'Broken (G)', 'Foreign (G)', 'Total (%)', 'Broken (%)', 'Foreign (%)', 'Temperature Avg',
  'Start Process', 'End Process'
];

const VDM_WEEKLY_HEADERS = [
  'ID LAP', 'ID ANTRIAN', 'Supplier', 'Truck No.', 'Kode Sample', 'Rep', 'EQA', 'Week', 'Date',
  'Time Begin', 'Time End', 'Time Diff', 'Total Count VDM', 'Total Count Manual',
  'Bad Kernel Manual', 'Diff in Count', 'Diff in %', 'Multiple', 'Glumes', 'Kadar Air (%)',
  'Total Weight (gr)', 'On 5 MM (gr)', 'On 2 MM (gr)', 'Pass 2 MM (gr)', '01 Good Kernel (%)',
  '02 Broken (%)', '03+04 Mold damage (%)', '05 Damaged (%)', '06 Insect damage (%)',
  '06 Insect damage severe (%)', '08 Mold damage severe (count)', '09 Ad mixture (%)',
  '10.Breeding Seed (count)', '19 Material 2-5mm (%)', '20 Material <2mm (%)'
];

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
  const payload = Buffer.from(JSON.stringify(body));
  const acceptsGzip = /\bgzip\b/i.test(String(res.req?.headers?.['accept-encoding'] || ''));
  const compressed = acceptsGzip && payload.length > 1024;
  const data = compressed ? zlib.gzipSync(payload, { level: 1 }) : payload;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store'
  };
  if (compressed) {
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  res.writeHead(status, headers);
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
  // Keep the documented parameter names, plus aliases used by some legacy deployments.
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`Legacy API returned HTTP ${resp.status}`);
    const body = await resp.json();
    return extractLegacyRows(body, type);
  } finally {
    clearTimeout(timer);
  }
}

function extractLegacyRows(body, type) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') {
    throw new Error(`Legacy ${type} response was not a JSON object or array`);
  }

  // Legacy deployments have used several response envelopes over time.
  const collectionKeys = ['data', 'rows', 'results', 'items', 'records', 'result'];
  for (const key of collectionKeys) {
    const value = body[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      try {
        return extractLegacyRows(value, type);
      } catch (error) {
        if (!/did not contain a row collection|was not a JSON/.test(error.message)) throw error;
      }
    }
  }

  throw new Error(`Legacy ${type} response did not contain a row collection`);
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
  const key = `${DATA_MODE}|${type}|${start}|${end}`;
  const now = Date.now();
  const cached = reportCache.get(key);
  if (cached) {
    const age = now - cached.fetchedAt;
    if (age <= REPORT_CACHE_TTL_MS) return cached.rows;
    if (age <= REPORT_CACHE_TTL_MS + REPORT_STALE_TTL_MS) {
      void refreshReport(key, type, start, end).catch(error => {
        console.warn(`Background report refresh failed for ${type}: ${error.message}`);
      });
      return cached.rows;
    }
  }
  return refreshReport(key, type, start, end);
}

async function refreshReport(key, type, start, end) {
  const existing = reportRequests.get(key);
  if (existing) return existing;
  const request = (async () => {
    const raw = DATA_MODE === 'legacy-api' ? await fetchLegacy(type, start, end) : demoRows(type, start, end);
    const rows = raw.map((x, i) => normalizeRow(type, x, i));
    reportCache.set(key, { rows, fetchedAt: Date.now() });
    while (reportCache.size > MAX_REPORT_CACHE_ENTRIES) reportCache.delete(reportCache.keys().next().value);
    return rows;
  })().finally(() => reportRequests.delete(key));
  reportRequests.set(key, request);
  return request;
}

function publicRow(row) {
  const { raw, rawMoisture, ...safeRow } = row;
  return safeRow;
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
  return [
    REPORT_COLUMNS.map(c => csvEscape(c[0])).join(','),
    ...rows.map(r => REPORT_COLUMNS.map(c => csvEscape(r[c[1]])).join(','))
  ].join('\n');
}

function filenamePart(value) {
  return String(value || 'report').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'report';
}

const TEMPLATE_ALIASES = {
  DataKey: ['DataKey', 'DATA_KEY', 'dataKey'],
  id_Lap: ['id_Lap', 'ID_LAP', 'id_lap', 'idLap'],
  ShelterCode: ['ShelterCode', 'SHELTER_CODE', 'SHELTER', 'shelter'],
  TruckNo: ['TruckNo', 'TRUCK_NO', 'TRUCKNO', 'truckNo'],
  PoNumber: ['PoNumber', 'PO', 'PO_NUMBER', 'PONUMBER', 'poNumber'],
  TimeStart: ['TimeStart', 'START_TIME', 'startTime'],
  TimeEnd: ['TimeEnd', 'END_TIME', 'endTime'],
  OperatorName: ['OperatorName', 'OPERATOR', 'operator'],
  MaterialCode: ['MaterialCode', 'MATERIAL', 'MATERIAL_CODE', 'materialCode'],
  MaterialName: ['MaterialName', 'MATERIAL_NAME', 'materialName'],
  MaterialDescription: ['MaterialDescription', 'MATERIAL_DESCRIPTION', 'materialDescription'],
  QCDOC: ['QCDOC', 'QC_DOC', 'qcDoc'],
  ID_LAP: ['ID_LAP', 'id_Lap', 'id_lap', 'idLap', 'ID_LAPORAN'],
  ID_Lap: ['ID_Lap', 'ID_LAP', 'id_Lap', 'id_lap', 'idLap'],
  ID_ANTRIAN: ['ID_ANTRIAN', 'IdAntrian', 'idAntrian'],
  ENTRY_DATE: ['ENTRY_DATE', 'entryDate', 'TANGGAL', 'tanggal', 'SAMPLE_DATE', 'sampleDate'],
  LAST_UPD: ['LAST_UPD', 'lastUpdated', 'LAST_UPDATED', 'updatedAt'],
  SUPPLIER: ['SUPPLIER', 'Supplier', 'supplier'],
  MATERIAL: ['MATERIAL', 'MaterialCode', 'MATERIAL_CODE', 'materialCode'],
  MATERIAL_DESCRIPTION: ['MATERIAL_DESCRIPTION', 'MaterialDescription', 'MaterialName', 'materialName'],
  TRUCK_NO: ['TRUCK_NO', 'TruckNo', 'TRUCKNO', 'truckNo'],
  TRUCK_TYPE: ['TRUCK_TYPE', 'TruckType', 'truckType'],
  PO: ['PO', 'PoNumber', 'PO_NUMBER', 'PONUMBER', 'poNumber'],
  QUANTITY: ['QUANTITY', 'quantity'],
  QTYBAG: ['QTYBAG', 'qtyBag', 'QTY_BAG'],
  Tanggal: ['Tanggal', 'TANGGAL', 'tanggal', 'ENTRY_DATE', 'entryDate', 'SAMPLE_DATE', 'sampleDate'],
  MC: ['MC', 'mc', 'MOISTURE', 'moisture'],
  Kett_ID: ['Kett_ID', 'KETT_ID', 'kett_id', 'kettId'],
  Kett_Calibration: ['Kett_Calibration', 'KETT_CALIBRATION', 'kett_calibration', 'kettCalibration'],
  Test_Stage: ['Test_Stage', 'TEST_STAGE', 'test_stage', 'testStage'],
  'Date Log': ['Date Log', 'DATE_LOG', 'SAMPLE_DATE', 'sampleDate', 'DATE', 'date'],
  'Start Time': ['Start Time', 'START_TIME', 'TimeStart', 'startTime'],
  'End Time': ['End Time', 'END_TIME', 'TimeEnd', 'endTime'],
  'VDM No.': ['VDM No.', 'VDM_NO', 'vdmNo'],
  'Protocol No.': ['Protocol No.', 'PROTOCOL_NO', 'protocolNo'],
  'TRUCK NO': ['TRUCK NO', 'TRUCK_NO', 'TruckNo', 'truckNo'],
  'REMARK': ['REMARK', 'REMARKS', 'remark', 'remarks'],
  'NOTE': ['NOTE', 'Note', 'note'],
  'Kode Sample': ['Kode Sample', 'KODE_SAMPLE', 'SAMPLE_CODE', 'MaterialName', 'MaterialDescription'],
  'MC (%)': ['MC (%)', 'MC', 'MOISTURE', 'moisture'],
  'Sample Density (gr/l)': ['Sample Density (gr/l)', 'SAMPLE_DENSITY', 'sampleDensity'],
  'True Density (gr/l)': ['True Density (gr/l)', 'TRUE_DENSITY', 'trueDensity'],
  'TOTAL COUNT (count)': ['TOTAL COUNT (count)', 'TOTAL_COUNT', 'TOTAL_COUNT_VDM', 'totalCount'],
  'Kadar Air (%)': ['Kadar Air (%)', 'MC', 'MOISTURE', 'moisture'],
  Date: ['Date', 'DATE_LOG', 'SAMPLE_DATE', 'ENTRY_DATE', 'date']
};

const DATE_HEADERS = new Set(['ENTRY_DATE', 'LAST_UPD', 'Tanggal', 'Date Log', 'Date']);

function isPresent(value) {
  return value !== undefined && value !== null && value !== '';
}

function keySignature(value) {
  return String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function signatureVariants(value) {
  const base = keySignature(value);
  const withoutPrefix = base.replace(/^\d+/, '').replace(/^\d+/, '');
  const withoutUnits = withoutPrefix.replace(/(grl|gr|count|percent|pct)$/, '');
  return [base, withoutPrefix, withoutUnits].filter(Boolean);
}

function lookupRaw(raw, candidates) {
  if (!raw || typeof raw !== 'object') return undefined;
  const names = candidates.flatMap(name => [name, ...(TEMPLATE_ALIASES[name] || [])]);
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(raw, name) && isPresent(raw[name])) return raw[name];
  }
  const signatures = new Set(names.flatMap(signatureVariants));
  for (const [key, value] of Object.entries(raw)) {
    if (signatures.has(keySignature(key)) && isPresent(value)) return value;
  }
  return undefined;
}

function normalizedRowValue(row, header) {
  const values = {
    Type: row.type,
    ID_LAP: row.idLap,
    ID_Lap: row.idLap,
    QCDOC: row.qcDoc,
    'ID ANTRIAN': row.idAntrian,
    'Date Log': row.date,
    Date: row.date,
    Tanggal: row.date,
    ENTRY_DATE: row.date,
    LAST_UPD: row.date,
    TRUCK_NO: row.truckNo,
    'TRUCK NO': row.truckNo,
    'Truck No.': row.truckNo,
    TRUCK_TYPE: row.truckType,
    PO: row.poNumber,
    PoNumber: row.poNumber,
    SUPPLIER: row.supplier,
    Supplier: row.supplier,
    MATERIAL: row.materialCode,
    MaterialCode: row.materialCode,
    MaterialName: row.materialName,
    MATERIAL_DESCRIPTION: row.materialName,
    MaterialDescription: row.materialName,
    moisture: row.moisture,
    MOISTURE: row.moisture,
    'MC (%)': row.moisture,
    MC: row.moisture,
    MOISTURE2: row.moisture2,
    DENSITY: row.density,
    'Sample Density (gr/l)': row.density,
    'True Density (gr/l)': row.density,
    DENSITY2: row.density2,
    SCREEN_TEST: row.screenTest,
    TEMPERATURE: row.temperature,
    TEST_RESULT: row.finalResult,
    REMARK: row.finalResult,
    REMARKS: row.finalResult,
    REASON: row.reason,
    TEST_REASON: row.reason,
    OperatorName: row.operator,
    Operator: row.operator,
    operator: row.operator,
    source: (row.source || []).join(' + ')
  };
  return values[header];
}

function excelDateValue(value) {
  if (!isPresent(value)) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' && value > 20000 && value < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function arrayValue(value, index) {
  if (Array.isArray(value)) return value[index];
  return index === 0 ? value : undefined;
}

function templateValue(row, type, header, index) {
  const raw = row.raw || {};
  let value = lookupRaw(raw, [header]);
  if (!isPresent(value)) value = normalizedRowValue(row, header);

  if (!isPresent(value) && type === 'moisture' && /^Raw Data \d+$/.test(header)) {
    const rawIndex = Number(header.replace('Raw Data ', '')) - 1;
    value = arrayValue(lookupRaw(raw, ['Moisture', 'MOISTURE_FINAL', 'rawMoisture']) ?? row.rawMoisture, rawIndex);
  }

  if (type === 'kett') {
    const moistureIndex = header.match(/^Moisture (\d+)$/);
    const readIndex = header.match(/^KettRead (\d+)$/);
    const adjustmentIndex = header.match(/^AdjustmentVal (\d+)$/);
    if (!isPresent(value) && moistureIndex) {
      value = arrayValue(lookupRaw(raw, ['MoistureReadings', 'moistureReadings', 'Moisture', 'moisture']), Number(moistureIndex[1]) - 1);
    }
    if (!isPresent(value) && readIndex) {
      value = arrayValue(lookupRaw(raw, ['KettReadings', 'kettReadings', 'KettRead', 'kett_reading']), Number(readIndex[1]) - 1);
    }
    if (!isPresent(value) && adjustmentIndex) {
      value = arrayValue(lookupRaw(raw, ['AdjustmentValues', 'adjustmentValues', 'AdjustmentVal', 'adjustment']), Number(adjustmentIndex[1]) - 1);
    }
    if (!isPresent(value) && header === 'Avg_Moisture') value = lookupRaw(raw, ['MOISTURE', 'moisture', 'AvgMoisture', 'avgMoisture']) ?? row.moisture;
    if (!isPresent(value) && header === 'Min_Moisture') value = lookupRaw(raw, ['MinMoisture', 'minMoisture']);
    if (!isPresent(value) && header === 'Max_Moisture') value = lookupRaw(raw, ['MaxMoisture', 'maxMoisture']);
    if (!isPresent(value) && header === 'Kett_Calibration') value = lookupRaw(raw, ['Kett_Calibration', 'kett_calibration']);
    if (!isPresent(value) && header === 'Test_Stage') value = lookupRaw(raw, ['Test_Stage', 'test_stage']);
  }

  if (type === 'vdm' && header === 'Supplier') value = lookupRaw(raw, ['SUPPLIER', 'Supplier', 'supplier']);
  if (type === 'vdm' && header === 'Time Diff' && !isPresent(value)) {
    const start = lookupRaw(raw, ['START_TIME', 'Start Time']);
    const end = lookupRaw(raw, ['END_TIME', 'End Time']);
    if (typeof start === 'string' && typeof end === 'string') {
      const parseTime = text => {
        const parts = text.split(':').map(Number);
        return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : NaN;
      };
      const seconds = parseTime(end) - parseTime(start);
      if (Number.isFinite(seconds) && seconds >= 0) value = seconds / 60;
    }
  }

  if (Array.isArray(value)) value = value.join(' | ');
  if (DATE_HEADERS.has(header)) value = excelDateValue(value);
  return isPresent(value) ? value : 0;
}

function columnLetter(number) {
  let result = '';
  let n = number;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function columnWidth(header) {
  const text = String(header);
  if (DATE_HEADERS.has(text)) return 21;
  if (/SUPPLIER|DESCRIPTION|REASON|NOTE|REMARK|DRIVER|OPERATOR/i.test(text)) return 28;
  if (/RAW DATA|COUNT|DENSITY|MOISTURE|TEMPERATURE|WEIGHT|PROCESS/i.test(text)) return 14;
  if (/MATERIAL|TRUCK|PROTOCOL|CALIBRATION|SAMPLE|KETT/i.test(text)) return 18;
  return Math.min(18, Math.max(10, text.length + 2));
}

function uniqueSheetName(workbook, requested) {
  const used = new Set(workbook.worksheets.map(sheet => sheet.name.toLowerCase()));
  const clean = String(requested || 'Data').replace(/[\\/?*\[\]:]/g, '-').trim().slice(0, 31) || 'Data';
  let name = clean;
  let index = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = `-${index++}`;
    name = `${clean.slice(0, 31 - suffix.length)}${suffix}`;
  }
  return name;
}

function addExportSheet(workbook, requestedName, headers, rows, type) {
  const worksheet = workbook.addWorksheet(uniqueSheetName(workbook, requestedName), {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });
  worksheet.columns = headers.map((header, index) => ({
    header,
    key: `c${index + 1}`,
    width: columnWidth(header)
  }));
  rows.forEach((row, rowIndex) => {
    worksheet.addRow(headers.map(header => templateValue(row, type, header, rowIndex)));
  });

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF0' } };
  const border = { style: 'thin', color: { argb: 'FFD9E0E5' } };
  worksheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FF1F2933' } };
    cell.fill = headerFill;
    cell.border = { top: border, left: border, bottom: border, right: border };
    cell.alignment = { vertical: 'middle', wrapText: false };
  });
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.eachCell(cell => {
      cell.border = { bottom: border };
      cell.alignment = { vertical: 'middle' };
    });
  });
  headers.forEach((header, index) => {
    if (DATE_HEADERS.has(header)) worksheet.getColumn(index + 1).numFmt = 'dd mmm yyyy hh:mm;dd mmm yyyy hh:mm;0';
  });
  worksheet.autoFilter = { from: 'A1', to: `${columnLetter(headers.length)}${Math.max(1, rows.length + 1)}` };
  return worksheet;
}

function localMaterialCode(row) {
  const value = lookupRaw(row.raw || {}, ['MATERIAL', 'MaterialCode', 'MATERIAL_CODE']) ?? row.materialCode;
  return String(value || 'Unknown').trim() || 'Unknown';
}

function localHeadersForRows(rows) {
  const rawKeys = [];
  const seen = new Set();
  rows.forEach(row => Object.keys(row.raw || {}).forEach(key => {
    const signature = keySignature(key);
    if (!seen.has(signature)) {
      seen.add(signature);
      rawKeys.push(key);
    }
  }));
  const available = new Set(rawKeys.map(keySignature));
  const headers = [];
  const headerSeen = new Set();
  const canonicalSignatures = new Set([
    ...LOCAL_SHEET_BASE_HEADERS,
    ...LOCAL_DETAIL_ORDER
  ].flatMap(header => [header, ...(TEMPLATE_ALIASES[header] || [])].map(keySignature)));
  const add = header => {
    const signature = keySignature(header);
    if (!headerSeen.has(signature) && (LOCAL_SHEET_BASE_HEADERS.includes(header) || available.has(signature))) {
      headerSeen.add(signature);
      headers.push(header);
    }
  };
  LOCAL_SHEET_BASE_HEADERS.forEach(add);
  LOCAL_DETAIL_ORDER.forEach(add);
  rawKeys.forEach(header => {
    if (!canonicalSignatures.has(keySignature(header))) add(header);
  });
  return headers;
}

function addModuleSheets(workbook, type, rows) {
  if (type === 'moisture') {
    addExportSheet(workbook, 'RawData', RAW_DATA_HEADERS, rows, type);
    return;
  }
  if (type === 'corn') {
    addExportSheet(workbook, 'Corn Q1st', CORN_HEADERS, rows, type);
    return;
  }
  if (type === 'rmlocal') {
    addExportSheet(workbook, 'ALL MATERIAL', LOCAL_ALL_HEADERS, rows, type);
    const groups = new Map();
    rows.forEach(row => {
      const code = localMaterialCode(row);
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code).push(row);
    });
    [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([code, group]) => {
      addExportSheet(workbook, code, localHeadersForRows(group), group, type);
    });
    return;
  }
  if (type === 'kett') {
    addExportSheet(workbook, 'Moisture Data', KETT_MOISTURE_HEADERS, rows, type);
    addExportSheet(workbook, 'Kett Read Data', KETT_READ_HEADERS, rows, type);
    addExportSheet(workbook, 'Moisture Adjustment Data', KETT_ADJUSTMENT_HEADERS, rows, type);
    return;
  }
  if (type === 'vdm') {
    addExportSheet(workbook, 'VDM Raw Data Format', VDM_RAW_HEADERS, rows, type);
    addExportSheet(workbook, 'VDM Weekly Format', VDM_WEEKLY_HEADERS, rows, type);
    return;
  }
  addExportSheet(workbook, 'Report', REPORT_COLUMNS.map(([header]) => header), rows, type);
}

async function asXlsx(rows, meta) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = process.env.APP_OWNER || 'QCI E-Report';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.title = `${meta.type} export`;
  workbook.properties.subject = 'QCI E-Report module export';
  addModuleSheets(workbook, meta.type, rows);
  return workbook.xlsx.writeBuffer();
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//,'');
  const safe = path.normalize(rel).replace(/^\.\.(\/|\\|$)+/, '');
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file).toLowerCase();
  const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' }[ext] || 'application/octet-stream';
  const data = fs.readFileSync(file);
  const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=300, stale-while-revalidate=3600';
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length, 'Cache-Control': cacheControl });
  res.end(data);
  return true;
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap(entries => entries || [])
    .filter(entry => !entry.internal && (entry.family === 'IPv4' || entry.family === 4))
    .map(entry => entry.address);
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

    if (pathname === '/api/report/detail') {
      const type = u.searchParams.get('type') || 'corn';
      const start = u.searchParams.get('start') || new Date().toISOString().slice(0,10);
      const end = u.searchParams.get('end') || start;
      const rowKey = u.searchParams.get('rowKey') || '';
      if (!ENDPOINTS[type]) return json(res, 400, { error:'Unsupported report type', allowed:Object.keys(ENDPOINTS) });
      if (!rowKey) return json(res, 400, { error:'rowKey is required' });
      const rows = await getReport(type, start, end);
      const row = rows.find(item => item.rowKey === rowKey);
      if (!row) return json(res, 404, { error:'Report row not found' });
      return json(res, 200, { row });
    }

    if (pathname === '/api/report' || pathname === '/api/export') {
      const type = u.searchParams.get('type') || 'corn';
      const start = u.searchParams.get('start') || new Date().toISOString().slice(0,10);
      const end = u.searchParams.get('end') || start;
      if (!ENDPOINTS[type]) return json(res, 400, { error:'Unsupported report type', allowed:Object.keys(ENDPOINTS) });
      let rows = await getReport(type, start, end);
      rows = filterRows(rows, u.searchParams);
      if (pathname === '/api/export') {
        const format = String(u.searchParams.get('format') || 'xlsx').toLowerCase();
        if (format === 'csv') {
          const data = Buffer.from('\uFEFF' + asCsv(rows), 'utf8');
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filenamePart(start)}_${filenamePart(type)}_qci_ereport.csv"`,
            'Content-Length': data.length
          });
          return res.end(data);
        }
        if (format !== 'xlsx') return json(res, 400, { error:'Unsupported export format', allowed:['xlsx','csv'] });
        const data = Buffer.from(await asXlsx(rows, {
          type,
          start,
          end,
          search: u.searchParams.get('search'),
          status: u.searchParams.get('status'),
          summary: summarize(rows)
        }));
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filenamePart(start)}_${filenamePart(type)}_qci_ereport.xlsx"`,
          'Content-Length': data.length
        });
        return res.end(data);
      }
      return json(res, 200, { type, start, end, mode:DATA_MODE, summary:summarize(rows), rows:rows.map(publicRow) });
    }

    if (serveStatic(req, res, pathname)) return;
    json(res, 404, { error:'Not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.name === 'AbortError' ? 'Data source timeout' : err.message });
  }
});

server.listen(PORT, SERVER_HOST, () => {
  console.log(`QCI E-Report listening on ${SERVER_HOST}:${PORT}`);
  console.log(`Local : http://127.0.0.1:${PORT}`);
  if (SERVER_HOST !== '127.0.0.1' && SERVER_HOST !== 'localhost') {
    const lan = getLanAddresses();
    console.log(`LAN   : ${lan.length ? lan.map(ip => `http://${ip}:${PORT}`).join(', ') : `http://<IP-PC-KANTOR>:${PORT}`}`);
  }
  console.log(`DATA_MODE=${DATA_MODE}`);
  if (DATA_MODE === 'legacy-api') console.log(`LEGACY_API_BASE=${LEGACY_API_BASE}`);
});
