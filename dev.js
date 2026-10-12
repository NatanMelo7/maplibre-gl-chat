import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const children = [
  spawn(process.execPath, ['server.js'], { cwd: projectRoot, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--configLoader', 'runner'], { cwd: projectRoot, stdio: 'inherit' })
];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250).unref();
}
for (const child of children) {
  child.on('error', (error) => { console.error('Could not start a development process:', error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
