import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexSource = readFileSync(resolve('src/index.ts'), 'utf8');
const runtimeSource = readFileSync(resolve('src/scripts/mcp_interaction_server.gd'), 'utf8');
const builtRuntimeSource = readFileSync(resolve('build/scripts/mcp_interaction_server.gd'), 'utf8');
const operationsSource = readFileSync(resolve('src/scripts/godot_operations.gd'), 'utf8');

describe('hardened capability boundary', () => {
  it('does not use the fixed 9090 runtime port', () => {
    expect(runtimeSource).not.toContain('listen(9090');
    expect(runtimeSource).toContain('listen(0, "127.0.0.1")');
  });

  it('requires a runtime token and rejects invalid commands', () => {
    expect(runtimeSource).toContain('GODOT_MCP_SESSION_TOKEN');
    expect(runtimeSource).toContain('Authentication failed');
    expect(runtimeSource).toContain('disabled in the hardened MCP runtime');
  });

  it('generates a fresh cryptographic session token', () => {
    expect(indexSource).toContain('randomBytes(32)');
    expect(indexSource).toContain('MCP_READY');
  });

  it('keeps dangerous tools out of the advertised and dispatched boundary', () => {
    expect(indexSource).toContain("'game_eval'");
    expect(indexSource).toContain('REMOVED_TOOLS.has(request.params.name)');
  });

  it('contains no generic dangerous runtime implementations', () => {
    for (const fn of ['func _cmd_eval', 'func _cmd_call_method', 'func _cmd_http_request', 'func _cmd_websocket', 'func _cmd_multiplayer', 'func _cmd_rpc', 'func _cmd_script', 'func _cmd_os_info']) {
      expect(runtimeSource).not.toContain(fn);
      expect(builtRuntimeSource).not.toContain(fn);
    }
    expect(operationsSource).not.toContain('target.set_script(script)');
    expect(operationsSource).not.toContain('Attaching script');
  });

  it('does not log environment values', () => {
    expect(operationsSource).not.toContain('OS.get_environment');
    expect(operationsSource).not.toContain('Environment variables:');
  });
});
