'use strict';

const sql = require('mssql');

const SOURCE_DEFINITIONS = {
  dataqc: {
    id: 'dataqc',
    name: 'DATAQC',
    role: 'Q1ST incoming QC + VDM',
    envPrefix: 'DATAQC_DB',
    defaultServer: '10.13.5.193',
    defaultDatabase: 'DATAQC',
    reports: ['corn', 'rmlocal', 'vdm']
  },
  bulkS3: {
    id: 'bulk-s3',
    name: 'BulkSampler20 S3',
    role: 'Automatic sampling + raw moisture (S3)',
    envPrefix: 'BULK_S3_DB',
    defaultServer: '10.13.10.167',
    defaultDatabase: 'BulkSampler20',
    reports: ['corn', 'moisture', 'vdm']
  },
  bulkLocal: {
    id: 'bulk-local',
    name: 'BulkSampler20',
    role: 'Automatic sampling + raw moisture',
    envPrefix: 'BULK_LOCAL_DB',
    defaultServer: '10.13.5.193',
    defaultDatabase: 'BulkSampler20',
    reports: ['corn', 'moisture']
  },
  production: {
    id: 'production',
    name: 'DATAPRODUKSI',
    role: 'Kett / Dryer',
    envPrefix: 'PRODUCTION_DB',
    defaultServer: '10.13.5.193',
    defaultDatabase: 'DATAPRODUKSI',
    reports: ['kett']
  }
};

const REPORT_SOURCES = {
  corn: ['dataqc', 'bulkS3', 'bulkLocal'],
  rmlocal: ['dataqc'],
  moisture: ['bulkS3', 'bulkLocal'],
  kett: ['production'],
  vdm: ['dataqc', 'bulkS3']
};

const pools = new Map();

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function envBoolean(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function sourceConfig(sourceName) {
  const definition = SOURCE_DEFINITIONS[sourceName];
  if (!definition) throw new Error(`Unknown database source: ${sourceName}`);
  const prefix = definition.envPrefix;
  return {
    user: process.env[`${prefix}_USER`] || process.env.DB_USER || '',
    password: process.env[`${prefix}_PASSWORD`] || process.env.DB_PASSWORD || '',
    server: process.env[`${prefix}_SERVER`] || definition.defaultServer,
    port: envNumber(`${prefix}_PORT`, envNumber('DB_PORT', 1433)),
    database: process.env[`${prefix}_DATABASE`] || definition.defaultDatabase,
    connectionTimeout: envNumber('DB_CONNECT_TIMEOUT_MS', 15000),
    requestTimeout: envNumber('DB_REQUEST_TIMEOUT_MS', 120000),
    pool: {
      min: envNumber('DB_POOL_MIN', 0),
      max: envNumber('DB_POOL_MAX', 10),
      idleTimeoutMillis: envNumber('DB_POOL_IDLE_TIMEOUT_MS', 30000)
    },
    options: {
      encrypt: envBoolean('DB_ENCRYPT', false),
      trustServerCertificate: envBoolean('DB_TRUST_SERVER_CERTIFICATE', true),
      enableArithAbort: true,
      useUTC: false
    }
  };
}

function missingConfiguration(sourceName) {
  const config = sourceConfig(sourceName);
  const missing = [];
  if (!config.user) missing.push(`${SOURCE_DEFINITIONS[sourceName].envPrefix}_USER or DB_USER`);
  if (!config.password) missing.push(`${SOURCE_DEFINITIONS[sourceName].envPrefix}_PASSWORD or DB_PASSWORD`);
  return missing;
}

function requiredSources(type) {
  const sources = REPORT_SOURCES[type];
  if (!sources) throw new Error(`Unsupported report type: ${type}`);
  return sources;
}

function databaseConfiguredFor(type) {
  return requiredSources(type).every(sourceName => missingConfiguration(sourceName).length === 0);
}

function databaseSources() {
  return Object.entries(SOURCE_DEFINITIONS).map(([sourceName, definition]) => {
    const config = sourceConfig(sourceName);
    return {
      id: definition.id,
      name: definition.name,
      role: definition.role,
      via: 'Direct read-only SQL Server',
      reports: definition.reports,
      server: config.server,
      database: config.database,
      configured: missingConfiguration(sourceName).length === 0
    };
  });
}

async function getPool(sourceName) {
  if (pools.has(sourceName)) return pools.get(sourceName);
  const missing = missingConfiguration(sourceName);
  if (missing.length) {
    throw new Error(`Database source ${SOURCE_DEFINITIONS[sourceName].name} is not configured. Set ${missing.join(' and ')}.`);
  }

  const pool = new sql.ConnectionPool(sourceConfig(sourceName));
  pool.on('error', error => {
    console.error(`SQL pool error (${SOURCE_DEFINITIONS[sourceName].name}):`, error.message);
  });
  const connection = pool.connect().catch(error => {
    pools.delete(sourceName);
    throw error;
  });
  pools.set(sourceName, connection);
  return connection;
}

async function queryDatabase(sourceName, statement, params = {}) {
  const pool = await getPool(sourceName);
  const request = pool.request();
  for (const [name, value] of Object.entries(params)) {
    if (/date/i.test(name)) request.input(name, sql.Date, value);
    else request.input(name, value);
  }
  const result = await request.query(statement);
  return result.recordset;
}

async function probeDatabaseSource(sourceId, query = queryDatabase) {
  const entry = Object.entries(SOURCE_DEFINITIONS).find(([, definition]) => definition.id === sourceId);
  if (!entry) throw new Error(`Unknown database source: ${sourceId}`);
  const [sourceName] = entry;
  return query(sourceName, 'SELECT 1 AS connected');
}

async function closeDatabasePools() {
  const openPools = [...pools.values()];
  pools.clear();
  await Promise.allSettled(openPools.map(async connection => (await connection).close()));
}

function parseDate(value, label) {
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`${label} must use YYYY-MM-DD format`);
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`${label} is not a valid date`);
  }
  return text;
}

