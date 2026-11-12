const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hash } = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createIntegrationHarness } = require('./postgres-integration-harness.cjs');

test('HTTP integration: authentication, validation, role enforcement, and final database state', async (t) => {
  const harness = await createIntegrationHarness();

  const oldEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    STORAGE_ENABLED: process.env.STORAGE_ENABLED,
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
  };
  process.env.DATABASE_URL = harness.url;
  process.env.JWT_SECRET = 'med09-http-test-secret-only';
  process.env.STORAGE_ENABLED = 'false';
  process.env.FRONTEND_ORIGIN = 'http://localhost:3000';

  const { NestFactory } = require('@nestjs/core');
  const { ValidationPipe } = require('@nestjs/common');
  const { AppModule } = require('../dist/app.module.js');
  const { PG_POOL } = require('../dist/common/database/database.module.js');
  let app;
  let pool;
  let baseUrl;
  try {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  pool = app.get(PG_POOL);
  await harness.verifyPool(pool);

  async function fixture(context) { return harness.fixture(context, await hash('test-password', 4)); }
  async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
    return { response, data };
  }
  async function login(email, password = 'test-password') {
    const result = await request('/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    return result.data.accessToken;
  }

    await t.test('rejects incorrect credentials, inactive users, malformed tokens, and expired tokens', async (t) => {
        const users = await fixture();
      const passwordHash = await hash('test-password', 4);
      const inactiveEmail = harness.emailFor(users.caseLabel, 'inactive');
      await pool.query(`INSERT INTO dbo.thanh_vien(ho_ten,email,mat_khau_hash,vai_tro,trang_thai) VALUES($1,$2,$3,'THANH_VIEN','INACTIVE')`, [`${users.caseLabel} inactive`, inactiveEmail, passwordHash]);
      const badPassword = await request('/auth/login', { method: 'POST', body: { email: users.member1Email, password: 'wrong-password' } });
      const absent = await request('/auth/login', { method: 'POST', body: { email: harness.emailFor(users.caseLabel, 'absent'), password: 'wrong-password' } });
      const inactive = await request('/auth/login', { method: 'POST', body: { email: inactiveEmail, password: 'test-password' } });
      assert.equal(badPassword.response.status, 401);
      assert.equal(absent.response.status, 401);
      assert.deepEqual(badPassword.data.message, absent.data.message);
      assert.equal(inactive.response.status, 401);

      const malformed = await request('/auth/me', { token: 'not-a-jwt' });
      const expired = jwt.sign({ sub: users.member1, email: users.member1Email }, process.env.JWT_SECRET, { expiresIn: -1 });
      const expiredResult = await request('/auth/me', { token: expired });
      assert.equal(malformed.response.status, 401);
      assert.equal(expiredResult.response.status, 401);
    });

    await t.test('enforces member and treasurer role boundaries over HTTP and preserves database state', async (t) => {
      const users = await fixture();
      await pool.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id) VALUES('THU',100,$1,$2)`, [`${users.caseLabel} fixture`, users.treasurer]);
      const admin = await login(users.adminEmail);
      const treasurer = await login(users.treasurerEmail);
      const member = await login(users.member1Email);

      const own = await request(`/auth/me?userId=${users.admin}`, { token: member });
      assert.equal(own.response.status, 200);
      assert.equal(own.data.id, users.member1);
      const other = await request(`/members/${users.member2}`, { token: member });
      assert.equal(other.response.status, 403);
      assert.equal((await request('/fund/transactions', { token: member, method: 'POST', body: { loai: 'THU', soTien: 1, noiDung: 'forbidden' } })).response.status, 403);
      assert.equal((await request(`/fund/transactions/${randomUUID()}`, { token: member, method: 'PATCH', body: { loai: 'THU', soTien: 1, noiDung: 'forbidden' } })).response.status, 403);
      assert.equal((await request(`/reports/events/${randomUUID()}/attendance`, { token: member })).response.status, 403);
      assert.equal((await request('/reports/fund?tuNgay=2000-01-01&denNgay=2099-12-31', { token: member })).response.status, 200);
      assert.equal((await request(`/members/${users.member2}/role`, { token: treasurer, method: 'PATCH', body: { vaiTro: 'ADMIN' } })).response.status, 403);
      assert.equal((await pool.query('SELECT vai_tro FROM dbo.thanh_vien WHERE id=$1', [users.member2])).rows[0].vai_tro, 'THANH_VIEN');
      assert.equal((await request('/members', { token: admin })).response.status, 200);

      assert.equal((await request(`/members/${users.member2}`, { token: admin, method: 'PATCH', body: { hoTen: `${users.caseLabel} audited` } })).response.status, 200);
      let auditFields = (await pool.query('SELECT nguoi_cap_nhat_id,ngay_cap_nhat FROM dbo.thanh_vien WHERE id=$1', [users.member2])).rows[0];
      assert.equal(auditFields.nguoi_cap_nhat_id, users.admin);
      assert.ok(auditFields.ngay_cap_nhat);
      assert.equal((await request(`/members/${users.member2}/status`, { token: admin, method: 'PATCH', body: { trangThai: 'INACTIVE' } })).response.status, 200);
      auditFields = (await pool.query('SELECT nguoi_cap_nhat_id,ngay_cap_nhat FROM dbo.thanh_vien WHERE id=$1', [users.member2])).rows[0];
      assert.equal(auditFields.nguoi_cap_nhat_id, users.admin);
      assert.ok(auditFields.ngay_cap_nhat);
      assert.equal((await request(`/members/${users.member2}/role`, { token: admin, method: 'PATCH', body: { vaiTro: 'THU_QUY' } })).response.status, 200);
      auditFields = (await pool.query('SELECT nguoi_cap_nhat_id,ngay_cap_nhat FROM dbo.thanh_vien WHERE id=$1', [users.member2])).rows[0];
      assert.equal(auditFields.nguoi_cap_nhat_id, users.admin);
      assert.ok(auditFields.ngay_cap_nhat);

      const duplicate = await request('/members', { token: admin, method: 'POST', body: { hoTen: `${users.caseLabel} Duplicate`, email: users.member1Email, matKhau: 'test-password' } });
      assert.equal(duplicate.response.status, 409);
      const zero = await request('/fund/transactions', { token: treasurer, method: 'POST', body: { loai: 'CHI', soTien: 0, noiDung: 'zero' } });
      const negative = await request('/fund/transactions', { token: treasurer, method: 'POST', body: { loai: 'CHI', soTien: -1, noiDung: 'negative' } });
      const invalidType = await request('/fund/transactions', { token: treasurer, method: 'POST', body: { loai: 'CHI', soTien: 'NaN', noiDung: 'invalid number' } });
      assert.equal(zero.response.status, 400);
      assert.equal(negative.response.status, 400);
      assert.equal(invalidType.response.status, 400);

      const available = Number((await harness.databaseSnapshot(pool)).balance);
      const tooLargeExpense = await request('/fund/transactions', { token: treasurer, method: 'POST', body: { loai: 'CHI', soTien: available + 1, noiDung: `${users.caseLabel} over balance` } });
      assert.equal(tooLargeExpense.response.status, 422);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE loai='CHI' AND noi_dung LIKE $1", [`${users.caseLabel}%`])).rows[0].n, 0);
    });

    await t.test('rejects self-approval, rejects approval without vote majority, and permits rejection without a CHI', async (t) => {
      const users = await fixture();
      await pool.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id) VALUES('THU',100,$1,$2)`, [`${users.caseLabel} fixture`, users.treasurer]);
      const treasurer = await login(users.treasurerEmail);
      const admin = await login(users.adminEmail);
      const member1 = await login(users.member1Email);
      const member2 = await login(users.member2Email);
      const member3 = await login(users.member3Email);

      for (const amount of [0, -1]) {
        const invalidProposal = await request('/proposals', { token: member1, method: 'POST', body: { tieuDe: `${users.caseLabel} Invalid amount`, noiDung: `${users.caseLabel} must reject`, kinhPhi: amount } });
        assert.equal(invalidProposal.response.status, 400);
      }

      const selfCreated = await request('/proposals', { token: treasurer, method: 'POST', body: { tieuDe: `${users.caseLabel} Self approval`, noiDung: `${users.caseLabel} must remain pending`, kinhPhi: 10 } });
      assert.equal(selfCreated.response.status, 201);
      assert.equal((await request(`/proposals/${selfCreated.data.id}/approve`, { token: treasurer, method: 'POST', body: {} })).response.status, 403);
      assert.equal((await pool.query('SELECT trang_thai FROM dbo.de_xuat_chi WHERE id=$1', [selfCreated.data.id])).rows[0].trang_thai, 'PENDING');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE de_xuat_id=$1', [selfCreated.data.id])).rows[0].n, 0);

      const noMajority = await request('/proposals', { token: member1, method: 'POST', body: { tieuDe: `${users.caseLabel} No majority`, noiDung: `${users.caseLabel} equal votes`, kinhPhi: 10 } });
      assert.equal(noMajority.response.status, 201);
      await request(`/proposals/${noMajority.data.id}/vote`, { token: member2, method: 'POST', body: { ketQua: 'AGREE' } });
      await request(`/proposals/${noMajority.data.id}/vote`, { token: member3, method: 'POST', body: { ketQua: 'DISAGREE' } });
      const deniedApproval = await request(`/proposals/${noMajority.data.id}/approve`, { token: admin, method: 'POST', body: {} });
      assert.equal(deniedApproval.response.status, 422);
      assert.equal((await pool.query('SELECT trang_thai FROM dbo.de_xuat_chi WHERE id=$1', [noMajority.data.id])).rows[0].trang_thai, 'PENDING');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE de_xuat_id=$1', [noMajority.data.id])).rows[0].n, 0);

      const rejected = await request('/proposals', { token: member1, method: 'POST', body: { tieuDe: `${users.caseLabel} Reject cleanly`, noiDung: `${users.caseLabel} no transaction`, kinhPhi: 10 } });
      const rejectResult = await request(`/proposals/${rejected.data.id}/reject`, { token: treasurer, method: 'PATCH' });
      assert.equal(rejectResult.response.status, 200);
      assert.equal((await pool.query('SELECT trang_thai FROM dbo.de_xuat_chi WHERE id=$1', [rejected.data.id])).rows[0].trang_thai, 'REJECTED');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE de_xuat_id=$1', [rejected.data.id])).rows[0].n, 0);
    });

    await t.test('prevents repeat vote/approval and protects voucher routes by role', async (t) => {
      const users = await fixture();
      await pool.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id) VALUES('THU',100,$1,$2)`, [`${users.caseLabel} fixture`, users.treasurer]);
      const treasurer = await login(users.treasurerEmail);
      const member1 = await login(users.member1Email);
      const member2 = await login(users.member2Email);
      const proposal = await request('/proposals', { token: member1, method: 'POST', body: { tieuDe: `${users.caseLabel} Approve once`, noiDung: `${users.caseLabel} single CHI`, kinhPhi: 10 } });
      assert.equal((await request(`/proposals/${proposal.data.id}/approve`, { token: member1, method: 'POST', body: {} })).response.status, 403);
      await request(`/proposals/${proposal.data.id}/vote`, { token: member2, method: 'POST', body: { ketQua: 'AGREE' } });
      assert.equal((await request(`/proposals/${proposal.data.id}/vote`, { token: member2, method: 'POST', body: { ketQua: 'DISAGREE' } })).response.status, 409);
      const concurrentApprovals = await Promise.all([
        request(`/proposals/${proposal.data.id}/approve`, { token: treasurer, method: 'POST', body: {} }),
        request(`/proposals/${proposal.data.id}/approve`, { token: treasurer, method: 'POST', body: {} }),
      ]);
      assert.deepEqual(concurrentApprovals.map(({ response }) => response.status).sort(), [201, 409]);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE de_xuat_id=$1', [proposal.data.id])).rows[0].n, 1);
      assert.equal((await pool.query('SELECT trang_thai FROM dbo.de_xuat_chi WHERE id=$1', [proposal.data.id])).rows[0].trang_thai, 'APPROVED');
      assert.equal((await request(`/proposals/${proposal.data.id}/vote`, { token: member1, method: 'POST', body: { ketQua: 'AGREE' } })).response.status, 409);

      const transactionId = (await pool.query('SELECT id FROM dbo.giao_dich_quy WHERE de_xuat_id=$1', [proposal.data.id])).rows[0].id;
      const forbiddenVoucher = await request(`/fund/transactions/${transactionId}/voucher-url`, { token: member1 });
      assert.equal(forbiddenVoucher.response.status, 403);
    });

    await t.test('masks public statement PII, protects reversal history, and verifies event attendance reports', async () => {
      const users = await fixture();
      const phone = '090.123.4567';
      const email = users.member2Email;
      await pool.query('UPDATE dbo.thanh_vien SET so_dien_thoai=$2 WHERE id=$1', [users.member2, phone]);
      await pool.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id) VALUES('THU',100,$1,$2)`, [`${users.caseLabel} Contact ${email} ${phone}`, users.treasurer]);
      const treasurer = await login(users.treasurerEmail);
      const member = await login(users.member1Email);

      const statement = await request('/fund/transactions', { token: member });
      assert.equal(statement.response.status, 200);
      const publicJson = JSON.stringify(statement.data);
      assert.ok(!publicJson.includes(email));
      assert.ok(!publicJson.includes(phone));
      assert.ok(statement.data.items.some((item) => item.email === 'm***@med09-e2e.invalid'));
      const emailSearch = await request(`/fund/transactions?keyword=${encodeURIComponent(email)}`, { token: member });
      const phoneSearch = await request(`/fund/transactions?keyword=${encodeURIComponent(phone)}`, { token: member });
      assert.equal(emailSearch.data.totalItems, 0);
      assert.equal(phoneSearch.data.totalItems, 0);
      assert.ok(!publicJson.includes(phone));

      const source = (await pool.query('SELECT id FROM dbo.giao_dich_quy WHERE noi_dung LIKE $1 LIMIT 1', [`${users.caseLabel} Contact%`])).rows[0].id;
      const reversal = await request(`/fund/transactions/${source}/reversal`, { token: treasurer, method: 'POST', body: { noiDung: `${users.caseLabel} HTTP reversal` } });
      assert.equal(reversal.response.status, 201);
      assert.equal((await request(`/fund/transactions/${source}/reversal`, { token: treasurer, method: 'POST', body: { noiDung: 'duplicate' } })).response.status, 422);
      assert.equal((await request(`/fund/transactions/${source}`, { token: treasurer, method: 'PATCH', body: { loai: 'THU', soTien: 100, noiDung: 'tamper' } })).response.status, 403);
      assert.equal((await request(`/fund/transactions/${reversal.data.id}`, { token: treasurer, method: 'PATCH', body: { loai: 'CHI', soTien: 100, noiDung: 'tamper' } })).response.status, 403);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.giao_dich_quy WHERE giao_dich_goc_id=$1', [source])).rows[0].n, 1);

      const localTimestamp = async (offset) => (await pool.query(
        `SELECT to_char(NOW() + ($1::bigint * INTERVAL '1 millisecond'), 'YYYY-MM-DD"T"HH24:MI:SS') AS value`,
        [offset],
      )).rows[0].value;
      const futureStart = await localTimestamp(120_000);
      const futureEnd = await localTimestamp(180_000);
      const created = await request('/events', { token: treasurer, method: 'POST', body: { tenSuKien: `${users.caseLabel} HTTP E2E future`, thoiGianBatDau: futureStart, thoiGianKetThuc: futureEnd } });
      assert.equal(created.response.status, 201);
      const eventId = created.data.id;
      const edited = await request(`/events/${eventId}`, { token: treasurer, method: 'PATCH', body: { tenSuKien: `${users.caseLabel} HTTP E2E edited`, thoiGianBatDau: futureStart, thoiGianKetThuc: futureEnd } });
      assert.equal(edited.response.status, 200);
      assert.equal((await request(`/events/${eventId}`, { token: member, method: 'PATCH', body: { tenSuKien: 'forbidden', thoiGianBatDau: futureStart, thoiGianKetThuc: futureEnd } })).response.status, 403);
      assert.equal((await request('/events', { token: member, method: 'POST', body: { tenSuKien: 'forbidden', thoiGianBatDau: futureStart, thoiGianKetThuc: futureEnd } })).response.status, 403);
      assert.equal((await request(`/events/${eventId}/attendance`, { token: member, method: 'POST', body: { thanhVienId: users.member2, trangThai: 'ATTENDED' } })).response.status, 403);
      assert.equal((await request(`/events/${eventId}/attendance`, { token: treasurer, method: 'POST', body: { thanhVienId: users.member2, trangThai: 'ATTENDED' } })).response.status, 400);
      assert.equal((await request(`/events/${eventId}/register`, { token: member, method: 'POST' })).response.status, 201);
      assert.equal((await request(`/events/${eventId}/register`, { token: member, method: 'POST' })).response.status, 409);
      assert.equal((await request(`/events/${eventId}/attendance`, { token: treasurer, method: 'POST', body: { thanhVienId: users.member2, trangThai: 'ATTENDED' } })).response.status, 400);
      assert.equal((await request(`/events/${eventId}`, { token: treasurer, method: 'PATCH', body: { tenSuKien: 'invalid period', thoiGianBatDau: futureEnd, thoiGianKetThuc: futureStart } })).response.status, 400);

      const pastStart = await localTimestamp(-3_600_000);
      const activeEnd = await localTimestamp(1_800_000);
      const ended = await pool.query(`INSERT INTO dbo.su_kien(ten,thoi_gian_bat_dau,thoi_gian_ket_thuc,nguoi_phu_trach_id) VALUES($1,NOW()-INTERVAL '2 hours',NOW()-INTERVAL '1 hour',$2) RETURNING id`, [`${users.caseLabel} HTTP E2E ended`, users.treasurer]);
      assert.equal((await request(`/events/${ended.rows[0].id}/register`, { token: member, method: 'POST' })).response.status, 400);
      const active = await request('/events', { token: treasurer, method: 'POST', body: { tenSuKien: `${users.caseLabel} HTTP attendance report`, thoiGianBatDau: pastStart, thoiGianKetThuc: activeEnd } });
      assert.equal(active.response.status, 201);
      assert.equal((await request(`/events/${active.data.id}/attendance`, { token: treasurer, method: 'POST', body: { thanhVienId: users.member2, trangThai: 'ATTENDED' } })).response.status, 409);
      await request(`/events/${active.data.id}/register`, { token: member, method: 'POST' });
      await request(`/events/${active.data.id}/register`, { token: await login(users.member3Email), method: 'POST' });
      await request(`/events/${active.data.id}/attendance`, { token: treasurer, method: 'POST', body: { thanhVienId: users.member1, trangThai: 'ATTENDED' } });
      await request(`/events/${active.data.id}/attendance`, { token: treasurer, method: 'POST', body: { thanhVienId: users.member3, trangThai: 'ABSENT' } });
      const report = await request(`/reports/events/${active.data.id}/attendance`, { token: treasurer });
      assert.equal(report.response.status, 200);
      assert.equal(report.data.soLuongDangKy, 2);
      assert.equal(report.data.soLuongThamDu, 1);
      assert.equal(report.data.soLuongVang, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM dbo.su_kien_thanh_vien WHERE su_kien_id=$1 AND trang_thai IN (\'ATTENDED\',\'ABSENT\')', [active.data.id])).rows[0].n, 2);
    });
  } finally {
    try {
      if (app) await app.close();
      if (pool) await pool.end();
      await harness.close();
    } finally {
      for (const [key, value] of Object.entries(oldEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
});
