import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join as pathJoin, relative, resolve, sep } from 'node:path';

export function canonicalAllowedRoots(configured: string): string[] {
  return configured.split(process.platform === 'win32' ? /[;,]/ : /[:,]/)
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => {
      try { return realpathSync(value); } catch { return ''; }
    })
    .filter(Boolean);
}

export function isContainedPath(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function canonicalExistingOrParent(target: string): string {
  let current = resolve(target);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) throw new Error('Path has no existing parent');
    current = parent;
  }
  return realpathSync(current);
}

export function resolveAllowedProjectRoot(projectPath: string, roots: readonly string[]): string {
  if (!projectPath || !isAbsolute(projectPath)) throw new Error('Project path must be absolute');
  const canonical = realpathSync(projectPath);
  if (!roots.some(root => isContainedPath(root, canonical))) throw new Error('Project path is outside allowed roots');
  if (lstatSync(projectPath).isSymbolicLink()) throw new Error('Project path may not be a symlink');
  return canonical;
}

export function resolveExistingProjectPath(projectPath: string, childPath: string, roots: readonly string[]): string {
  const root = resolveAllowedProjectRoot(projectPath, roots);
  if (!childPath || isAbsolute(childPath) || childPath.includes('\0')) throw new Error('Invalid project path');
  const candidate = pathJoin(root, childPath);
  const canonical = realpathSync(candidate);
  if (!isContainedPath(root, canonical) || lstatSync(candidate).isSymbolicLink()) throw new Error('Path escapes allowed project root');
  return canonical;
}

export function resolveWritableProjectPath(projectPath: string, childPath: string, roots: readonly string[]): string {
  const root = resolveAllowedProjectRoot(projectPath, roots);
  if (!childPath || isAbsolute(childPath) || childPath.includes('\0')) throw new Error('Invalid project path');
  const candidate = pathJoin(root, childPath);
  const parent = canonicalExistingOrParent(dirname(candidate));
  if (!isContainedPath(root, parent)) throw new Error('Path parent escapes allowed project root');
  if (existsSync(candidate) && (lstatSync(candidate).isSymbolicLink() || !isContainedPath(root, realpathSync(candidate)))) {
    throw new Error('Path escapes allowed project root');
  }
  return candidate;
}

export function resolveSafeOutputPath(projectPath: string, outputPath: string, roots: readonly string[]): string {
  return resolveWritableProjectPath(projectPath, outputPath, roots);
}

export function secureProjectJoin(first: string, rest: readonly string[], roots: readonly string[]): string {
  const root = resolveAllowedProjectRoot(first, roots);
  return resolveWritableProjectPath(root, pathJoin(...rest), roots);
}
