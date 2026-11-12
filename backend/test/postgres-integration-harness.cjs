'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  COMPOSE_PROJECT,
  TEST_DATABASE,
  createTestPool,
  readComposeTestEnv,
  testDatabaseUrl,
  verifyBackendDatabase,
  verifyRunnerDatabase,
} = require('../../e2e/test-environment.cjs');

const ROOT = path.resolve(__dirname, '../..');
const RUN_LOCK = path.join(ROOT, 'test-results', '.med09-database-test.lock');

async function databaseSnapshot(pool) {
  const { rows } = await pool.query(`
    SELECT current_database() AS db, current_schema() AS schema,
      (SELECT count(*)::int FROM dbo.thanh_vien) AS members,
      (SELECT count(*)::int FROM dbo.su_kien) AS events,
      (SELECT count(*)::int FROM dbo.de_xuat_chi) AS proposals,
      (SELECT count(*)::int FROM dbo.giao_dich_quy) AS transactions,
      (SELECT count(*)::int FROM dbo.chung_tu) AS vouchers,
      COALESCE((SELECT SUM(so_tien) FILTER (WHERE loai='THU') FROM dbo.giao_dich_quy),0) -
      COALESCE((SELECT SUM(so_tien) FILTER (WHERE loai='CHI') FROM dbo.giao_dich_quy),0) AS balance`);
  return rows[0];
}

