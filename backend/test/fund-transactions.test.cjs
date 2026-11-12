const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ForbiddenException, UnprocessableEntityException } = require('@nestjs/common');
const { FundsService } = require('../dist/funds/funds.service.js');
const { SearchService } = require('../dist/funds/search.service.js');
const { MaskingPolicy } = require('../dist/funds/masking.policy.js');

test('masks formatted phone numbers in statement text and SQL search redaction', () => {
  const formattedPhone = '090.123.4567';
  assert.ok(!MaskingPolicy.maskFreeText(`Contact ${formattedPhone}`).includes(formattedPhone));
  const predicate = new SearchService().buildStatementPredicate(formattedPhone, 1);
  assert.ok(predicate.sql.includes('[+]?[0-9][0-9 .()-]{7,}[0-9]'));
});

function serviceWithClient(handler) {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql: String(sql), values });
      return handler(String(sql), values, calls);
    },
    release() {},
  };
  const pool = { connect: async () => client };
  return { service: new FundsService(pool, {}), calls };
}

test('edits a manual transaction under the shared fund lock and records the actor', async () => {
  const { service, calls } = serviceWithClient((sql) => {
    if (sql.includes('SELECT id,loai,so_tien,de_xuat_id')) return { rows: [{ id: 'tx-1', loai: 'CHI', so_tien: '30', de_xuat_id: null }] };
    if (sql.includes('AS balance')) return { rows: [{ balance: '70' }] };
    if (sql.startsWith('UPDATE dbo.giao_dich_quy')) return { rows: [{ id: 'tx-1', loai: 'CHI', so_tien: '50', ngay_giao_dich: '2026-01-01' }] };
    return { rows: [] };
  });

  const result = await service.updateManualTransaction('tx-1', { loai: 'CHI', soTien: 50, noiDung: 'updated' }, 'actor-1');
  assert.equal(result.soTien, 50);
  assert.ok(calls.some(({ sql }) => sql.includes('pg_advisory_xact_lock')));
  assert.ok(calls.some(({ sql, values }) => sql.startsWith('UPDATE dbo.giao_dich_quy') && values[4] === 'actor-1'));
  assert.ok(calls.some(({ sql }) => sql === 'COMMIT'));
});

test('refuses an edit that would make the balance negative and rolls back', async () => {
  const { service, calls } = serviceWithClient((sql) => {
    if (sql.includes('SELECT id,loai,so_tien,de_xuat_id')) return { rows: [{ id: 'tx-1', loai: 'THU', so_tien: '80', de_xuat_id: null }] };
    if (sql.includes('AS balance')) return { rows: [{ balance: '100' }] };
    return { rows: [] };
  });

  await assert.rejects(service.updateManualTransaction('tx-1', { loai: 'CHI', soTien: 150, noiDung: 'too much' }, 'actor-1'), UnprocessableEntityException);
  assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
  assert.ok(!calls.some(({ sql }) => sql.startsWith('UPDATE dbo.giao_dich_quy')));
});

test('prevents editing a transaction produced by an approved proposal', async () => {
  const { service, calls } = serviceWithClient((sql) => sql.includes('SELECT id,loai,so_tien,de_xuat_id')
    ? { rows: [{ id: 'tx-1', loai: 'CHI', so_tien: '30', de_xuat_id: 'proposal-1' }] }
    : { rows: [] });

  await assert.rejects(service.updateManualTransaction('tx-1', { loai: 'CHI', soTien: 40, noiDung: 'edit' }, 'actor-1'), ForbiddenException);
  assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
});

test('reverses a transaction with the opposite type and a link to the original', async () => {
  const { service, calls } = serviceWithClient((sql) => {
    if (sql.includes('SELECT id,loai,so_tien FROM dbo.giao_dich_quy')) return { rows: [{ id: 'tx-1', loai: 'THU', so_tien: '40' }] };
    if (sql.includes('giao_dich_goc_id=$1')) return { rows: [] };
    if (sql.includes('AS balance')) return { rows: [{ balance: '100' }] };
    if (sql.startsWith('INSERT INTO dbo.giao_dich_quy')) return { rows: [{ id: 'tx-2', loai: 'CHI', so_tien: '40', ngay_giao_dich: '2026-01-01' }] };
    return { rows: [] };
  });

  const result = await service.reverseTransaction('tx-1', 'Điều chỉnh', 'actor-1');
  assert.equal(result.loai, 'CHI');
  assert.equal(result.giaoDichGocId, 'tx-1');
  const insert = calls.find(({ sql }) => sql.startsWith('INSERT INTO dbo.giao_dich_quy'));
  assert.match(insert.sql, /giao_dich_goc_id/);
  assert.equal(insert.values[4], 'tx-1');
});

test('prevents creating a second reversal for the same original transaction', async () => {
  const { service, calls } = serviceWithClient((sql) => {
    if (sql.includes('SELECT id,loai,so_tien FROM dbo.giao_dich_quy')) return { rows: [{ id: 'tx-1', loai: 'CHI', so_tien: '40' }] };
    if (sql.includes('giao_dich_goc_id=$1')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
    return { rows: [] };
  });

  await assert.rejects(service.reverseTransaction('tx-1', 'Điều chỉnh lần hai', 'actor-1'), UnprocessableEntityException);
  assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
  assert.ok(!calls.some(({ sql }) => sql.startsWith('INSERT INTO dbo.giao_dich_quy')));
});
