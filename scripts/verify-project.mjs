import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from '@babel/parser';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);

// Inspect the exported constant without executing the browser/admin module in Node.
const admin = parse(await readFile('docs/js/debug/admin.js', 'utf8'), { sourceType: 'module' });
const versions = admin.program.body.flatMap(node =>
  node.type === 'ExportNamedDeclaration' && node.declaration?.kind === 'const'
    ? node.declaration.declarations.filter(item => item.id.name === 'GAME_VERSION') : []);
assert.equal(versions.length, 1, 'admin.js must export one GAME_VERSION constant');
assert.equal(versions[0].init?.type, 'StringLiteral', 'GAME_VERSION must be a release string');
const version = versions[0].init.value;
assert.match(version, /^\d+\.\d+\.\d+(?:\.\d+)?(?:-dev)?$/, 'Invalid game release number');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
// Four-part visual revisions keep a valid SemVer identifier for npm tooling.
const micro = version.match(/^(\d+\.\d+\.\d+)\.(\d+)(-dev)?$/);
const npmVersion = micro ? `${micro[1]}${micro[3] ? '-dev.' : '+fix.'}${micro[2]}` : version;
assert.equal(pkg.gameVersion || pkg.version, version, 'package.json gameVersion must match GAME_VERSION');
for (const [name, actual] of [['package.json', pkg.version], ['package-lock.json', lock.version],
  ['package-lock.json packages[""]', lock.packages?.['']?.version]]) {
  assert.equal(actual, npmVersion, `${name} must match the npm form of GAME_VERSION`);
}
const readme = await readFile('README.md', 'utf8');
assert.equal(readme.match(/^## Version actuelle : (\S+)/m)?.[1], version, 'README release must match GAME_VERSION');
console.log(`Release metadata matches GAME_VERSION ${version} in admin.js.`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? walk(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
}
function run(args, quiet = false) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, windowsHide: true, stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Checking game and tooling JavaScript syntax...');
for (const file of [...await walk('docs/js'), ...await walk('scripts')].filter(file => /\.[cm]?js$/.test(file))) {
  run(['--check', file], true);
}
run(['--test', 'scripts/verify-assets.test.mjs', 'scripts/verify-test-imports.test.mjs']);
run(['scripts/verify-assets.mjs']);
run(['scripts/audit-sprite-atlases.mjs']);
run(['scripts/build-sprite-preview.mjs', '--check']);
run(['scripts/verify-test-imports.mjs']);
console.log('Project verification passed.');
