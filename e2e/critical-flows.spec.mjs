import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jwt = require("../backend/node_modules/jsonwebtoken");
const { Pool } = require("../backend/node_modules/pg");
const { TEST_DATABASE, runId, runLabel } = require("./test-environment.cjs");
const TEST_SECRET = process.env.MED09_E2E_JWT_SECRET;
const PASSWORD = "med09-e2e-password";
const RUN_ID = runId();
const RUN_LABEL = runLabel();
const USERS = {
  admin: { email: `e2e+${RUN_ID}-admin@med09-e2e.invalid`, name: `${RUN_LABEL} admin` },
  treasurer: { email: `e2e+${RUN_ID}-treasurer@med09-e2e.invalid`, name: `${RUN_LABEL} treasurer` },
  member1: { email: `e2e+${RUN_ID}-member1@med09-e2e.invalid`, name: `${RUN_LABEL} member1` },
  member2: { email: `e2e+${RUN_ID}-member2@med09-e2e.invalid`, name: `${RUN_LABEL} member2` },
  inactive: { email: `e2e+${RUN_ID}-inactive@med09-e2e.invalid`, name: `${RUN_LABEL} inactive` },
};

async function login(page, email, password = PASSWORD) {
  if (page.url() !== "about:blank") {
    await page.evaluate(() => localStorage.removeItem("mediclub_access_token"));
  }
  await page.goto("/login");
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  await emailInput.fill(email);
  await expect(emailInput).toHaveValue(email);
  await passwordInput.fill(password);
  await expect(passwordInput).toHaveValue(password);
  const loginResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/auth/login",
  );
  await page.locator('button[type="submit"]').click();
  expect((await loginResponse).status()).toBe(201);
  await page.waitForURL("**/fund");
}

