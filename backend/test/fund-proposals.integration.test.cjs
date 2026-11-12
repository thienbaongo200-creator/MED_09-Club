const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ForbiddenException, ConflictException, NotFoundException, UnprocessableEntityException } = require('@nestjs/common');
const { FundsService } = require('../dist/funds/funds.service.js');
const { ProposalsService } = require('../dist/proposals/proposals.service.js');
const { EventsService } = require('../dist/events/events.service.js');
const { createIntegrationHarness } = require('./postgres-integration-harness.cjs');

test('PostgreSQL integration: funds and proposals', async (t) => {
  const harness = await createIntegrationHarness();
  t.after(() => harness.close());
  const pool = harness.pool;

  const funds = new FundsService(pool, {});
  const proposals = new ProposalsService(pool);
  const events = new EventsService(pool);
  async function fixture(context) { return harness.fixture(context); }
  async function addTransaction(users, loai, amount, extra = {}) {
    const { rows } = await pool.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id,de_xuat_id) VALUES($1,$2,$3,$4,$5) RETURNING id`, [loai, amount, `${users.caseLabel} ${extra.description ?? 'transaction'}`, users.treasurer, extra.proposalId ?? null]);
    return rows[0].id;
  }
  async function balance() {
    const { rows } = await pool.query(`SELECT COALESCE(SUM(so_tien) FILTER (WHERE loai='THU'),0)-COALESCE(SUM(so_tien) FILTER (WHERE loai='CHI'),0) AS balance FROM dbo.giao_dich_quy`);
    return Number(rows[0].balance);
  }
  async function proposal(users, creator, amount) {
    const { rows } = await pool.query(`INSERT INTO dbo.de_xuat_chi(nguoi_tao_id,tieu_de,noi_dung,kinh_phi,trang_thai) VALUES($1,$2,$3,$4,'PENDING') RETURNING id`, [creator, `${users.caseLabel} Integration proposal`, `${users.caseLabel} test detail`, amount]);
    return rows[0].id;
  }

  await t.test('database primary key, unique email, foreign key, and check constraints reject invalid rows', async (t) => {
      const users = await fixture(t);
      const crypto = require('node:crypto');
      await assert.rejects(pool.query(`INSERT INTO dbo.thanh_vien(id,ho_ten,email,mat_khau_hash,vai_tro,trang_thai)
        VALUES($1,'duplicate id',$2,'unused-test-hash','THANH_VIEN','ACTIVE')`, [users.member1, `med09pg+${harness.runId}-duplicate-pk@med09-e2e.invalid`]), (error) => error.code === '23505');
      await assert.rejects(pool.query(`INSERT INTO dbo.thanh_vien(ho_ten,email,mat_khau_hash,vai_tro,trang_thai)
        VALUES('duplicate email',$1,'unused-test-hash','THANH_VIEN','ACTIVE')`, [users.member1Email]), (error) => error.code === '23505');
      await assert.rejects(pool.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id)
        VALUES('THU',1,$1,$2)`, [`${users.caseLabel} invalid FK`, crypto.randomUUID()]), (error) => error.code === '23503');
      await assert.rejects(pool.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id)
        VALUES('THU',-1,$1,$2)`, [`${users.caseLabel} invalid amount`, users.treasurer]), (error) => error.code === '23514');
    });

    await t.test('updates valid manual transaction, records actor, and rejects a negative resulting balance', async (t) => {
      const users = await fixture(t);
      const startingBalance = await balance();
      const id = await addTransaction(users, 'THU', 100);
      const result = await funds.updateManualTransaction(id, { loai: 'THU', soTien: 120, noiDung: `${users.caseLabel} updated` }, users.admin);
      assert.equal(result.soTien, 120);
      assert.equal(await balance(), startingBalance + 120);
      const audit = await pool.query('SELECT ngay_cap_nhat,nguoi_cap_nhat_id FROM dbo.giao_dich_quy WHERE id=$1', [id]);
      assert.ok(audit.rows[0].ngay_cap_nhat);
      assert.equal(audit.rows[0].nguoi_cap_nhat_id, users.admin);

      await funds.createManualTransaction({ loai: 'CHI', soTien: startingBalance + 100, noiDung: `${users.caseLabel} existing expense` }, users.treasurer);
      await assert.rejects(funds.updateManualTransaction(id, { loai: 'CHI', soTien: startingBalance + 121, noiDung: `${users.caseLabel} would make negative` }, users.admin), UnprocessableEntityException);
      assert.equal(await balance(), 20);
      const unchanged = await pool.query('SELECT loai,so_tien,noi_dung FROM dbo.giao_dich_quy WHERE id=$1', [id]);
      assert.deepEqual(unchanged.rows[0], { loai: 'THU', so_tien: '120.00', noi_dung: `${users.caseLabel} updated` });
    });

    await t.test('does not edit proposal-generated or reversal transactions and returns 404 for missing IDs', async (t) => {
      const users = await fixture(t);
      const proposalId = await proposal(users, users.member1, 10);
      const approvedChi = await addTransaction(users, 'CHI', 10, { proposalId });
      await assert.rejects(funds.updateManualTransaction(approvedChi, { loai: 'CHI', soTien: 9, noiDung: 'tamper' }, users.admin), ForbiddenException);
      const source = await addTransaction(users, 'CHI', 20);
      const reversed = await funds.reverseTransaction(source, `${users.caseLabel} correction`, users.admin);
      await assert.rejects(funds.updateManualTransaction(reversed.id, { loai: 'CHI', soTien: 20, noiDung: 'tamper' }, users.admin), ForbiddenException);
      await assert.rejects(funds.updateManualTransaction(randomUUID(), { loai: 'CHI', soTien: 1, noiDung: 'missing' }, users.admin), NotFoundException);
      assert.equal(await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE noi_dung LIKE $1', [`${users.caseLabel}%`]).then((r) => r.rows[0].n), 3);
    });

    await t.test('concurrent reversal requests create exactly one opposite linked transaction', async (t) => {
      const users = await fixture(t);
      const startingBalance = await balance();
      const source = await addTransaction(users, 'THU', 70);
      const attempts = await Promise.allSettled([
        funds.reverseTransaction(source, `${users.caseLabel} first request`, users.admin),
        funds.reverseTransaction(source, `${users.caseLabel} racing request`, users.treasurer),
      ]);
      assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
      assert.equal(attempts.filter((a) => a.status === 'rejected').length, 1);
      const rows = await pool.query('SELECT loai,so_tien,giao_dich_goc_id,nguoi_thuc_hien_id FROM dbo.giao_dich_quy WHERE giao_dich_goc_id=$1', [source]);
      assert.equal(rows.rowCount, 1);
      assert.equal(rows.rows[0].loai, 'CHI');
      assert.equal(rows.rows[0].so_tien, '70.00');
      assert.ok([users.admin, users.treasurer].includes(rows.rows[0].nguoi_thuc_hien_id));
      assert.equal(await balance(), startingBalance);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE noi_dung LIKE $1', [`${users.caseLabel}%`])).rows[0].n, 2);
    });

    await t.test('concurrent manual expenses serialize against the same fund balance', async (t) => {
      const users = await fixture(t);
      const startingBalance = await balance();
      const expense = Math.floor(startingBalance / 2) + 1;
      const attempts = await Promise.allSettled([
        funds.createManualTransaction({ loai: 'CHI', soTien: expense, noiDung: `${users.caseLabel} expense A` }, users.treasurer),
        funds.createManualTransaction({ loai: 'CHI', soTien: expense, noiDung: `${users.caseLabel} expense B` }, users.admin),
      ]);
      assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
      assert.equal(attempts.filter((a) => a.status === 'rejected' && a.reason instanceof UnprocessableEntityException).length, 1);
      assert.equal(await balance(), startingBalance - expense);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE loai='CHI' AND noi_dung LIKE $1", [`${users.caseLabel}%`])).rows[0].n, 1);
    });

    await t.test('statement response masks PII and search does not match raw email or phone in descriptions', async (t) => {
      const users = await fixture(t);
      const email = users.member2Email;
      const phone = '0901234567';
      await pool.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id) VALUES('THU',5,$1,$2)`, [`${users.caseLabel} Contact ${email} or ${phone}`, users.treasurer]);
      const actor = { sub: users.treasurer, role: 'THU_QUY', email: users.treasurerEmail };
      const statement = await funds.getStatement({ keyword: users.caseLabel }, actor);
      assert.equal(statement.items.length, 1);
      assert.ok(!JSON.stringify(statement.items[0]).includes(email));
      assert.ok(!JSON.stringify(statement.items[0]).includes(phone));
      assert.equal(statement.items[0].email, 'm***@med09-e2e.invalid');
      assert.equal((await funds.getStatement({ keyword: email }, actor)).totalItems, 0);
      assert.equal((await funds.getStatement({ keyword: phone }, actor)).totalItems, 0);
    });

    await t.test('concurrent duplicate votes are constrained to one database row', async (t) => {
      const users = await fixture(t);
      const id = await proposal(users, users.member1, 10);
      const results = await Promise.allSettled([proposals.vote(id, users.member2, 'AGREE'), proposals.vote(id, users.member2, 'DISAGREE')]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected' && r.reason instanceof ConflictException).length, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.bieu_quyet WHERE de_xuat_id=$1 AND thanh_vien_id=$2', [id, users.member2])).rows[0].n, 1);
    });

    await t.test('concurrent approvals of competing proposals cannot overdraw the fund', async (t) => {
      const users = await fixture(t);
      const available = await balance();
      const expense = Math.floor(available / 2) + 1;
      const first = await proposal(users, users.member1, expense);
      const second = await proposal(users, users.member2, expense);
      await pool.query('INSERT INTO dbo.bieu_quyet(de_xuat_id,thanh_vien_id,ket_qua) VALUES($1,$2,\'AGREE\'),($3,$2,\'AGREE\')', [first, users.member3, second]);
      const results = await Promise.allSettled([proposals.approve(first, users.admin), proposals.approve(second, users.admin)]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected' && r.reason instanceof UnprocessableEntityException).length, 1);
      const states = await pool.query('SELECT id,trang_thai FROM dbo.de_xuat_chi WHERE id=ANY($1::uuid[])', [[first, second]]);
      assert.equal(states.rows.filter((row) => row.trang_thai === 'APPROVED').length, 1);
      assert.equal(states.rows.filter((row) => row.trang_thai === 'PENDING').length, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE loai='CHI' AND de_xuat_id=ANY($1::uuid[])", [[first, second]])).rows[0].n, 1);
      assert.equal(await balance(), available - expense);
    });

    await t.test('manual expense and proposal approval use the same lock for the shared balance', async (t) => {
      const users = await fixture(t);
      const startingBalance = await balance();
      const expense = Math.floor(startingBalance / 2) + 1;
      const id = await proposal(users, users.member1, expense);
      await pool.query('INSERT INTO dbo.bieu_quyet(de_xuat_id,thanh_vien_id,ket_qua) VALUES($1,$2,\'AGREE\')', [id, users.member2]);
      const results = await Promise.allSettled([
        funds.createManualTransaction({ loai: 'CHI', soTien: expense, noiDung: `${users.caseLabel} competing manual expense` }, users.treasurer),
        proposals.approve(id, users.admin),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(await balance(), startingBalance - expense);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE loai='CHI' AND noi_dung LIKE $1", [`${users.caseLabel}%`])).rows[0].n, 1);
    });

    await t.test('self-approval is rejected without changing proposal or balance', async (t) => {
      const users = await fixture(t);
      const startingBalance = await balance();
      await addTransaction(users, 'THU', 100);
      const id = await proposal(users, users.member1, 20);
      await pool.query('INSERT INTO dbo.bieu_quyet(de_xuat_id,thanh_vien_id,ket_qua) VALUES($1,$2,\'AGREE\')', [id, users.member2]);
      await assert.rejects(proposals.approve(id, users.member1), ForbiddenException);
      assert.equal((await pool.query('SELECT trang_thai FROM dbo.de_xuat_chi WHERE id=$1', [id])).rows[0].trang_thai, 'PENDING');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE de_xuat_id=$1', [id])).rows[0].n, 0);
      assert.equal(await balance(), startingBalance + 100);
    });

    await t.test('foreign-key failure after proposal update rolls back proposal and transaction', async (t) => {
      const users = await fixture(t);
      const id = await proposal(users, users.member1, 20);
      await pool.query('INSERT INTO dbo.bieu_quyet(de_xuat_id,thanh_vien_id,ket_qua) VALUES($1,$2,\'AGREE\')', [id, users.member2]);
      const missingProcessor = randomUUID();
      await assert.rejects(proposals.approve(id, missingProcessor), (error) => error.code === '23503');
      assert.equal((await pool.query('SELECT trang_thai FROM dbo.de_xuat_chi WHERE id=$1', [id])).rows[0].trang_thai, 'PENDING');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE de_xuat_id=$1', [id])).rows[0].n, 0);
    });

    await t.test('event period, duplicate registration, and attendance rules are enforced against PostgreSQL', async (t) => {
      const users = await fixture(t);
      const localTimestamp = async (offset) => (await pool.query(`SELECT to_char(NOW() + ($1::bigint * INTERVAL '1 millisecond'), 'YYYY-MM-DD"T"HH24:MI:SS') AS value`, [offset])).rows[0].value;
      const startsLater = await localTimestamp(60_000);
      const endsLater = await localTimestamp(120_000);
      const event = await events.create({ tenSuKien: `${users.caseLabel} Integration event`, thoiGianBatDau: startsLater, thoiGianKetThuc: endsLater }, users.treasurer);
      const expired = await pool.query(`INSERT INTO dbo.su_kien(ten,thoi_gian_bat_dau,thoi_gian_ket_thuc,nguoi_phu_trach_id) VALUES($1,NOW()-INTERVAL '2 hours',NOW()-INTERVAL '1 hour',$2) RETURNING id`, [`${users.caseLabel} Expired`, users.treasurer]);
      await assert.rejects(events.register(expired.rows[0].id, users.member2), (error) => error.getStatus?.() === 400);
      await pool.query(`INSERT INTO dbo.su_kien_thanh_vien(su_kien_id,thanh_vien_id,trang_thai) VALUES($1,$2,'REGISTERED')`, [expired.rows[0].id, users.member2]);
      await events.attend(expired.rows[0].id, users.member2, 'ATTENDED', users.treasurer);
      await events.register(event.id, users.member1);
      await assert.rejects(events.attend(event.id, users.member1, 'ATTENDED', users.treasurer), (error) => error.getStatus?.() === 400);
      await assert.rejects(events.create({ tenSuKien: 'Invalid', thoiGianBatDau: endsLater, thoiGianKetThuc: startsLater }, users.admin), (error) => error.getStatus?.() === 400);

      const { rows } = await pool.query(`INSERT INTO dbo.su_kien(ten,thoi_gian_bat_dau,thoi_gian_ket_thuc,nguoi_phu_trach_id) VALUES($1,NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 hour',$2) RETURNING id`, [`${users.caseLabel} Past start`, users.treasurer]);
      const startedEventId = rows[0].id;
      await events.register(startedEventId, users.member1);
      await assert.rejects(events.register(startedEventId, users.member1), ConflictException);
      await assert.rejects(events.attend(event.id, users.member1, 'ATTENDED', users.treasurer), (error) => error.getStatus?.() === 400);
      await events.attend(startedEventId, users.member1, 'ABSENT', users.treasurer);
      const attendance = await pool.query('SELECT trang_thai,nguoi_diem_danh_id,thoi_gian_diem_danh FROM dbo.su_kien_thanh_vien WHERE su_kien_id=$1 AND thanh_vien_id=$2', [startedEventId, users.member1]);
      assert.equal(attendance.rows[0].trang_thai, 'ABSENT');
      assert.equal(attendance.rows[0].nguoi_diem_danh_id, users.treasurer);
      assert.ok(attendance.rows[0].thoi_gian_diem_danh);
      assert.equal((await pool.query('SELECT trang_thai FROM dbo.su_kien_thanh_vien WHERE su_kien_id=$1 AND thanh_vien_id=$2', [expired.rows[0].id, users.member2])).rows[0].trang_thai, 'ATTENDED');
    });
});