function addDays(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}

function dateParams(start, end) {
  const startDate = parseDate(start, 'start');
  const endDate = parseDate(end, 'end');
  if (startDate > endDate) throw new Error('start date must not be after end date');
  return { startDate, endDateExclusive: addDays(endDate, 1) };
}

const MATERIALS = {
  101227: { MaterialName: 'Dry Corn', MaterialDescription: 'Yellow Corn (L)' },
  101201: { MaterialName: 'Wet Corn', MaterialDescription: 'Wet Corn (L)' },
  101205: { MaterialName: 'Dry Corn', MaterialDescription: 'Yellow Corn 16%' }
};

const PARAMETER_KEY_OVERRIDES = {
  'GRADE RAFRAKSI JAGUN': 'GRADE_REFRAKSI_JAGUNG',
  'GRADE RAF. JAGUNG (%': 'GRADE_RAF_JAGUNG',
  'TEXTURE >0.15 MM': 'TEXTURE015MM',
  'TEXTURE >0.50MM': 'TEXTURE050MM',
  'TEXTURE >0.85 MM': 'TEXTURE085MM',
  'TEXTURE >1.00MM': 'TEXTURE1MM',
  'TEXTURE >2.00MM': 'TEXTURE2MM',
  'TEXTURE >3.35MM': 'TEXTURE335MM',
  'TEXTURE > #100': 'TEXTURE100',
  'FINE PASS 1.00MM': 'FINE_PASS100MM',
  'SEVER MOLDY GRAIN': 'SEVERE_MOLDY_GRAIN',
  'TEXTURE >#60': 'TEXTURE60',
  'H-MOISTURE': 'H_MOISTURE',
  'PHYTIC P (AS IS)': 'PHYTIC_P_AS_IS',
  'MC (%)': 'MC',
  'TOTAL WEIGHT (GR)': 'TOTAL_WEIGHT',
  'ON 5 MM (GR)': 'ON5MM',
  'ON 2 MM (GR)': 'ON2MM',
  'PASS 2 MM (GR)': 'PASS2MM',
  'TRUE DENSITY (GR/L)': 'TRUE_DENSITY',
  'SAMPLE DENSITY (GR/L)': 'SAMPLE_DENSITY',
  'TOTAL COUNT (COUNT)': 'TOTAL_COUNT',
  '01 GOOD KERNEL (%)': 'GOOD_KERNEL',
  '02 BROKEN (%)': 'BROKEN',
  '03 MOLD DAMAGE (%)': 'MOLD_DAMAGE',
  '04 MOLD DAMAGE STRONG (%)': 'MOLD_DAMAGE_STRONG',
  '05 DAMAGED (%)': 'DAMAGED',
  '06 INSECT DAMAGE (%)': 'INSECT_DAMAGE',
  '07 INSECT DAMAGE SEVERE (%)': 'INSECT_DAMAGE_SEVERE',
  '08 MOLD DAMAGE SEVERE (COUNT)': 'MOLD_DAMAGE_SEVERE',
  '09 AD MIXTURE (%)': 'AD_MIXTURE',
  '10.BREEDING SEED (COUNT)': 'BREEDING_SEED',
  '11 MULTIPLES (COUNT)': 'MULTIPLES',
  '12 GLUMES (COUNT)': 'GLUMES',
  'WEIRD SEED (%)': 'WEIRD_SEED',
  '14 CHIPPED (%)': 'CHIPPED',
  '15 CRACKED (%)': 'CRACKED',
  '16 LIGHT DAMAGE (%)': 'LIGHT_DAMAGE',
  '17 LIGHT MOLD (%)': 'LIGHT_MOLD',
  '18 WHITE STRIPED MOLD (%)': 'WHITE_STRIPED_MOLD',
  '19 MATERIAL 2-5MM (%)': 'MATERIAL_25MM',
  '20 MATERIAL <2MM (%)': 'MATERIAL_UNDER_2MM',
  'SEVERE DAMAGE (COUNT)': 'SEVERE_DAMAGE',
  'BREEDING SEED (COUNT)': 'BREEDING_SEED_C'
};