function localDateTime(date) {
  const part = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

async function testDb() {
  const pool = new Pool({ connectionString: process.env.MED09_E2E_DATABASE_URL, max: 1 });
  try {
    const identity = await pool.query("SELECT current_database() AS name,current_schema() AS schema");
    expect(identity.rows[0].name).toBe(TEST_DATABASE);
    expect(identity.rows[0].schema).toBe("dbo");
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function fixtureMemberId(pool, user) {
  const result = await pool.query("SELECT id FROM dbo.thanh_vien WHERE email=$1", [user.email]);
  expect(result.rows).toHaveLength(1);
  return result.rows[0].id;
}

test.describe.configure({ mode: "serial" });

test("E2E-01: rejects wrong and inactive login, then signs in successfully", async ({ page }) => {
  const pool = await testDb();
  try {
    const fixture = await pool.query("SELECT vai_tro,trang_thai FROM dbo.thanh_vien WHERE email=$1", [USERS.admin.email]);
    expect(fixture.rows).toEqual([{ vai_tro: "ADMIN", trang_thai: "ACTIVE" }]);
  } finally {
    await pool.end();
  }
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(USERS.member1.email);
  await page.locator('input[type="password"]').fill("wrong-password");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.locator('input[type="email"]').fill(USERS.inactive.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.locator('input[type="email"]').fill(USERS.admin.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  const adminLogin = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/auth/login",
  );
  await page.locator('button[type="submit"]').click();
  expect((await adminLogin).status()).toBe(201);
  await page.waitForURL("**/fund");
  await expect(page.locator('a[href="/members"]')).toBeVisible();
});

test("E2E-01/02: expired JWT is cleared, and member pages plus direct API respect roles", async ({ page }) => {
  const pool = await testDb();
  let expiredToken;
  try {
    const memberId = await fixtureMemberId(pool, USERS.member1);
    expiredToken = jwt.sign({ sub: memberId, email: USERS.member1.email }, TEST_SECRET, { expiresIn: -1 });
  } finally {
    await pool.end();
  }
  await page.goto("/login");
  await page.evaluate((token) => localStorage.setItem("mediclub_access_token", token), expiredToken);
  await page.goto("/fund");
  await page.waitForURL("**/login");
  expect(await page.evaluate(() => localStorage.getItem("mediclub_access_token"))).toBeNull();

  await login(page, USERS.member1.email);
  await expect(page.locator('a[href="/members"]')).toHaveCount(0);
  const memberToken = await page.evaluate(() => localStorage.getItem("mediclub_access_token"));
  const deniedApi = await page.request.get(`${process.env.MED09_E2E_API_URL}/members`, {
    headers: { authorization: `Bearer ${memberToken}` },
  });
  expect(deniedApi.status()).toBe(403);
  await page.goto("/members");
  await expect(page.locator("table")).toHaveCount(0);

  await login(page, USERS.admin.email);
  await page.goto("/members");
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await expect(page.locator('a[href="/members"]')).toBeVisible();
});

test("E2E-06: admin creates a member, duplicate email is rejected, and status changes are displayed", async ({ page }) => {
  await login(page, USERS.admin.email);
  await page.goto("/members");
  const email = `e2e+${RUN_ID}-browser-created@med09-e2e.invalid`;
  const form = page.locator("form").first();
  await form.locator('input[name="hoTen"]').fill(`${RUN_LABEL} browser-created`);
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="matKhau"]').fill("temporary-password");
  const createResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/members",
  );
  await form.locator("button").first().click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const memberRow = page.getByRole("row").filter({ hasText: email });
  await expect(memberRow).toBeVisible();

  await form.locator('input[name="hoTen"]').fill("Duplicate email member");
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="matKhau"]').fill("temporary-password");
  await form.locator("button").first().click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(1);

  await memberRow.getByRole("button").click();
  await expect(memberRow).toContainText("INACTIVE");
});

test("E2E-03: treasurer creates and edits an event, member registers, and attendance persists", async ({ page }) => {
  const title = `${RUN_LABEL} event`;
  const editedTitle = `${title} edited`;
  // Timestamp columns are TIMESTAMP WITHOUT TIME ZONE; keep wide margins so
  // browser local time and the Compose PostgreSQL session timezone cannot
  // turn this attendance fixture into a future event.
  const start = localDateTime(new Date(Date.now() - 24 * 60 * 60_000));
  const end = localDateTime(new Date(Date.now() + 24 * 60 * 60_000));

  await login(page, USERS.treasurer.email);
  await page.goto("/events");
  await page.locator("main header button").first().click();
  let eventForm = page.locator("form").filter({ has: page.locator('input[type="datetime-local"]') });
  await eventForm.locator("input").nth(0).fill(title);
  await eventForm.locator('input[type="datetime-local"]').nth(0).fill(start);
  await eventForm.locator('input[type="datetime-local"]').nth(1).fill(end);
  await eventForm.locator('button[type="submit"]').click();
  let eventCard = page.locator("article").filter({ hasText: title });
  await expect(eventCard).toBeVisible();

  await eventCard.getByRole("button").first().click();
  eventForm = page.locator("form").filter({ has: page.locator('input[type="datetime-local"]') });
  await eventForm.locator("input").nth(0).fill(editedTitle);
  await eventForm.locator('button[type="submit"]').click();
  eventCard = page.locator("article").filter({ hasText: editedTitle });
  await expect(eventCard).toBeVisible();

  await login(page, USERS.member2.email);
  await page.goto("/events");
  eventCard = page.locator("article").filter({ hasText: editedTitle });
  await eventCard.getByRole("button").first().click();
  await expect(eventCard.getByRole("button")).toHaveCount(0);

  await login(page, USERS.treasurer.email);
  await page.goto("/events");
  eventCard = page.locator("article").filter({ hasText: editedTitle });
  await eventCard.getByRole("button").last().click();
  const memberRow = page.getByRole("row").filter({ hasText: USERS.member2.name });
  await expect(memberRow).toBeVisible();
  await memberRow.getByRole("button").first().click();

  const pool = await testDb();
  try {
    const member2Id = await fixtureMemberId(pool, USERS.member2);
    const stored = await pool.query(
      `SELECT em.trang_thai FROM dbo.su_kien_thanh_vien em
       JOIN dbo.su_kien e ON e.id=em.su_kien_id
       WHERE e.ten=$1 AND em.thanh_vien_id=$2`,
      [editedTitle, member2Id],
    );
    expect(stored.rows[0]?.trang_thai).toBe("ATTENDED");
  } finally {
    await pool.end();
  }
});

test("E2E-04: member proposes and votes; treasurer approves and database stores one CHI", async ({ page }) => {
  // This flow visits multiple role-protected routes; the first App Router compile can exceed the default 30s.
  test.setTimeout(90_000);
  const title = `${RUN_LABEL} proposal`;
  await login(page, USERS.member1.email);
  await page.goto("/proposals");
  await page.locator("main header button").first().click();
  const form = page.locator("form").first();
  await form.locator("input").nth(0).fill(title);
  await form.locator("textarea").fill(`${RUN_LABEL} approval transaction check`);
  await form.locator('input[type="number"]').fill("75");
  await form.locator("button").first().click();
  let proposalCard = page.locator("article").filter({ hasText: title });
  await expect(proposalCard).toBeVisible();

  await login(page, USERS.member2.email);
  await page.goto("/proposals");
  proposalCard = page.locator("article").filter({ hasText: title });
  await proposalCard.getByRole("button").first().click();

  await login(page, USERS.treasurer.email);
  await page.goto("/dashboard/proposals");
  const proposalRow = page.getByRole("row").filter({ hasText: title });
  await expect(proposalRow).toBeVisible();
  await proposalRow.getByRole("button").first().click();
  await expect(page.getByRole("row").filter({ hasText: title })).toHaveCount(0);

  const pool = await testDb();
  try {
    const stored = await pool.query(
      `SELECT d.trang_thai,count(g.id)::int AS charges FROM dbo.de_xuat_chi d
       LEFT JOIN dbo.giao_dich_quy g ON g.de_xuat_id=d.id WHERE d.tieu_de=$1
       GROUP BY d.trang_thai`,
      [title],
    );
    expect(stored.rows[0]).toEqual({ trang_thai: "APPROVED", charges: 1 });
  } finally {
    await pool.end();
  }
});

test("E2E-05: transaction edit and reversal APIs feed the rendered statement and reject duplicate reversal", async ({ page }) => {
  await login(page, USERS.treasurer.email);
  const token = await page.evaluate(() => localStorage.getItem("mediclub_access_token"));
  const apiBase = process.env.MED09_E2E_API_URL;
  const create = await page.request.post(`${apiBase}/fund/transactions`, {
    headers: { authorization: `Bearer ${token}` },
    data: { loai: "THU", soTien: 25, noiDung: `${RUN_LABEL} original transaction` },
  });
  expect(create.status()).toBe(201);
  const originalId = (await create.json()).id;

  const edit = await page.request.patch(`${apiBase}/fund/transactions/${originalId}`, {
    headers: { authorization: `Bearer ${token}` },
    data: { loai: "THU", soTien: 30, noiDung: `${RUN_LABEL} edited transaction` },
  });
  expect(edit.status()).toBe(200);
  const reversal = await page.request.post(`${apiBase}/fund/transactions/${originalId}/reversal`, {
    headers: { authorization: `Bearer ${token}` },
    data: { noiDung: `${RUN_LABEL} reversal transaction` },
  });
  expect(reversal.status()).toBe(201);
  const duplicate = await page.request.post(`${apiBase}/fund/transactions/${originalId}/reversal`, {
    headers: { authorization: `Bearer ${token}` },
    data: { noiDung: `${RUN_LABEL} duplicate browser reversal` },
  });
  expect(duplicate.status()).toBe(422);

  await page.goto("/fund");
  await expect(page.getByText(`${RUN_LABEL} edited transaction`)).toBeVisible();
  await expect(page.getByText(`${RUN_LABEL} reversal transaction`)).toBeVisible();
  const pool = await testDb();
  try {
    const rows = await pool.query(
      `SELECT count(*) FILTER (WHERE giao_dich_goc_id=$1)::int AS reversals,
              max(so_tien) FILTER (WHERE id=$1) AS original_amount
       FROM dbo.giao_dich_quy WHERE id=$1 OR giao_dich_goc_id=$1`,
      [originalId],
    );
    expect(rows.rows[0]).toEqual({ reversals: 1, original_amount: "30.00" });
  } finally {
    await pool.end();
  }
});

test("E2E-07 / TC01: fund form rejects invalid amounts and submits one valid transaction", async ({ page }) => {
  await login(page, USERS.treasurer.email);
  await page.goto("/fund");
  const form = page.locator('form').filter({ has: page.getByTestId("manual-transaction-amount") });
  await expect(form).toBeVisible();
  const amount = page.getByTestId("manual-transaction-amount");
  const description = form.locator('input[name="noiDung"]');
  await description.fill(`${RUN_LABEL} TC01 browser transaction`);

  const pool = await testDb();
  const snapshot = async () => {
    const result = await pool.query(`
      SELECT count(*)::int AS count,
             COALESCE(SUM(so_tien) FILTER (WHERE loai='THU'),0)-
             COALESCE(SUM(so_tien) FILTER (WHERE loai='CHI'),0) AS balance
      FROM dbo.giao_dich_quy
    `);
    return result.rows[0];
  };
  const initial = await snapshot();
  let postCount = 0;
  const observePost = (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/fund/transactions") postCount += 1;
  };
  page.on("request", observePost);
  try {
    const invalidInputs = [
      { value: "0", message: /lớn hơn 0/ },
      { value: "-5", message: /lớn hơn 0/ },
      { value: "abc", message: /định dạng/ },
      { value: "12.345", message: /định dạng/ },
      { value: "", message: /Vui lòng nhập/ },
    ];
    for (const invalid of invalidInputs) {
      await amount.fill(invalid.value);
      await form.getByRole("button", { name: "Ghi giao dịch" }).click();
      await expect(form.getByRole("alert")).toContainText(invalid.message);
      expect(postCount, `invalid amount '${invalid.value}' must not call API`).toBe(0);
      expect(await snapshot(), `invalid amount '${invalid.value}' must not change DB`).toEqual(initial);
    }

    await amount.fill("17.25");
    await page.route("**/api/fund/transactions", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await form.evaluate((element) => {
      const target = element;
      target.requestSubmit();
      target.requestSubmit();
    });
    await expect(page.getByRole("status")).toContainText("Đã ghi nhận giao dịch");
    expect(postCount, "rapid repeated submit must send one request").toBe(1);
    const final = await snapshot();
    expect(final.count).toBe(initial.count + 1);
    expect(Number(final.balance)).toBe(Number(initial.balance) + 17.25);
    const persisted = await pool.query(
      `SELECT count(*)::int AS count FROM dbo.giao_dich_quy WHERE noi_dung=$1 AND so_tien=17.25`,
      [`${RUN_LABEL} TC01 browser transaction`],
    );
    expect(persisted.rows[0].count).toBe(1);
  } finally {
    page.off("request", observePost);
    await pool.end();
  }
});

