'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createPrecisaStore } = require('../precisa-store');

function result(overrides = {}) {
  return {
    ANALYSIS_ID: 'a-1', ID_LAP: 'KRN-1', TRUCK_NO: 'B 1234 CD', ENTRY_DATE: '2026-10-23 08:00:00',
    PLANT: '1742', PO: 'PO-1', SUPPLIER: 'Supplier', MATERIAL: '101201', MATERIAL_DESCRIPTION: 'Corn',
    QCDOC: 'QC1', OPERATOR: 'Op', SHIFT: '1', MOISTURE_PERCENT: 14.2, ORIGINAL_WEIGHT_G: 10,
    RESIDUAL_WEIGHT_G: 8.6, TEMPERATURE_C: 130, DURATION_MIN: 5, XM60_METHOD: 'M1',
    XM60_SERIAL_NUMBER: 'SN1', MEASUREMENT_NUMBER: '1', MEASUREMENT_DATE: '23.10.2026',
    MEASUREMENT_TIME: '08:10:00', STOP_REASON: 'auto', RECEIVED_AT: '2026-10-23T08:11:00+07:00',
    SCAN_VALUE: 'KRN-1', REGISTRATION_SOURCE: 'DATAQC', ...overrides
  };
}

test('precisa store validates, deduplicates and persists measurements', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precisa-'));
  const store = createPrecisaStore(dir);
  const outcome = store.ingest([result(), result(), result({ ANALYSIS_ID: 'a-2', MOISTURE_PERCENT: 'abc' })]);
  assert.deepEqual(outcome.map(x => x.status), ['stored', 'duplicate', 'rejected']);
  assert.equal(createPrecisaStore(dir).count(), 1);
  assert.equal(store.list({ start: '2026-10-23', end: '2026-10-23' }).length, 1);
  assert.equal(store.list({ start: '2026-10-24', end: '2026-10-24' }).length, 0);
  assert.equal(store.list({ search: 'krn-1' }).length, 1);
});

test('precisa store accepts daily validation without truck identity and filters by type', () => {
  const store = createPrecisaStore(fs.mkdtempSync(path.join(os.tmpdir(), 'precisa-val-')));
  const validation = result({
    ANALYSIS_ID: 'v-1', ID_LAP: null, TRUCK_NO: null, RECORD_TYPE: 'DAILY_VALIDATION', SAMPLE_NAME: '',
    ORIGINAL_WEIGHT_G: 0, MOISTURE_PERCENT: null
  });
  const outcome = store.ingest([result(), validation, result({ ANALYSIS_ID: 'x', ID_LAP: '', RECORD_TYPE: 'TRUCK' })]);
  assert.deepEqual(outcome.map(x => x.status), ['stored', 'stored', 'rejected']);
  const rows = store.list({ recordType: 'DAILY_VALIDATION' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sampleName, 'TANPA SAMPLE');
  assert.equal(rows[0].moisturePercent, null);
  assert.equal(store.list({ recordType: 'TRUCK' }).length, 1);
  assert.equal(store.list({}).length, 2);
});

test('precisa API requires the API key and stores posted results', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precisa-api-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.js', '--port', String(port), '--local'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_MODE: 'demo', PRECISA_API_KEY: 'secret-key', PRECISA_DATA_DIR: dir },
    stdio: 'ignore'
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 300; i += 1) {
      try { await fetch(`${base}/api/health`); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    const body = JSON.stringify({ schema_version: 'xm60.q1st.v1', results: [{ idempotency_key: 'a-1', result: result() }] });
    const headers = { 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/api/precisa/measurements`, { method: 'POST', headers, body })).status, 401);
    const ok = await fetch(`${base}/api/precisa/measurements`, { method: 'POST', headers: { ...headers, 'X-API-Key': 'secret-key' }, body });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).stored, 1);
    const again = await (await fetch(`${base}/api/precisa/measurements`, { method: 'POST', headers: { ...headers, 'X-API-Key': 'secret-key' }, body })).json();
    assert.equal(again.duplicates, 1);
    const list = await (await fetch(`${base}/api/precisa/measurements?start=2026-10-23&end=2026-10-23`)).json();
    assert.equal(list.rows.length, 1);
    assert.equal(list.rows[0].moisturePercent, 14.2);
  } finally {
    child.kill();
  }
});
