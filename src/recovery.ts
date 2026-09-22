import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface RecoveryManifest {
  version: 1;
  projectPath: string;
  projectFile: string;
  originalHash: string;
  modifiedHash: string;
  originalContent: string;
  generatedFiles: string[];
  sessionId: string;
  state: 'prepared' | 'active';
}

const recoveryDir = join(tmpdir(), 'godot-mcp-recovery');

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function ensureRecoveryDir(): void { mkdirSync(recoveryDir, { recursive: true, mode: 0o700 }); }

function manifestPath(sessionId: string): string { return join(recoveryDir, `${sessionId}.json`); }

export function createRecoveryManifest(manifest: RecoveryManifest): string {
  ensureRecoveryDir();
  const path = manifestPath(manifest.sessionId);
  writeFileSync(path, JSON.stringify(manifest), { encoding: 'utf8', mode: 0o600 });
  return path;
}

export function updateRecoveryManifest(manifest: RecoveryManifest): void {
  createRecoveryManifest(manifest);
}

export function removeRecoveryManifest(sessionId: string): void {
  try { unlinkSync(manifestPath(sessionId)); } catch { /* already removed */ }
}

export function recoverStaleSessions(isAllowedProject: (projectPath: string) => boolean): string[] {
  if (!existsSync(recoveryDir)) return [];
  const conflicts: string[] = [];
  for (const name of readdirSync(recoveryDir)) {
    if (!name.endsWith('.json')) continue;
    const path = join(recoveryDir, name);
    try {
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as RecoveryManifest;
      if (manifest.version !== 1 || !manifest.projectFile || !manifest.originalContent || !isAllowedProject(manifest.projectPath)) continue;
      if (!existsSync(manifest.projectFile)) continue;
      const current = readFileSync(manifest.projectFile, 'utf8');
      const currentHash = hashContent(current);
      if (currentHash === manifest.modifiedHash) {
        writeFileSync(manifest.projectFile, manifest.originalContent, 'utf8');
        for (const generated of manifest.generatedFiles) {
          try { if (existsSync(generated)) unlinkSync(generated); } catch { /* leave for manual recovery */ }
        }
        unlinkSync(path);
      } else if (currentHash !== manifest.originalHash) {
        conflicts.push(manifest.projectFile);
      }
    } catch {
      conflicts.push(path);
    }
  }
  return conflicts;
}
