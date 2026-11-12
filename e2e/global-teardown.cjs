'use strict';

const assert = require('node:assert/strict');
const {
  createTestPool,
  memberEmailPattern,
  runLabel,
  verifyBackendDatabase,
  verifyRunnerDatabase,
  finishRunContext,
} = require('./test-environment.cjs');

module.exports = async function globalTeardown() {
  const backendIdentity = verifyBackendDatabase();
  const pool = createTestPool();
  const client = await pool.connect();
  const runPrefix = `${runLabel()}%`;
  try {
    await verifyRunnerDatabase(client, backendIdentity);
    await client.query('BEGIN');
    try {
      const memberIds = (await client.query('SELECT id FROM dbo.thanh_vien WHERE email LIKE $1', [memberEmailPattern()])).rows.map((row) => row.id);
      const eventIds = (await client.query('SELECT id FROM dbo.su_kien WHERE ten LIKE $1', [runPrefix])).rows.map((row) => row.id);
      const proposalIds = (await client.query('SELECT id FROM dbo.de_xuat_chi WHERE tieu_de LIKE $1', [runPrefix])).rows.map((row) => row.id);
      const transactionIds = (await client.query(
        `SELECT id FROM dbo.giao_dich_quy
         WHERE noi_dung LIKE $1 OR de_xuat_id = ANY($2::uuid[])`,
        [runPrefix, proposalIds],
      )).rows.map((row) => row.id);

      let transactionCount = 0;
      let voteCount = 0;
      let proposalCount = 0;
      let registrationCount = 0;
      let eventCount = 0;
      let memberCount = 0;

      if (transactionIds.length) {
        const attachedVouchers = await client.query('SELECT count(*)::int AS count FROM dbo.chung_tu WHERE giao_dich_id = ANY($1::uuid[])', [transactionIds]);
        assert.equal(attachedVouchers.rows[0].count, 0, 'Scoped cleanup found a voucher object; leaving fixtures untouched for explicit object cleanup.');
        await client.query('DELETE FROM dbo.giao_dich_quy WHERE giao_dich_goc_id = ANY($1::uuid[]) AND noi_dung LIKE $2', [transactionIds, runPrefix]);
        transactionCount = (await client.query('DELETE FROM dbo.giao_dich_quy WHERE id = ANY($1::uuid[])', [transactionIds])).rowCount;
      }
      if (proposalIds.length) {
        voteCount = (await client.query('DELETE FROM dbo.bieu_quyet WHERE de_xuat_id = ANY($1::uuid[])', [proposalIds])).rowCount;
        proposalCount = (await client.query('DELETE FROM dbo.de_xuat_chi WHERE id = ANY($1::uuid[])', [proposalIds])).rowCount;
      }
      if (eventIds.length || memberIds.length) {
        registrationCount = (await client.query(
          `DELETE FROM dbo.su_kien_thanh_vien
           WHERE su_kien_id = ANY($1::uuid[]) OR thanh_vien_id = ANY($2::uuid[])`,
          [eventIds, memberIds],
        )).rowCount;
      }
      if (eventIds.length) eventCount = (await client.query('DELETE FROM dbo.su_kien WHERE id = ANY($1::uuid[])', [eventIds])).rowCount;
      if (memberIds.length) memberCount = (await client.query('DELETE FROM dbo.thanh_vien WHERE id = ANY($1::uuid[])', [memberIds])).rowCount;

      const residual = await client.query(
        `SELECT
           (SELECT count(*) FROM dbo.thanh_vien WHERE email LIKE $1) +
           (SELECT count(*) FROM dbo.su_kien WHERE ten LIKE $2) +
           (SELECT count(*) FROM dbo.de_xuat_chi WHERE tieu_de LIKE $2) +
           (SELECT count(*) FROM dbo.giao_dich_quy WHERE noi_dung LIKE $2) AS count`,
        [memberEmailPattern(), runPrefix],
      );
      assert.equal(Number(residual.rows[0].count), 0, 'Current E2E run still has tagged rows after scoped cleanup.');
      await client.query('COMMIT');

      console.log(`E2E scoped cleanup completed: ${JSON.stringify({ members: memberCount, events: eventCount, registrations: registrationCount, proposals: proposalCount, votes: voteCount, transactions: transactionCount })}`);
      finishRunContext();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
};
