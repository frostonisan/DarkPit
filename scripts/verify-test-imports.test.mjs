import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./verify-test-imports.mjs', import.meta.url));
function check(t, source) {
  const temporary = resolve(tmpdir()), root = mkdtempSync(join(temporary, 'darkpit-test-imports-'));
  t.after(() => {
    assert.equal(dirname(root), temporary);
    assert.ok(basename(root).startsWith('darkpit-test-imports-'));
    rmSync(root, { recursive: true, force: true });
  });
  for (const [name, content] of Object.entries({
    'docs/js/combat/rules.js': 'export const damage = 1; const css = ".hex";',
    'docs/js/combat/public.js': 'export { damage as hit } from "./rules.js";',
    'scripts/scenario.mjs': source,
  })) {
    const file = join(root, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content);
  }
  const result = spawnSync(process.execPath, [checker, root], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}
test('current exports, aliases, query imports and selectors pass', t => {
  const result = check(t, 'const {hit} = await import("/js/combat/public.js?v=2"); const css = ".hex";');
  assert.equal(result.status, 0, result.output);
});
test('obsolete browser import paths fail before launching a browser', t => {
  const result = check(t, 'await import("/js/removed.js");');
  assert.equal(result.status, 1, result.output); assert.match(result.output, /Missing module/);
});
test('a moved export cannot pass merely because the module exists', t => {
  const result = check(t, 'const api = await import("../docs/js/combat/rules.js"); api.moved();');
  assert.equal(result.status, 1, result.output); assert.match(result.output, /Missing export moved/);
});