function parameterKey(value) {
  const label = String(value || '').trim().toUpperCase();
  return PARAMETER_KEY_OVERRIDES[label] || label
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function indexBy(rows, key) {
  return new Map(rows.map(row => [String(row[key] ?? ''), row]));
}

function pivotParameters(rows, suffixSamplingTwo = false) {
  const result = new Map();
  for (const row of rows) {
    const id = String(row.ID_LAP ?? '');
    if (!id) continue;
    const values = result.get(id) || {};
    const suffix = suffixSamplingTwo && String(row.SAMPLING_STEP) === '2' ? '2' : '';
    const key = `${parameterKey(row.PARAMETER_CHECK)}${suffix}`;
    if (key) values[key] = row.PARAMETER_VALUE;
    result.set(id, values);
  }
  return result;
}

async function fetchCorn(params, query) {
  const [baseRows, parameterRows, bulkS3Rows, bulkLocalRows] = await Promise.all([
    query('dataqc', `
      SELECT A.ID_LAP, A.QCDOC, A.TRUCK_NO, A.TRUCK_TYPE, A.SUPPLIER, A.MATERIAL,
             A.MATERIAL_DESCRIPTION, A.PACK, A.QUANTITY, A.QTYBAG, A.ENTRY_DATE,
             A.LAST_UPD, A.SAMPLING_1_RESULT, A.SAMPLING_2_RESULT, A.TEST_RESULT,
             A.TEST_REASON, C.MOISTURE_FINAL
      FROM [dbo].[TB_QC_INCOMING_TRUCK] A
      LEFT JOIN [dbo].[TB_QC_INCOMING_MOISTURE] C ON A.ID_LAP = C.ID_LAP
      WHERE A.ENTRY_DATE >= @startDate AND A.ENTRY_DATE < @endDateExclusive
        AND A.MATERIAL IN ('101201', '101205', '101227')
      ORDER BY A.ENTRY_DATE, A.ID_LAP
    `, params),
    query('dataqc', `
      SELECT ID_LAP, SAMPLING_STEP, PARAMETER_CHECK, PARAMETER_VALUE, LAST_UPD
      FROM [dbo].[TB_QC_INCOMING_PARAM_CHECK]
      WHERE LAST_UPD >= @startDate AND LAST_UPD < @endDateExclusive
        AND SAMPLING_STEP IN ('1', '2')
      ORDER BY LAST_UPD
    `, params),
    query('bulkS3', `
      SELECT ID_LAP, ShelterCode, PoNumber
      FROM [dbo].[TruckId]
      WHERE TimeStart >= @startDate AND TimeStart < @endDateExclusive
    `, params),
    query('bulkLocal', `
      SELECT ID_LAP, ShelterCode, PoNumber
      FROM [dbo].[TruckId]
      WHERE TimeStart >= @startDate AND TimeStart < @endDateExclusive
    `, params)
  ]);

  const parameters = pivotParameters(parameterRows, true);
  const bulkS3 = indexBy(bulkS3Rows, 'ID_LAP');
  const bulkLocal = indexBy(bulkLocalRows, 'ID_LAP');
  const grouped = new Map();
  for (const row of baseRows) {
    const id = String(row.ID_LAP ?? '');
    let item = grouped.get(id);
    if (!item) {
      const bulk = bulkS3.get(id) || bulkLocal.get(id) || {};
      item = {
        ...row,
        ShelterCode: bulk.ShelterCode ?? null,
        PoNumber: bulk.PoNumber ?? null,
        ...(parameters.get(id) || {}),
        MOISTURE_FINAL: []
      };
      grouped.set(id, item);
    }
    if (row.MOISTURE_FINAL !== null && row.MOISTURE_FINAL !== undefined) {
      item.MOISTURE_FINAL.push(row.MOISTURE_FINAL);
    }
  }
  return [...grouped.values()];
}

async function fetchRmLocal(params, query) {
  const [baseRows, parameterRows] = await Promise.all([
    query('dataqc', `
      SELECT ID_LAP, QCDOC, TRUCK_NO, TRUCK_TYPE, PO, SUPPLIER, MATERIAL,
             MATERIAL_DESCRIPTION, PACK, QUANTITY, QTYBAG, ENTRY_DATE, LAST_UPD,
             SAMPLING_1_RESULT, SAMPLING_2_RESULT, TEST_RESULT, TEST_REASON,
             SAMPLING_1_REASON, DRIVER_NAME, DO_REFF, SLOC
      FROM [dbo].[TB_QC_INCOMING_TRUCK]
      WHERE ENTRY_DATE >= @startDate AND ENTRY_DATE < @endDateExclusive
        AND MATERIAL NOT IN ('101201', '101205', '101227')
      ORDER BY ENTRY_DATE, ID_LAP
    `, params),
    query('dataqc', `
      SELECT ID_LAP, SAMPLING_STEP, PARAMETER_CHECK, PARAMETER_VALUE, LAST_UPD
      FROM [dbo].[TB_QC_INCOMING_PARAM_CHECK]
      WHERE LAST_UPD >= @startDate AND LAST_UPD < @endDateExclusive
        AND SAMPLING_STEP IN ('1', '2')
      ORDER BY LAST_UPD
    `, params)
  ]);
  const parameters = pivotParameters(parameterRows, true);
  return baseRows.map(row => ({ ...row, ...(parameters.get(String(row.ID_LAP ?? '')) || {}) }));
}

function groupMoistureRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.DataKey ?? '');
    let item = grouped.get(key);
    if (!item) {
      const material = MATERIALS[String(row.MaterialCode || '').trim()] || {};
      item = {
        ...row,
        MaterialName: material.MaterialName || '',
        MaterialDescription: material.MaterialDescription || '',
        Moisture: []
      };
      grouped.set(key, item);
    }
    if (row.Moisture !== null && row.Moisture !== undefined) item.Moisture.push(row.Moisture);
  }
  return [...grouped.values()];
}

