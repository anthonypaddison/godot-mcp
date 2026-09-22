#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';

const project = mkdtempSync(join(tmpdir(), 'godot-mcp-stale-token-'));
const projectFile = join(project, 'project.godot');
writeFileSync(projectFile, `config_version=5\n\n[application]\nconfig/name="Stale Token Test"\nrun/main_scene="res://main.tscn"\n`);
writeFileSync(join(project, 'main.tscn'), '[gd_scene format=3]\n\n[node name="Root" type="Node"]\n');
const originalHash = () => createHash('sha256').update(readFileSync(projectFile)).digest('hex');
const initialHash = originalHash();
const recoveryDir = join(tmpdir(), 'godot-mcp-recovery');
let mcp;

function rpc(id, name, argumentsValue = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} timed out`)), 30000);
    const onLine = line => {
      if (!line.trim()) return;
      let parsed;
      try { parsed = JSON.parse(line); } catch { return; }
      if (parsed.id !== id) return;
      clearTimeout(timer);
      mcp.stdout.off('data', onData);
      resolve(parsed);
    };
    let buffer = '';
    const onData = data => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) onLine(line);
    };
    mcp.stdout.on('data', onData);
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: name, params: argumentsValue }) + '\n');
  });
}

function tool(id, name, args = {}) {
  return rpc(id, 'tools/call', { name, arguments: args });
}

function text(result) {
  return (result.result?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
}

function godotPid() {
  const rows = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n');
  const match = rows.find(row => row.includes(`godot`) && row.includes(`--path ${project}`));
  return match ? Number(match.trim().split(/\s+/, 1)[0]) : null;
}

function sessionToken() {
  const pid = godotPid();
  if (!pid) throw new Error('Godot child not found');
  const environment = execFileSync('ps', ['eww', '-p', String(pid)], { encoding: 'utf8' });
  const match = environment.match(/GODOT_MCP_SESSION_TOKEN=([0-9a-f]{64})/);
  if (!match) throw new Error('Session token not found in disposable child environment');
  return match[1];
}

function portFromDebug(result) {
  const match = text(result).match(/MCP_READY (\d+)/);
  if (!match) throw new Error('Ephemeral port not announced');
  return Number(match[1]);
}

function socketCommand(port, token) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(JSON.stringify({ command: 'get_scene_tree', params: {}, id: 1, token }) + '\n');
    });
    let buffer = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('IPC command timed out')); }, 5000);
    socket.on('data', data => {
      buffer += data.toString();
      if (!buffer.includes('\n')) return;
      clearTimeout(timer);
      socket.destroy();
      resolve(JSON.parse(buffer.trim()));
    });
    socket.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

async function portClosed(port) {
  try { await socketCommand(port, 'invalid'); return false; } catch { return true; }
}

async function startSession(id) {
  await tool(id, 'run_project', { projectPath: project });
  await new Promise(resolve => setTimeout(resolve, 2500));
  const port = portFromDebug(await tool(id + 1, 'get_debug_output'));
  const token = sessionToken();
  return { port, token };
}

async function stopSession(id, port) {
  await tool(id, 'stop_project');
  const closed = await portClosed(port);
  if (!closed) throw new Error('Runtime listener remained open after stop');
  if (originalHash() !== initialHash) throw new Error('Project state changed after session stop');
  if (existsSync(join(project, 'mcp_interaction_server.gd'))) throw new Error('MCP helper remained after session stop');
  return closed;
}

try {
  mcp = spawn(process.execPath, ['build/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GODOT_MCP_ALLOWED_DIRS: project },
  });
  await rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'stale-token-test', version: '1' } });

  const sessionA = await startSession(2);
  const validA = await socketCommand(sessionA.port, sessionA.token);
  if (!validA.success) throw new Error('Session A token was not accepted');
  const tokenA = sessionA.token;
  await stopSession(4, sessionA.port);
  if (await portClosed(sessionA.port) !== true) throw new Error('Session A port accepted post-shutdown traffic');

  const sessionB = await startSession(5);
  if (sessionB.token === tokenA) throw new Error('Session token was reused');
  const stale = await socketCommand(sessionB.port, tokenA);
  if (stale.error !== 'Authentication failed') throw new Error('Stale Session A token was accepted by Session B');
  const validB = await socketCommand(sessionB.port, sessionB.token);
  if (!validB.success) throw new Error('Session B token was not accepted');
  await stopSession(7, sessionB.port);

  const projectText = readFileSync(projectFile, 'utf8');
  const recoveryText = existsSync(recoveryDir)
    ? execFileSync('find', [recoveryDir, '-type', 'f', '-maxdepth', '1', '-print', '-exec', 'shasum', '{}', ';'], { encoding: 'utf8' })
    : '';
  if (projectText.includes(tokenA) || projectText.includes(sessionB.token) || recoveryText.includes(tokenA) || recoveryText.includes(sessionB.token)) {
    throw new Error('Session token leaked into project or recovery state');
  }
  console.log(JSON.stringify({ sessionAAuthenticated: true, sessionBRejectedStaleA: true, sessionBAuthenticated: true, tokensDiffer: true, listenersClosed: true, tokenLeaked: false }));
} finally {
  if (mcp && mcp.exitCode === null) mcp.kill('SIGTERM');
  rmSync(project, { recursive: true, force: true });
}