async function createIntegrationHarness() {
  const env = readComposeTestEnv();
  assert.equal(env.POSTGRES_DB, TEST_DATABASE, 'Integration tests require med09_docker_test.');
  const backendIdentity = verifyBackendDatabase();
  fs.mkdirSync(path.dirname(RUN_LOCK), { recursive: true });
  let lockFd;
  try {
    lockFd = fs.openSync(RUN_LOCK, 'wx');
    fs.writeSync(lockFd, JSON.stringify({ suite: 'postgres-integration', startedAt: new Date().toISOString() }));
  } catch {
    throw new Error('Another MED-09 database test run owns the shared test database; inspect the lock before retrying.');
  } finally {
    if (lockFd !== undefined) fs.closeSync(lockFd);
  }

  const pool = createTestPool();
  let canReleaseLock = false;
  try {
    const runnerIdentity = await verifyRunnerDatabase(pool, backendIdentity);
    const appUrl = testDatabaseUrl(env);
    const baseline = await databaseSnapshot(pool);
    assert.equal(baseline.db, TEST_DATABASE);
    assert.equal(baseline.schema, 'dbo');

    const runId = randomBytes(8).toString('hex');
    const runPrefix = `MED09PG-${runId}`;
    const existing = await pool.query(`
      SELECT
        (SELECT count(*) FROM dbo.thanh_vien WHERE email LIKE $1) +
        (SELECT count(*) FROM dbo.su_kien WHERE ten LIKE $2) +
        (SELECT count(*) FROM dbo.de_xuat_chi WHERE tieu_de LIKE $2) +
        (SELECT count(*) FROM dbo.giao_dich_quy WHERE noi_dung LIKE $2) AS count`,
    [`med09pg+${runId}-%@med09-e2e.invalid`, `${runPrefix}%`]);
    assert.equal(Number(existing.rows[0].count), 0, 'Run ID collision detected; refusing fixture writes.');

    let caseNumber = 0;
    let closed = false;
    async function cleanupScope(labelPrefix, emailPattern) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const memberIds = (await client.query('SELECT id FROM dbo.thanh_vien WHERE email LIKE $1', [emailPattern])).rows.map((row) => row.id);
        const eventIds = (await client.query('SELECT id FROM dbo.su_kien WHERE ten LIKE $1', [`${labelPrefix}%`])).rows.map((row) => row.id);
        const proposalIds = (await client.query('SELECT id FROM dbo.de_xuat_chi WHERE tieu_de LIKE $1', [`${labelPrefix}%`])).rows.map((row) => row.id);
        const transactionIds = (await client.query(`
          SELECT id FROM dbo.giao_dich_quy
          WHERE noi_dung LIKE $1 OR de_xuat_id = ANY($2::uuid[])`, [`${labelPrefix}%`, proposalIds])).rows.map((row) => row.id);

        if (transactionIds.length) {
          const vouchers = await client.query('SELECT count(*)::int AS count FROM dbo.chung_tu WHERE giao_dich_id = ANY($1::uuid[])', [transactionIds]);
          assert.equal(vouchers.rows[0].count, 0, 'Fixture has a voucher; preserve it for explicit object-storage cleanup.');
          await client.query(`DELETE FROM dbo.giao_dich_quy
            WHERE giao_dich_goc_id = ANY($1::uuid[]) AND noi_dung LIKE $2`, [transactionIds, `${labelPrefix}%`]);
          await client.query('DELETE FROM dbo.giao_dich_quy WHERE id = ANY($1::uuid[])', [transactionIds]);
        }
        if (proposalIds.length) {
          await client.query('DELETE FROM dbo.bieu_quyet WHERE de_xuat_id = ANY($1::uuid[])', [proposalIds]);
          await client.query('DELETE FROM dbo.de_xuat_chi WHERE id = ANY($1::uuid[])', [proposalIds]);
        }
        if (eventIds.length || memberIds.length) {
          await client.query(`DELETE FROM dbo.su_kien_thanh_vien
            WHERE su_kien_id = ANY($1::uuid[]) OR thanh_vien_id = ANY($2::uuid[])`, [eventIds, memberIds]);
        }
        if (eventIds.length) await client.query('DELETE FROM dbo.su_kien WHERE id = ANY($1::uuid[])', [eventIds]);
        if (memberIds.length) await client.query('DELETE FROM dbo.thanh_vien WHERE id = ANY($1::uuid[])', [memberIds]);

        const residual = await client.query(`
          SELECT
            (SELECT count(*) FROM dbo.thanh_vien WHERE email LIKE $1) +
            (SELECT count(*) FROM dbo.su_kien WHERE ten LIKE $2) +
            (SELECT count(*) FROM dbo.de_xuat_chi WHERE tieu_de LIKE $2) +
            (SELECT count(*) FROM dbo.giao_dich_quy WHERE noi_dung LIKE $2) AS count`,
        [emailPattern, `${labelPrefix}%`]);
        assert.equal(Number(residual.rows[0].count), 0, 'Scoped fixture cleanup left tagged rows.');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    async function cleanupAll() {
      await cleanupScope(runPrefix, `med09pg+${runId}-%@med09-e2e.invalid`);
    }

    return {
      pool,
      env,
      url: appUrl,
      identity: backendIdentity,
      runnerIdentity,
      baseline,
      databaseSnapshot,
      runId,
      runPrefix,
      nextCase() {
        caseNumber += 1;
        return `${runPrefix}-case-${String(caseNumber).padStart(3, '0')}`;
      },
      emailFor(caseLabel, role) {
        return `med09pg+${runId}-${caseLabel.slice(runPrefix.length + 6)}-${role}@med09-e2e.invalid`;
      },
      async fixture(context, passwordHash = 'unused-test-hash') {
        const label = this.nextCase();
        const users = { label, caseLabel: label };
        for (const [key, role] of [['admin', 'ADMIN'], ['treasurer', 'THU_QUY'], ['member1', 'THANH_VIEN'], ['member2', 'THANH_VIEN'], ['member3', 'THANH_VIEN']]) {
          const email = `med09pg+${runId}-${label.slice(runPrefix.length + 6)}-${key}@med09-e2e.invalid`;
          const result = await pool.query(`INSERT INTO dbo.thanh_vien(ho_ten,email,mat_khau_hash,vai_tro,trang_thai)
            VALUES($1,$2,$3,$4,'ACTIVE') RETURNING id`, [`${label} ${key}`, email, passwordHash, role]);
          users[key] = result.rows[0].id;
          users[`${key}Email`] = email;
        }
        if (context?.after) context.after(() => cleanupScope(label, `med09pg+${runId}-${label.slice(runPrefix.length + 6)}-%@med09-e2e.invalid`));
        return users;
      },
      async verifyPool(candidatePool) {
        return verifyRunnerDatabase(candidatePool, backendIdentity);
      },
      async close() {
        if (closed) return;
        closed = true;
        try {
          const currentBackend = verifyBackendDatabase();
          assert.equal(currentBackend.db, backendIdentity.db);
          assert.equal(currentBackend.schema, backendIdentity.schema);
          assert.equal(currentBackend.server, backendIdentity.server);
          assert.equal(currentBackend.started, backendIdentity.started);
          await verifyRunnerDatabase(pool, backendIdentity);
          await cleanupAll();
          const after = await databaseSnapshot(pool);
          assert.deepEqual(after, baseline, 'Database baseline changed; inspect external writes before declaring success.');
          canReleaseLock = true;
        } finally {
          await pool.end();
          if (canReleaseLock) fs.unlinkSync(RUN_LOCK);
        }
      },
    };
  } catch (error) {
    await pool.end();
    fs.unlinkSync(RUN_LOCK);
    throw error;
  }
}

module.exports = { createIntegrationHarness };
