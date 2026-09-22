import fs from 'node:fs';
import path from 'node:path';

const requestedTarget = process.argv[2];
if (!requestedTarget) {
  console.error('Usage: node scripts/verify-no-mcp-runtime.js <export-target>');
  process.exit(2);
}
const target = path.resolve(requestedTarget);
const forbiddenNames = new Set([
  'mcp_interaction_server.gd',
  'mcp_interaction_server.gd.uid',
  'McpInteractionServer',
]);
const textExtensions = new Set(['.godot', '.cfg', '.ini', '.json', '.tscn', '.tres', '.gd', '.txt']);
let violations = [];

function scan(current) {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) {
    violations.push(`${current}: symbolic link is not permitted in an export verification target`);
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(current)) scan(path.join(current, entry));
    return;
  }
  if (forbiddenNames.has(path.basename(current))) violations.push(`${current}: forbidden MCP runtime artifact`);
  if (textExtensions.has(path.extname(current))) {
    const content = fs.readFileSync(current, 'utf8');
    if (/McpInteractionServer|mcp_interaction_server\.gd|127\.0\.0\.1:9090/.test(content)) {
      violations.push(`${current}: MCP runtime reference`);
    }
  }
}

if (!fs.existsSync(target)) {
  console.error(`Verification target does not exist: ${target}`);
  process.exit(2);
}
scan(target);
if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`No MCP runtime artifacts found in ${target}`);
