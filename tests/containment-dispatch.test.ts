import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type TraceEvent = { type: string; operation?: string; path?: string; executable?: string; args?: string[] };

const entrypoint = resolve(fileURLToPath(new URL('../build/index.js', import.meta.url)));
const preloadSource = `
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
const tracePath = process.env.GODOT_MCP_TEST_TRACE;
const rawAppend = fs.appendFileSync.bind(fs);
const emit = event => rawAppend(tracePath, JSON.stringify(event) + '\\n');
for (const [method, operation] of Object.entries({
  readFileSync: 'read', writeFileSync: 'write', appendFileSync: 'write',
  readdirSync: 'readdir', mkdirSync: 'mkdir', copyFileSync: 'copy',
  renameSync: 'rename', unlinkSync: 'unlink', rmSync: 'remove',
})) {
  const original = fs[method].bind(fs);
  fs[method] = (...args) => {
    if (String(args[0]) !== tracePath) emit({ type: 'fs', operation, path: String(args[0]) });
    return original(...args);
  };
}
const fakeExecFile = (...args) => {
  const callback = args.findLast(arg => typeof arg === 'function');
  emit({ type: 'process', executable: String(args[0]), args: Array.isArray(args[1]) ? args[1].map(String) : [] });
  if (callback) callback(null, '4.7.1.stable', '');
  return undefined;
};
fakeExecFile[promisify.custom] = async (executable, args = []) => {
  emit({ type: 'process', executable: String(executable), args: args.map(String) });
  return { stdout: '4.7.1.stable', stderr: '' };
};
cp.execFile = fakeExecFile;
cp.spawn = (executable, args = []) => {
  emit({ type: 'process', executable: String(executable), args: args.map(String) });
  throw new Error('Unexpected spawn in containment test');
};
syncBuiltinESMExports();
`;

