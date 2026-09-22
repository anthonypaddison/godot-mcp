import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import {
  canonicalAllowedRoots,
  resolveAllowedProjectRoot,
  resolveExistingProjectPath,
  resolveWritableProjectPath,
} from '../src/filesystem-security.js';

const cleanups: string[] = [];
afterEach(() => { while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true }); });

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'godot-mcp-fs-'));
  const root = join(base, 'project');
  const outside = join(base, 'outside');
  mkdirSync(join(root, 'nested'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(root, 'nested', 'inside.txt'), 'inside');
  writeFileSync(join(outside, 'secret.txt'), 'secret');
  cleanups.push(base);
  return { root, outside, roots: canonicalAllowedRoots(base) };
}

describe('authoritative filesystem boundary', () => {
  it.each(['../outside/secret.txt', '../../outside/secret.txt', 'nested/../outside/secret.txt'])('rejects traversal: %s', child => {
    const f = fixture();
    expect(() => resolveExistingProjectPath(f.root, child, f.roots)).toThrow();
  });

  it.each(['/etc/passwd', '/tmp/evil'])('rejects absolute path: %s', child => {
    const f = fixture();
    expect(() => resolveExistingProjectPath(f.root, child, f.roots)).toThrow();
  });

  it('rejects sibling prefix confusion', () => {
    const f = fixture();
    expect(() => resolveAllowedProjectRoot(`${f.root}-malicious`, f.roots)).toThrow();
  });

  it('rejects file and directory symlink escapes for reads and writes', () => {
    const f = fixture();
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'file-link'));
    symlinkSync(f.outside, join(f.root, 'dir-link'));
    expect(() => resolveExistingProjectPath(f.root, 'file-link', f.roots)).toThrow();
    expect(() => resolveWritableProjectPath(f.root, 'file-link', f.roots)).toThrow();
    expect(() => resolveWritableProjectPath(f.root, 'dir-link/new.txt', f.roots)).toThrow();
  });

  it('rejects symlinked parent for a non-existent destination', () => {
    const f = fixture();
    symlinkSync(f.outside, join(f.root, 'linked-parent'));
    expect(() => resolveWritableProjectPath(f.root, 'linked-parent/new.txt', f.roots)).toThrow();
  });

  it('permits safe non-existent files and legitimate reads', () => {
    const f = fixture();
    const destination = resolveWritableProjectPath(f.root, 'generated/new.txt', f.roots);
    mkdirSync(join(f.root, 'generated'));
    writeFileSync(destination, 'ok');
    expect(readFileSync(resolveExistingProjectPath(f.root, 'generated/new.txt', f.roots), 'utf8')).toBe('ok');
  });

  it('keeps cross-boundary rename and copy from reaching filesystem calls', () => {
    const f = fixture();
    expect(() => resolveWritableProjectPath(f.root, '../outside/moved.txt', f.roots)).toThrow();
    expect(() => resolveWritableProjectPath(f.root, '../outside/copied.txt', f.roots)).toThrow();
    expect(() => resolveExistingProjectPath(f.root, '../outside/secret.txt', f.roots)).toThrow();
    expect(readFileSync(join(f.root, 'nested', 'inside.txt'), 'utf8')).toBe('inside');
  });
});
