'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const ExcelJS = require('exceljs');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function freePort() {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise(resolve => server.close(resolve));
  return port;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server start timed out:\n${output}`)), 10000);
    const onData = chunk => {
      output += chunk.toString();
      if (output.includes('QCI E-Report listening')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with code ${code}:\n${output}`));
    });
  });
}

function headerColumn(worksheet, header) {
  const values = worksheet.getRow(1).values;
  const index = values.findIndex(value => value === header);
  assert.notEqual(index, -1, `Missing ${header} column`);
  return index;
}

test('Excel export preserves numeric zero and fills missing cells with zero', async t => {
  const legacyApi = http.createServer((req, res) => {
    const rows = req.url.includes('q1st-vdm-data') ? [{
      ID_LAP: 'VDM-ZERO-ROW',
      GOOD_KERNEL: 92.6,
      MOLD_DAMAGE: 0
    }] : [{
      DataKey: 'ZERO-ROW',
      id_Lap: 'ZERO-ROW',
      MoistureAvg: 0,
      Moisture: 0
    }];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows));
  });
  const legacyPort = await listen(legacyApi);
  t.after(() => new Promise(resolve => legacyApi.close(resolve)));

  const appPort = await freePort();
  const child = spawn(process.execPath, [
    'server.js',
    '--port', String(appPort),
    '--local',
    '--data-mode', 'legacy-api',
    '--legacy-api-base', `http://127.0.0.1:${legacyPort}`
  ], { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await waitForServer(child);

  const response = await fetch(
    `http://127.0.0.1:${appPort}/api/export?type=moisture&start=2026-10-06&end=2026-10-06&format=xlsx`
  );
  assert.equal(response.status, 200);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const worksheet = workbook.getWorksheet('RawData');
  assert.ok(worksheet, 'RawData worksheet should exist');

  assert.equal(worksheet.getCell(2, headerColumn(worksheet, 'MoistureAvg')).value, 0);
  assert.equal(worksheet.getCell(2, headerColumn(worksheet, 'Raw Data 1')).value, 0);
  assert.equal(worksheet.getCell(2, headerColumn(worksheet, 'Raw Data 2')).value, 0);
  assert.equal(worksheet.getCell(2, headerColumn(worksheet, 'Category')).value, 0);

  const vdmResponse = await fetch(
    `http://127.0.0.1:${appPort}/api/export?type=vdm&start=2026-10-06&end=2026-10-06&format=xlsx`
  );
  assert.equal(vdmResponse.status, 200);

  const vdmWorkbook = new ExcelJS.Workbook();
  await vdmWorkbook.xlsx.load(Buffer.from(await vdmResponse.arrayBuffer()));
  const vdmWorksheet = vdmWorkbook.getWorksheet('VDM Raw Data Format');
  assert.ok(vdmWorksheet, 'VDM Raw Data Format worksheet should exist');

  assert.equal(vdmWorksheet.getCell(2, headerColumn(vdmWorksheet, '01 Good Kernel (%)')).value, 92.6);
  assert.equal(vdmWorksheet.getCell(2, headerColumn(vdmWorksheet, '03 Mold damage (%)')).value, 0);
  assert.equal(vdmWorksheet.getCell(2, headerColumn(vdmWorksheet, '04 Mold damage strong (%)')).value, 0);
  assert.equal(vdmWorksheet.getCell(2, headerColumn(vdmWorksheet, '06 Insect damage (%)')).value, 0);
  assert.equal(vdmWorksheet.getCell(2, headerColumn(vdmWorksheet, '07 Insect damage severe (%)')).value, 0);
});