describe('actual MCP stdio dispatch enforces configured filesystem roots', () => {
  let base: string;
  let allowed: string;
  let project: string;
  let outside: string;
  let outsideProject: string;
  let tracePath: string;
  let traceOffset = 0;
  let client: Client;
  let transport: StdioClientTransport;
  let serverStderr = '';
  let previousAllowedDirs: string | undefined;
  let previousGodotPath: string | undefined;

  const resetTrace = () => {
    fs.writeFileSync(tracePath, '');
    traceOffset = 0;
  };
  const readTrace = (): TraceEvent[] => {
    const contents = fs.readFileSync(tracePath, 'utf8');
    const delta = contents.slice(traceOffset);
    traceOffset = contents.length;
    return delta.split('\n').filter(Boolean).map(line => JSON.parse(line));
  };
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
  const operationPaths = (events: TraceEvent[], operation: string, root: string) => events
    .filter(event => event.type === 'fs' && event.operation === operation)
    .map(event => event.path!)
    .filter(path => {
      const canonicalRoot = fs.realpathSync(root);
      return path === canonicalRoot || path.startsWith(`${canonicalRoot}/`);
    });
  const wasRejected = async (promise: Promise<any>) => {
    try {
      const result = await promise;
      return result.isError === true;
    } catch {
      return true;
    }
  };

  beforeAll(async () => {
    base = fs.mkdtempSync(join(tmpdir(), 'godot-mcp-dispatch-'));
    allowed = join(base, 'allowed');
    project = join(allowed, 'game');
    outside = join(base, 'outside');
    outsideProject = join(outside, 'other-game');
    const isolatedTmp = join(base, 'isolated-tmp');
    fs.mkdirSync(join(project, 'scripts'), { recursive: true });
    fs.mkdirSync(join(project, 'assets'), { recursive: true });
    fs.mkdirSync(outsideProject, { recursive: true });
    fs.mkdirSync(isolatedTmp);
    fs.writeFileSync(join(project, 'project.godot'), '[application]\nconfig/name="Dispatch Fixture"\n[layer_names]\nlayer_names/physics_2d/layer_1="World"\n');
    fs.writeFileSync(join(project, 'main.tscn'), '[gd_scene]\n');
    fs.writeFileSync(join(project, 'scripts', 'player.gd'), 'extends Node\n');
    fs.writeFileSync(join(project, 'assets', 'texture.png'), 'synthetic texture');
    fs.writeFileSync(join(project, 'safe.gdshader'), 'shader_type spatial;');
    fs.writeFileSync(join(outside, 'sentinel.txt'), 'synthetic outside sentinel');
    fs.writeFileSync(join(outsideProject, 'project.godot'), '[application]\nconfig/name="Outside Fixture"\n');
    fs.symlinkSync(outsideProject, join(allowed, 'project-link'));
    tracePath = join(base, 'trace.jsonl');
    fs.writeFileSync(tracePath, '');

    previousAllowedDirs = process.env.GODOT_MCP_ALLOWED_DIRS;
    previousGodotPath = process.env.GODOT_PATH;
    process.env.GODOT_MCP_ALLOWED_DIRS = allowed;
    process.env.GODOT_PATH = process.execPath;
    const preloadUrl = `data:text/javascript,${encodeURIComponent(preloadSource)}`;
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', preloadUrl, entrypoint],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        GODOT_MCP_ALLOWED_DIRS: allowed,
        GODOT_PATH: process.execPath,
        GODOT_MCP_TEST_TRACE: tracePath,
        TMPDIR: isolatedTmp,
      },
      stderr: 'pipe',
    });
    transport.stderr?.on('data', chunk => { serverStderr += chunk.toString(); });
    client = new Client({ name: 'containment-dispatch-test', version: '1.0.0' }, { capabilities: {} });
    try { await client.connect(transport); }
    catch (error) { throw new Error(`MCP child failed to connect: ${serverStderr}`, { cause: error }); }
    resetTrace(); // Exclude startup detection and MCP initialization from tool assertions.
  }, 15000);

  afterAll(async () => {
    try { await client?.close(); } catch { /* the transport may already have exited */ }
    if (previousAllowedDirs === undefined) delete process.env.GODOT_MCP_ALLOWED_DIRS;
    else process.env.GODOT_MCP_ALLOWED_DIRS = previousAllowedDirs;
    if (previousGodotPath === undefined) delete process.env.GODOT_PATH;
    else process.env.GODOT_PATH = previousGodotPath;
    fs.rmSync(base, { recursive: true, force: true });
  }, 10000);

  it('dispatches get_project_info only for allowed projects and scans/reads the canonical in-root project', async () => {
    expect(await wasRejected(call('get_project_info', { projectPath: outsideProject }))).toBe(true);
    const deniedEvents = readTrace();
    expect(operationPaths(deniedEvents, 'read', outside)).toHaveLength(0);
    expect(operationPaths(deniedEvents, 'readdir', outside)).toHaveLength(0);
    expect(deniedEvents.filter(event => event.type === 'process')).toHaveLength(0);

    resetTrace();
    expect(await wasRejected(call('get_project_info', { projectPath: join(allowed, 'project-link') }))).toBe(true);
    const symlinkRootEvents = readTrace();
    expect(operationPaths(symlinkRootEvents, 'read', outside)).toHaveLength(0);
    expect(operationPaths(symlinkRootEvents, 'readdir', outside)).toHaveLength(0);
    expect(symlinkRootEvents.filter(event => event.type === 'process')).toHaveLength(0);

    resetTrace();
    const result = await call('get_project_info', { project_path: project });
    expect(result.isError).not.toBe(true);
    const info = JSON.parse(result.content[0].text);
    expect(info.path).toBe(fs.realpathSync(project));
    expect(info.name).toBe('Dispatch Fixture');
    const events = readTrace();
    expect(operationPaths(events, 'read', project)).toContain(join(fs.realpathSync(project), 'project.godot'));
    expect(operationPaths(events, 'readdir', project).length).toBeGreaterThan(0);
    expect(events.some(event => event.type === 'process' && event.args?.includes('--version'))).toBe(true);
  });

  it('dispatches manage_layers and manage_shader; blocked roots/symlinks do not read or write outside', async () => {
    expect(await wasRejected(call('manage_layers', { projectPath: outsideProject, action: 'set', layerType: 'physics_2d', layer: 2, name: 'Blocked' }))).toBe(true);
    let events = readTrace();
    expect(operationPaths(events, 'read', outside)).toHaveLength(0);
    expect(operationPaths(events, 'write', outside)).toHaveLength(0);

    const listed = await call('manage_layers', { projectPath: project, action: 'list' });
    expect(JSON.parse(listed.content[0].text).layers).toContainEqual({ type: 'physics_2d', layer: 1, name: 'World' });
    resetTrace();
    const changed = await call('manage_layers', { projectPath: project, action: 'set', layerType: 'physics_2d', layer: 2, name: 'Actors' });
    expect(changed.isError).not.toBe(true);
    events = readTrace();
    expect(operationPaths(events, 'write', project)).toContain(join(fs.realpathSync(project), 'project.godot'));
    expect(fs.readFileSync(join(project, 'project.godot'), 'utf8')).toContain('layer_names/physics_2d/layer_2="Actors"');

    fs.symlinkSync(join(outside, 'sentinel.txt'), join(project, 'escape.gdshader'));
    resetTrace();
    expect(await wasRejected(call('manage_shader', { projectPath: project, shaderPath: 'escape.gdshader', action: 'read' }))).toBe(true);
    events = readTrace();
    expect(operationPaths(events, 'read', outside)).toHaveLength(0);

    resetTrace();
    const shader = await call('manage_shader', { projectPath: project, shaderPath: 'safe.gdshader', action: 'read' });
    expect(shader.content[0].text).toBe('shader_type spatial;');
    const created = await call('manage_shader', { projectPath: project, shaderPath: 'generated/new.gdshader', action: 'create', source: 'shader_type canvas_item;' });
    expect(created.isError).not.toBe(true);
    expect(fs.readFileSync(join(project, 'generated', 'new.gdshader'), 'utf8')).toBe('shader_type canvas_item;');
  });

  it('dispatches discovery and list_project_files.subdirectory without outside directory scans', async () => {
    expect(await wasRejected(call('list_projects', { directory: outside, recursive: true }))).toBe(true);
    let events = readTrace();
    expect(operationPaths(events, 'readdir', outside)).toHaveLength(0);
    resetTrace();
    const found = await call('list_projects', { directory: allowed, recursive: true });
    expect(found.isError).not.toBe(true);
    expect(JSON.parse(found.content[0].text).some((entry: any) => entry.path === fs.realpathSync(project))).toBe(true);

    fs.symlinkSync(outside, join(project, 'outside-link'));
    resetTrace();
    const valid = await call('list_project_files', { projectPath: project, subdirectory: 'scripts', extensions: ['.gd'] });
    expect(JSON.parse(valid.content[0].text).files).toEqual(['scripts/player.gd']);
    for (const subdirectory of ['../../outside', 'outside-link']) {
      resetTrace();
      expect(await wasRejected(call('list_project_files', { projectPath: project, subdirectory }))).toBe(true);
      events = readTrace();
      expect(operationPaths(events, 'readdir', outside)).toHaveLength(0);
    }
  });

  it('dispatches raw-file reads/writes with traversal, absolute path, and symlink rejection before outside I/O', async () => {
    fs.symlinkSync(join(outside, 'sentinel.txt'), join(project, 'escape.txt'));
    const validRead = await call('read_file', { projectPath: project, filePath: 'project.godot' });
    expect(validRead.content[0].text).toContain('Dispatch Fixture');
    for (const filePath of ['../../outside/sentinel.txt', join(outside, 'sentinel.txt'), 'escape.txt']) {
      resetTrace();
      expect(await wasRejected(call('read_file', { projectPath: project, filePath }))).toBe(true);
      expect(operationPaths(readTrace(), 'read', outside)).toHaveLength(0);
    }
    for (const filePath of ['../../outside/new.txt', join(outside, 'new.txt'), 'escape.txt']) {
      resetTrace();
      expect(await wasRejected(call('write_file', { projectPath: project, filePath, content: 'must not escape' }))).toBe(true);
      expect(operationPaths(readTrace(), 'write', outside)).toHaveLength(0);
    }
    resetTrace();
    const validWrite = await call('write_file', { projectPath: project, filePath: 'generated/inside.txt', content: 'inside' });
    expect(validWrite.isError).not.toBe(true);
    expect(fs.readFileSync(join(project, 'generated', 'inside.txt'), 'utf8')).toBe('inside');
  });

  it('rejects export_project outside/symlink destinations before Godot and resolves valid res:// output', async () => {
    fs.symlinkSync(join(outside, 'sentinel.txt'), join(project, 'export-link.bin'));
    for (const outputPath of ['../../outside/export.bin', join(outside, 'export.bin'), 'export-link.bin']) {
      resetTrace();
      expect(await wasRejected(call('export_project', { projectPath: project, presetName: 'Linux', outputPath }))).toBe(true);
      const events = readTrace();
      expect(operationPaths(events, 'read', outside)).toHaveLength(0);
      expect(events.filter(event => event.type === 'process')).toHaveLength(0);
    }
    resetTrace();
    const result = await call('export_project', { projectPath: project, presetName: 'Linux', outputPath: 'res://build/game.x86_64' });
    expect(result.isError).not.toBe(true);
    const exportCall = readTrace().find(event => event.type === 'process' && event.args?.includes('--export-release'));
    expect(exportCall?.args?.at(-1)).toBe(join(fs.realpathSync(project), 'build', 'game.x86_64'));
  });

  it('rejects export_mesh_library outputPath outside the project before Godot dispatch', async () => {
    resetTrace();
    const result = await call('export_mesh_library', {
      projectPath: project,
      scenePath: 'main.tscn',
      outputPath: join(outside, 'mesh-library.tres'),
    });
    const events = readTrace();
    expect({
      rejected: result.isError === true,
      outsideDestinationReachedProcess: events.some(event => event.type === 'process' && event.args?.some(arg => arg.includes(join(outside, 'mesh-library.tres')))),
    }).toEqual({ rejected: true, outsideDestinationReachedProcess: false });
  });

  it('forwards a valid in-root export_mesh_library res:// destination to the intended operation', async () => {
    resetTrace();
    const result = await call('export_mesh_library', {
      projectPath: project,
      scenePath: 'main.tscn',
      outputPath: 'res://exports/inside.tres',
    });
    expect(result.isError).not.toBe(true);
    const operationCall = readTrace().find(event => event.type === 'process' && event.args?.includes('export_mesh_library'));
    expect(operationCall?.args?.[operationCall.args.indexOf('--path') + 1]).toBe(fs.realpathSync(project));
    expect(operationCall?.args?.[operationCall.args.indexOf('export_mesh_library') + 1]).toContain('res://exports/inside.tres');
  });

  it.each([
    ['project-relative', 'exports/relative.tres', 'res://exports/relative.tres'],
    ['res://', 'res://exports/resource.tres', 'res://exports/resource.tres'],
    ['absolute in-project', 'absolute', 'res://exports/absolute.tres'],
  ])('passes valid %s export_mesh_library destinations as resolved Godot resource paths', async (_label, pathValue, expectedResourcePath) => {
    resetTrace();
    const outputPath = pathValue === 'absolute' ? join(fs.realpathSync(project), 'exports', 'absolute.tres') : pathValue;
    const result = await call('export_mesh_library', { projectPath: project, scenePath: 'main.tscn', outputPath });
    expect(result.isError).not.toBe(true);
    const operationCall = readTrace().find(event => event.type === 'process' && event.args?.includes('export_mesh_library'));
    expect(operationCall?.args?.[operationCall.args.indexOf('--path') + 1]).toBe(fs.realpathSync(project));
    expect(operationCall?.args?.[operationCall.args.indexOf('export_mesh_library') + 1]).toContain(`\"output_path\":\"${expectedResourcePath}\"`);
  });

  it('rejects export_mesh_library traversal, user:// and symlink output escapes without invoking Godot', async () => {
    fs.symlinkSync(outside, join(project, 'mesh-export-link'));
    for (const outputPath of ['../../outside/traversal.tres', 'user://mesh-library.tres', 'mesh-export-link/escaped.tres']) {
      resetTrace();
      const result = await call('export_mesh_library', { projectPath: project, scenePath: 'main.tscn', outputPath });
      expect(result.isError).toBe(true);
      expect(readTrace().filter(event => event.type === 'process')).toHaveLength(0);
    }
  });

  it('rejects unsafe nested headless paths before process invocation and preserves valid res:// references', async () => {
    resetTrace();
    expect(await wasRejected(call('create_resource', {
      projectPath: project,
      resourceType: 'StandardMaterial3D',
      resourcePath: 'res://materials/inside.tres',
      properties: { albedo_texture: 'res://../../outside/sentinel.txt' },
    }))).toBe(true);
    expect(readTrace().filter(event => event.type === 'process')).toHaveLength(0);

    resetTrace();
    const valid = await call('create_resource', {
      projectPath: project,
      resourceType: 'StandardMaterial3D',
      resourcePath: 'res://materials/inside.tres',
      properties: { albedo_texture: 'res://assets/texture.png' },
    });
    expect(valid.isError).not.toBe(true);
    const operationCall = readTrace().find(event => event.type === 'process' && event.args?.includes('create_resource'));
    expect(operationCall?.args?.[operationCall.args.indexOf('--path') + 1]).toBe(fs.realpathSync(project));
    const params = operationCall?.args?.[operationCall.args.indexOf('create_resource') + 1] ?? '';
    expect(params).toContain('res://assets/texture.png');

    resetTrace();
    const runtimeReference = await call('game_get_property', { nodePath: '/root/Player', property: 'position' });
    expect(runtimeReference.isError).toBe(true);
    expect(runtimeReference.content[0].text).toContain('No active Godot process');
    expect(readTrace().filter(event => event.type === 'fs' && ['read', 'write', 'readdir'].includes(event.operation ?? ''))).toHaveLength(0);
  });
});
