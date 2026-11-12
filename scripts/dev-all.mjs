import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const processes = [
  spawn(npm, ['run', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npm, ['run', 'start:dev', '--prefix', 'backend'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (!child.killed) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of processes) {
  child.on('error', (error) => { console.error(error); stopAll(1); });
  child.on('exit', (code) => { if (!stopping) stopAll(code ?? 1); });
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
