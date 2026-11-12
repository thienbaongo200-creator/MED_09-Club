'use strict';

const assert = require('node:assert/strict');
const { hash } = require('../backend/node_modules/bcryptjs');
const {
  createTestPool,
  initializeRunContext,
  finishRunContext,
  memberEmail,
  memberEmailPattern,
  readComposeTestEnv,
  runLabel,
  verifyBackendDatabase,
  verifyRunnerDatabase,
} = require('./test-environment.cjs');

module.exports = async function globalSetup() {
  const backendIdentity = verifyBackendDatabase();
  initializeRunContext();
  let pool;
  let fixturesCommitted = false;
  try {
    const env = readComposeTestEnv();
    pool = createTestPool();
    await verifyRunnerDatabase(pool, backendIdentity);

    const api = await fetch(env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, '') + '/health');
    assert.equal(api.status, 200, 'Compose API health check failed; refusing E2E fixture writes.');
    const frontend = await fetch(`http://localhost:${env.FRONTEND_HOST_PORT}/login`);
    assert.equal(frontend.status, 200, 'Compose frontend is not ready; refusing E2E fixture writes.');

    const runPrefix = runLabel();
    const existing = await pool.query(
      `SELECT
         (SELECT count(*) FROM dbo.thanh_vien WHERE email LIKE $1) +
         (SELECT count(*) FROM dbo.su_kien WHERE ten LIKE $2) +
         (SELECT count(*) FROM dbo.de_xuat_chi WHERE tieu_de LIKE $2) +
         (SELECT count(*) FROM dbo.giao_dich_quy WHERE noi_dung LIKE $2) AS count`,
      [memberEmailPattern(), `${runPrefix}%`],
    );
    assert.equal(Number(existing.rows[0].count), 0, 'This E2E run id already has fixtures; refusing to reuse or remove them.');
    const transaction = await pool.connect();
    try {
      await transaction.query('BEGIN');
      const passwordHash = await hash('med09-e2e-password', 4);
      const accounts = [
        ['admin', 'ADMIN', 'ACTIVE'],
        ['treasurer', 'THU_QUY', 'ACTIVE'],
        ['member1', 'THANH_VIEN', 'ACTIVE'],
        ['member2', 'THANH_VIEN', 'ACTIVE'],
        ['member3', 'THANH_VIEN', 'ACTIVE'],
        ['inactive', 'THANH_VIEN', 'INACTIVE'],
      ];
      for (const [roleName, role, status] of accounts) {
        await transaction.query(
          `INSERT INTO dbo.thanh_vien(ho_ten,email,mat_khau_hash,vai_tro,trang_thai)
           VALUES($1,$2,$3,$4,$5)`,
          [`${runPrefix} ${roleName}`, memberEmail(roleName), passwordHash, role, status],
        );
      }
      const treasurerId = await transaction.query('SELECT id FROM dbo.thanh_vien WHERE email=$1', [memberEmail('treasurer')]);
      assert.ok(treasurerId.rows[0]?.id, 'E2E treasurer fixture insert failed.');
      await transaction.query(
        `INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id)
         VALUES('THU',1000,$1,$2)`,
        [`${runPrefix} opening balance`, treasurerId.rows[0].id],
      );
      await transaction.query('COMMIT');
      fixturesCommitted = true;
    } catch (error) {
      await transaction.query('ROLLBACK');
      throw error;
    } finally {
      transaction.release();
    }
  } catch (error) {
    if (!fixturesCommitted) finishRunContext();
    throw error;
  } finally {
    if (pool) await pool.end();
  }
};