async function fetchMoisture(params, query) {
  const statement = `
    SELECT A.DataKey, A.ShelterCode, A.TruckNo, A.PoNumber, A.TimeStart, A.TimeEnd,
           A.OperatorName, A.MaterialCode, A.MoistureMax, A.MoistureMin, A.MoistureAvg,
           A.QuantityRawData, A.id_Lap, B.Moisture
    FROM [dbo].[TruckID] A
    JOIN [dbo].[RawData] B ON A.DataKey = B.DataKey
    WHERE A.TimeStart >= @startDate AND A.TimeStart < @endDateExclusive
    ORDER BY A.TimeStart, A.DataKey
  `;
  const [s3Rows, localRows] = await Promise.all([
    query('bulkS3', statement, params),
    query('bulkLocal', statement, params)
  ]);
  return groupMoistureRows([
    ...s3Rows.map(row => ({ ...row, ShelterCode: 'S3' })),
    ...localRows
  ]);
}

async function fetchKett(params, query) {
  const rows = await query('production', `
    SELECT A.id_lap, A.tgl, A.shift, A.operator, A.mc_drier, A.po,
           B.kett_id, B.kett_calibration, B.test_stage, B.moisture,
           B.kett_reading, B.m_adjustment
    FROM [dbo].[TB_LAP_DRIER] A
    JOIN [dbo].[TB_LAP_DRIER_D] B ON A.id_lap = B.id_lap
    WHERE A.tgl >= @startDate AND A.tgl < @endDateExclusive
      AND B.test_stage IN ('IN', 'OUT')
    ORDER BY A.tgl, A.id_lap, B.test_stage
  `, params);
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.id_lap}-${row.test_stage}`;
    let item = grouped.get(key);
    if (!item) {
      item = {
        ...row,
        ID_LAP: row.id_lap,
        tanggal: row.tgl,
        PO: row.po,
        TEST_STAGE: row.test_stage,
        moisture: [],
        kett_reading: [],
        m_adjustment: []
      };
      grouped.set(key, item);
    }
    if (row.moisture !== null && row.moisture !== undefined) item.moisture.push(row.moisture);
    if (row.kett_reading !== null && row.kett_reading !== undefined) item.kett_reading.push(row.kett_reading);
    if (row.m_adjustment !== null && row.m_adjustment !== undefined) item.m_adjustment.push(row.m_adjustment);
  }
  return [...grouped.values()];
}

async function fetchVdm(params, query) {
  const [baseRows, detailRows, incomingRows, qcRows, screenRows] = await Promise.all([
    query('dataqc', `
      SELECT ID_LAP, ID_ANTRIAN, SAMPLE_DATE, START_TIME, END_TIME, VDM_NO,
             PROTOCOL_NO, PO, TRUCK_NO, REMARKS, NOTE
      FROM [dbo].[TB_QC_INCOMING_VDM_RAW]
      WHERE SAMPLE_DATE >= @startDate AND SAMPLE_DATE < @endDateExclusive
      ORDER BY SAMPLE_DATE, ID_LAP
    `, params),
    query('dataqc', `
      SELECT D.ID_LAP, D.PARAMETER_CHECK, D.PARAMETER_VALUE
      FROM [dbo].[TB_QC_INCOMING_VDM_RAW_D] D
      JOIN [dbo].[TB_QC_INCOMING_VDM_RAW] H ON H.ID_LAP = D.ID_LAP
      WHERE H.SAMPLE_DATE >= @startDate AND H.SAMPLE_DATE < @endDateExclusive
    `, params),
    query('dataqc', `
      SELECT ID_LAP, SUPPLIER, MATERIAL
      FROM [dbo].[TB_QC_INCOMING_TRUCK]
      WHERE ENTRY_DATE >= @startDate AND ENTRY_DATE < @endDateExclusive
    `, params),
    query('dataqc', `
      SELECT ID_LAP, SAMPLING_STEP, PARAMETER_CHECK, PARAMETER_VALUE, LAST_UPD
      FROM [dbo].[TB_QC_INCOMING_PARAM_CHECK]
      WHERE LAST_UPD >= @startDate AND LAST_UPD < @endDateExclusive
        AND SAMPLING_STEP = '1'
      ORDER BY LAST_UPD
    `, params),
    query('bulkS3', `
      SELECT ID_LAP, TOTAL_G, BROKEN_G, FOREIGN_G, TOTAL_P, BROKEN_P, FOREIGN_P,
             TEMPERATURE_AVG, START_PROC, END_PROC
      FROM [dbo].[TB_ABS_SCREEN_T]
      WHERE START_PROC >= @startDate AND START_PROC < @endDateExclusive
    `, params)
  ]);

  const details = pivotParameters(detailRows);
  const incoming = indexBy(incomingRows, 'ID_LAP');
  const qc = pivotParameters(qcRows);
  const screen = indexBy(screenRows, 'ID_LAP');

  function byEither(map, primary, secondary) {
    if (primary && map.has(primary)) return map.get(primary);
    if (secondary && map.has(secondary)) return map.get(secondary);
    return {};
  }

  return baseRows.map(row => {
    const id = String(row.ID_LAP ?? '');
    const relatedId = String(row.ID_ANTRIAN ?? '');
    const incomingRow = byEither(incoming, id, relatedId);
    const screenRow = byEither(screen, id, relatedId);
    return {
      ...row,
      ...(details.get(id) || {}),
      SUPPLIER: incomingRow.SUPPLIER ?? null,
      MATERIAL: incomingRow.MATERIAL ?? null,
      ...(byEither(qc, id, relatedId) || {}),
      TOTAL_G: screenRow.TOTAL_G ?? null,
      BROKEN_G: screenRow.BROKEN_G ?? null,
      FOREIGN_G: screenRow.FOREIGN_G ?? null,
      TOTAL_P: screenRow.TOTAL_P ?? null,
      BROKEN_P: screenRow.BROKEN_P ?? null,
      FOREIGN_P: screenRow.FOREIGN_P ?? null,
      TEMPERATURE_AVG: screenRow.TEMPERATURE_AVG ?? null,
      START_PROC: screenRow.START_PROC ?? null,
      END_PROC: screenRow.END_PROC ?? null
    };
  });
}

async function fetchDatabaseReport(type, start, end, options = {}) {
  requiredSources(type);
  const params = dateParams(start, end);
  const query = options.query || queryDatabase;
  if (type === 'corn') return fetchCorn(params, query);
  if (type === 'rmlocal') return fetchRmLocal(params, query);
  if (type === 'moisture') return fetchMoisture(params, query);
  if (type === 'kett') return fetchKett(params, query);
  if (type === 'vdm') return fetchVdm(params, query);
  throw new Error(`Unsupported report type: ${type}`);
}

module.exports = {
  closeDatabasePools,
  databaseConfiguredFor,
  databaseSources,
  fetchDatabaseReport,
  parameterKey,
  probeDatabaseSource
};
