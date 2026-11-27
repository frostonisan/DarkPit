import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const options = new Set(process.argv.slice(2).filter(arg => arg.startsWith('--')));
for (const option of options) if (!['--node', '--browser', '--performance'].includes(option)) throw new Error(`Unknown option: ${option}`);
if (options.size > 1) throw new Error('Choose one of --node, --browser or --performance.');
const selection = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const directory = resolve(process.env.VERIFY_OUTPUT || `outputs/validation-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true });
const tools = new Set(['verify-suite.mjs', 'verify-project.mjs', 'verify-assets.mjs', 'verify-test-imports.mjs']);
const candidates = (await readdir('scripts')).filter(name =>
  (/^verify-.*\.mjs$/.test(name) && !tools.has(name)) || name === 'index-11.test.cjs').sort();
const browserTests = new Set();
for (const name of candidates) {
  if (name.endsWith('-browser.mjs') || /playwright|browser-test-fixture/.test(await readFile(resolve('scripts', name), 'utf8'))) browserTests.add(name);
}
const performance = name => /performance|combat-load|combat-profile/.test(name);
const tests = candidates.filter(name => {
  if (options.has('--node') && browserTests.has(name)) return false;
  if (options.has('--browser') && (!browserTests.has(name) || performance(name))) return false;
  if (options.has('--performance') && !performance(name)) return false;
  if (!options.size && performance(name)) return false;
  return !selection.length || selection.some(pattern => name === pattern || name.includes(pattern));
});
if (!tests.length) throw new Error('No test matched the requested selection.');
console.log(`Running ${tests.length} scripts; reports: ${directory}`);
const results = [];
const longScenarios = new Set(['verify-combat-simulation-browser.mjs',
  'verify-sleep-passives-browser.mjs', 'verify-sprite-drops-browser.mjs']);
let reportWrite = Promise.resolve();
async function run(name) {
  const started = Date.now(), log = createWriteStream(resolve(directory, name + '.log'));
  const args = [...(browserTests.has(name) ? ['--require', resolve('scripts/browser-test-runtime.cjs')] : []), ...(name.includes('.test.') ? ['--test'] : []), resolve('scripts', name)];
  const child = spawn(process.execPath, args, { windowsHide: true, detached: process.platform !== 'win32',
    env: { ...process.env, VERIFY_BROWSER: process.env.VERIFY_BROWSER || 'chromium', MOBILE_ENGINES: process.env.MOBILE_ENGINES || 'chromium' } });
  child.stdout.pipe(log, { end: false });child.stderr.pipe(log, { end: false });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
  }, Number(process.env.VERIFY_TIMEOUT_MS) || (longScenarios.has(name) ? 600000
    : name === 'verify-combat-simulation-performance.mjs' ? 3600000 : 240000));
  const code = await new Promise(done => { child.once('error', error => { log.write(String(error));done(-1); });child.once('close', done); });
  clearTimeout(timeout);await new Promise(done => log.end(done));
  const result = { name, status: timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail', code, seconds: (Date.now() - started) / 1000 };
  results.push(result);
  const report = JSON.stringify({ browser: process.env.VERIFY_BROWSER || 'chromium', total: tests.length, finished: results.length, results }, null, 2);
  reportWrite = reportWrite.then(() => writeFile(resolve(directory, 'summary.json'), report));
  await reportWrite;
  console.log(`${result.status.toUpperCase()} ${name} (${result.seconds.toFixed(1)} s)`);
}
// Finite GIF frame sampling is also sensitive to competing browser workloads.
const exclusive = name => performance(name) || name === 'verify-combat-simulation-browser.mjs'
  || name === 'verify-index15-gifs-browser.mjs';
const ordinary = tests.filter(name => !exclusive(name));
let cursor = 0;
await Promise.all(Array.from({ length: Math.max(1, Number(process.env.VERIFY_WORKERS) || 2) }, async () => {
  while (cursor < ordinary.length) await run(ordinary[cursor++]);
}));
// Timing/performance measurements run without other test browsers competing.
for (const name of tests.filter(exclusive)) await run(name);
const failures = results.filter(result => result.status !== 'pass');
console.log(`${results.length - failures.length}/${tests.length} scripts passed; ${failures.length} failed or timed out.`);
process.exitCode = failures.length ? 1 : 0;
