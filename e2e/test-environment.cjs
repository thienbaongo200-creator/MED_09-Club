'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('../backend/node_modules/pg');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_PROJECT = 'med09v5test';
const TEST_DATABASE = 'med09_docker_test';
const RUN_CONTEXT = path.join(ROOT, 'test-results', '.med09-e2e-run.json');
const RUN_LOCK = path.join(ROOT, 'test-results', '.med09-database-test.lock');

function readComposeTestEnv() {
  const file = path.join(ROOT, '.env.docker-test');
  const values = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  assert.equal(values.POSTGRES_DB, TEST_DATABASE, 'E2E requires the Compose test database med09_docker_test.');
  for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST_PORT', 'BACKEND_HOST_PORT', 'FRONTEND_HOST_PORT', 'JWT_SECRET', 'NEXT_PUBLIC_API_BASE_URL']) {
    assert.ok(values[key], `Missing ${key} in .env.docker-test; refusing E2E.`);
  }
  return values;
}

function runId() {
  let context;
  try {
    context = JSON.parse(fs.readFileSync(RUN_CONTEXT, 'utf8'));
  } catch {
    // Playwright --list does not execute globalSetup; the config-generated id
    // is sufficient for discovery because this path never touches the DB.
    const discoveryId = process.env.MED09_E2E_RUN_ID;
    assert.match(discoveryId ?? '', /^[a-f0-9]{16}$/i, 'E2E run context is unavailable; refusing to access fixtures.');
    return discoveryId.toLowerCase();
  }
  assert.match(context.runId ?? '', /^[a-f0-9]{16}$/i, 'E2E run context is invalid; refusing to access fixtures.');
  process.env.MED09_E2E_RUN_ID = context.runId.toLowerCase();
  return context.runId.toLowerCase();
}

function initializeRunContext() {
  const value = process.env.MED09_E2E_RUN_ID;
  assert.match(value ?? '', /^[a-f0-9]{16}$/i, 'Playwright config did not initialize the E2E run id.');
  fs.mkdirSync(path.dirname(RUN_CONTEXT), { recursive: true });
  let lock;
  try {
    lock = fs.openSync(RUN_LOCK, 'wx');
  } catch {
    throw new Error('Another E2E run may still own the test database; inspect existing run artifacts before proceeding.');
  }
  fs.closeSync(lock);
  try {
    fs.writeFileSync(RUN_CONTEXT, JSON.stringify({ runId: value.toLowerCase(), startedAt: new Date().toISOString() }), { flag: 'wx' });
  } catch (error) {
    fs.unlinkSync(RUN_LOCK);
    throw error;
  }
  return value.toLowerCase();
}

function finishRunContext() {
  const currentId = runId();
  fs.unlinkSync(RUN_CONTEXT);
  fs.unlinkSync(RUN_LOCK);
  return currentId;
}

function runLabel() {
  return `[MED09E2E:${runId()}]`;
}

function memberEmailPattern() {
  return `e2e+${runId()}-%@med09-e2e.invalid`;
}

function memberEmail(role) {
  return `e2e+${runId()}-${role}@med09-e2e.invalid`;
}

function testDatabaseUrl(env = readComposeTestEnv()) {
  const url = new URL(`postgresql://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:${env.POSTGRES_HOST_PORT}/${TEST_DATABASE}`);
  url.searchParams.set('options', '-c search_path=dbo');
  return url.toString();
}

function createTestPool() {
  return new Pool({ connectionString: testDatabaseUrl(), max: 2, connectionTimeoutMillis: 5000 });
}

function compose(args, timeout = 15_000) {
  return execFileSync('docker', [
    'compose', '-p', COMPOSE_PROJECT, '--env-file', '.env.docker-test', ...args,
  ], { cwd: ROOT, encoding: 'utf8', timeout, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function verifyComposeServices() {
  const services = new Set(compose(['ps', '--status', 'running', '--services']).split(/\r?\n/).filter(Boolean));
  for (const required of ['postgres_db', 'backend', 'frontend']) {
    assert.ok(services.has(required), `Compose project ${COMPOSE_PROJECT} service ${required} is not running; refusing E2E.`);
  }
}

function verifyBackendDatabase() {
  verifyComposeServices();
  const script = "const {Pool}=require('pg');(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL,max:1});try{const r=await p.query('SELECT current_database() AS db,current_schema() AS schema,inet_server_addr()::text AS server,pg_postmaster_start_time()::text AS started');process.stdout.write(JSON.stringify(r.rows[0]))}finally{await p.end()}})().catch(()=>process.exit(17))";
  let result;
  try {
    result = JSON.parse(compose(['exec', '-T', 'backend', 'node', '-e', script]));
  } catch {
    throw new Error('Could not verify the database used by the live Compose backend; E2E writes are refused.');
  }
  assert.equal(result.db, TEST_DATABASE, 'Live backend does not use med09_docker_test; E2E writes are refused.');
  assert.equal(result.schema, 'dbo', 'Live backend search_path is not dbo; E2E writes are refused.');
  assert.ok(result.server && result.started, 'Live backend database identity is incomplete; E2E writes are refused.');
  return result;
}

async function verifyRunnerDatabase(pool, backendIdentity) {
  const { rows } = await pool.query('SELECT current_database() AS db,current_schema() AS schema,inet_server_addr()::text AS server,pg_postmaster_start_time()::text AS started');
  const runner = rows[0];
  assert.equal(runner.db, TEST_DATABASE, 'Runner DB is not med09_docker_test; refusing E2E writes.');
  assert.equal(runner.schema, 'dbo', 'Runner DB search_path is not dbo; refusing E2E writes.');
  assert.equal(runner.server, backendIdentity.server, 'Runner connection is not the PostgreSQL server used by the live backend.');
  assert.equal(runner.started, backendIdentity.started, 'Runner connection is not the live backend PostgreSQL instance.');
  return runner;
}

module.exports = {
  COMPOSE_PROJECT,
  TEST_DATABASE,
  compose,
  createTestPool,
  memberEmail,
  memberEmailPattern,
  readComposeTestEnv,
  initializeRunContext,
  finishRunContext,
  runId,
  runLabel,
  testDatabaseUrl,
  verifyBackendDatabase,
  verifyRunnerDatabase,
};
