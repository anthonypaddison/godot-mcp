import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['build/index.js'], {
  env: { ...process.env, GODOT_PATH: '/definitely/missing/godot' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { stdout += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });

const timeout = setTimeout(() => child.kill('SIGTERM'), 5000);
const exitCode = await new Promise(resolve => child.on('close', resolve));
clearTimeout(timeout);

if (stdout.trim() !== '') {
  console.error('stdio hygiene failed: diagnostic data was written to stdout');
  process.exit(1);
}
if (stderr.trim() === '') {
  console.error('stdio hygiene failed: expected startup diagnostics on stderr');
  process.exit(1);
}

console.log(JSON.stringify({ exitCode, stdoutBytes: stdout.length, stderrBytes: stderr.length }));
