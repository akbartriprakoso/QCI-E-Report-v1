'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'xm60.q1st.v1';
const MAX_BATCH = 200;

// Source payload label -> stored field. Matches Q1ST_FIELDS in XM60 Reader.
const FIELD_MAP = {
  ANALYSIS_ID: 'analysisId', ID_LAP: 'idLap', TRUCK_NO: 'truckNo', ENTRY_DATE: 'entryDate',
  PLANT: 'plant', PO: 'po', SUPPLIER: 'supplier', MATERIAL: 'material',
  MATERIAL_DESCRIPTION: 'materialDescription', QCDOC: 'qcdoc', OPERATOR: 'operator', SHIFT: 'shift',
  MOISTURE_PERCENT: 'moisturePercent', ORIGINAL_WEIGHT_G: 'originalWeightG',
  RESIDUAL_WEIGHT_G: 'residualWeightG', TEMPERATURE_C: 'temperatureC', DURATION_MIN: 'durationMin',
  XM60_METHOD: 'method', XM60_SERIAL_NUMBER: 'serialNumber', MEASUREMENT_NUMBER: 'measurementNumber',
  MEASUREMENT_DATE: 'measurementDate', MEASUREMENT_TIME: 'measurementTime', STOP_REASON: 'stopReason',
  RECEIVED_AT: 'receivedAt', SCAN_VALUE: 'scanValue', REGISTRATION_SOURCE: 'registrationSource'
};
const NUMERIC = ['moisturePercent', 'originalWeightG', 'residualWeightG', 'temperatureC', 'durationMin'];
const REQUIRED_TEXT = ['analysisId', 'idLap', 'truckNo', 'operator', 'shift', 'receivedAt'];

function normalizeResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('result must be an object');
  const record = {};
  for (const [label, key] of Object.entries(FIELD_MAP)) {
    const value = input[label];
    record[key] = value === undefined || value === null ? '' : value;
  }
  for (const key of REQUIRED_TEXT) {
    record[key] = String(record[key]).trim();
    if (!record[key]) throw new Error(`${key} is required`);
  }
  if (record.analysisId.length > 64) throw new Error('analysisId is too long');
  for (const key of NUMERIC) {
    const number = Number(record[key]);
    if (record[key] === '' || !Number.isFinite(number)) throw new Error(`${key} must be a number`);
    record[key] = number;
  }
  if (record.moisturePercent < -10 || record.moisturePercent > 100) throw new Error('moisturePercent is out of range');
  if (record.originalWeightG <= 0 || record.residualWeightG < 0) throw new Error('weight is out of range');
  if (Number.isNaN(Date.parse(record.receivedAt))) throw new Error('receivedAt must be an ISO date-time');
  for (const key of Object.values(FIELD_MAP)) {
    if (typeof record[key] === 'string') record[key] = record[key].trim().slice(0, 200);
  }
  return record;
}

function createPrecisaStore(dataDir) {
  const file = path.join(dataDir, 'precisa-measurements.ndjson');
  const records = new Map();

  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record.analysisId) records.set(record.analysisId, record);
      } catch {
        console.warn('Skipping unreadable line in precisa-measurements.ndjson');
      }
    }
  }

  function ingest(results) {
    if (!Array.isArray(results) || !results.length) throw new Error('results must be a non-empty array');
    if (results.length > MAX_BATCH) throw new Error(`results is limited to ${MAX_BATCH} items per request`);
    const outcome = [];
    const lines = [];
    results.forEach((item, index) => {
      let record;
      try {
        record = normalizeResult(item);
      } catch (error) {
        outcome.push({ index, analysisId: item && item.ANALYSIS_ID, status: 'rejected', error: error.message });
        return;
      }
      if (records.has(record.analysisId)) {
        outcome.push({ index, analysisId: record.analysisId, status: 'duplicate' });
        return;
      }
      record.storedAt = new Date().toISOString();
      records.set(record.analysisId, record);
      lines.push(JSON.stringify(record));
      outcome.push({ index, analysisId: record.analysisId, status: 'stored' });
    });
    if (lines.length) fs.appendFileSync(file, lines.join('\n') + '\n', 'utf8');
    return outcome;
  }

  function list({ start, end, search } = {}) {
    const from = start ? Date.parse(`${start}T00:00:00`) : -Infinity;
    const to = end ? Date.parse(`${end}T23:59:59.999`) : Infinity;
    const needle = String(search || '').trim().toLowerCase();
    return [...records.values()]
      .filter(r => {
        const time = Date.parse(r.receivedAt);
        if (time < from || time > to) return false;
        return !needle || [r.idLap, r.truckNo, r.po, r.supplier, r.materialDescription, r.qcdoc, r.operator]
          .some(v => String(v || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  }

  return { ingest, list, file, count: () => records.size };
}

module.exports = { createPrecisaStore, normalizeResult, SCHEMA_VERSION, MAX_BATCH };
