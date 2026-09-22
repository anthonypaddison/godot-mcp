import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRecoveryManifest, hashContent, recoverStaleSessions, removeRecoveryManifest } from '../src/recovery.js';

const cleanups: string[] = [];
afterEach(() => { while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'godot-mcp-recovery-test-'));
  cleanups.push(root);
  const projectFile = join(root, 'project.godot');
  const originalContent = 'original=1\n';
  const modifiedContent = `${originalContent}injected=1\n`;
  writeFileSync(projectFile, modifiedContent);
  const generated = join(root, 'mcp_interaction_server.gd');
  writeFileSync(generated, 'generated');
  const sessionId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  createRecoveryManifest({ version: 1, projectPath: root, projectFile, originalHash: hashContent(originalContent), modifiedHash: hashContent(modifiedContent), originalContent, generatedFiles: [generated], sessionId, state: 'active' });
  return { projectFile, generated, sessionId, originalContent, modifiedContent };
}

describe('transactional runtime recovery', () => {
  it('restores an unmodified stale session and removes generated files', () => {
    const f = fixture();
    expect(recoverStaleSessions(() => true)).toEqual([]);
    expect(readFileSync(f.projectFile, 'utf8')).toBe(f.originalContent);
    expect(() => readFileSync(f.generated, 'utf8')).toThrow();
  });

  it('preserves a concurrent edit and reports a conflict', () => {
    const f = fixture();
    writeFileSync(f.projectFile, `${f.modifiedContent}external=1\n`);
    expect(recoverStaleSessions(() => true)).toContain(f.projectFile);
    expect(readFileSync(f.projectFile, 'utf8')).toContain('external=1');
    removeRecoveryManifest(f.sessionId);
  });
});
