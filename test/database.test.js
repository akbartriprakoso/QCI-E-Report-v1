'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fetchDatabaseReport, parameterKey, probeDatabaseSource } = require('../database');

test('database source probe checks exactly the requested source', async () => {
  const calls = [];
  await probeDatabaseSource('bulk-s3', async (source, statement) => {
    calls.push({ source, statement });
    return [{ connected: 1 }];
  });

  assert.deepEqual(calls, [{ source: 'bulkS3', statement: 'SELECT 1 AS connected' }]);
});

test('database source probe rejects unknown source ids', async () => {
  await assert.rejects(probeDatabaseSource('bulk1', async () => []), /Unknown database source/);
});

test('direct database corn adapter merges DATAQC and BulkSampler rows', async () => {
  const calls = [];
  const query = async (source, statement, params) => {
    calls.push({ source, statement, params });
    if (source === 'dataqc' && statement.includes('TB_QC_INCOMING_TRUCK')) {
      return [
        { ID_LAP: 'CORN-1', MATERIAL: '101201', ENTRY_DATE: '2026-10-07', MOISTURE_FINAL: 29.1 },
        { ID_LAP: 'CORN-1', MATERIAL: '101201', ENTRY_DATE: '2026-10-07', MOISTURE_FINAL: 29.3 }
      ];
    }
    if (source === 'dataqc' && statement.includes('TB_QC_INCOMING_PARAM_CHECK')) {
      return [
        { ID_LAP: 'CORN-1', SAMPLING_STEP: '1', PARAMETER_CHECK: 'MOISTURE', PARAMETER_VALUE: 29.2 },
        { ID_LAP: 'CORN-1', SAMPLING_STEP: '2', PARAMETER_CHECK: 'DENSITY', PARAMETER_VALUE: 704 }
      ];
    }
    if (source === 'bulkS3') {
      return [{ ID_LAP: 'CORN-1', ShelterCode: 'S3', PoNumber: '45001' }];
    }
    if (source === 'bulkLocal') return [];
    throw new Error(`Unexpected query for ${source}`);
  };

  const rows = await fetchDatabaseReport('corn', '2026-10-07', '2026-10-07', { query });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ID_LAP, 'CORN-1');
  assert.equal(rows[0].ShelterCode, 'S3');
  assert.equal(rows[0].PoNumber, '45001');
  assert.equal(rows[0].MOISTURE, 29.2);
  assert.equal(rows[0].DENSITY2, 704);
  assert.deepEqual(rows[0].MOISTURE_FINAL, [29.1, 29.3]);
  assert.equal(calls.length, 4);
  calls.forEach(call => {
    assert.deepEqual(call.params, {
      startDate: '2026-10-07',
      endDateExclusive: '2026-10-08'
    });
  });
});

test('database adapter validates report dates before querying', async () => {
  let queried = false;
  await assert.rejects(
    fetchDatabaseReport('corn', '2026-10-08', '2026-10-07', {
      query: async () => {
        queried = true;
        return [];
      }
    }),
    /start date must not be after end date/
  );
  assert.equal(queried, false);
});

test('parameter names keep the legacy report column contract', () => {
  assert.equal(parameterKey('TEXTURE >3.35MM'), 'TEXTURE335MM');
  assert.equal(parameterKey('03 Mold damage (%)'), 'MOLD_DAMAGE');
  assert.equal(parameterKey('H-MOISTURE'), 'H_MOISTURE');
});
