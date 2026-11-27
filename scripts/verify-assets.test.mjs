import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scanner = fileURLToPath(new URL("./verify-assets.mjs", import.meta.url));
const fixture = {
    "index.html": `<html><head><link href="css/main.css?v=1" rel="stylesheet">
        <style>.inline { background: url('media/image.png'); }</style></head><body>
        <!-- <img src="media/comment-missing.png"> -->
        <img src = 'media/a%20b.svg?v=1#icon'><img src=media/image.png>
        <div style="background:url('media/image.png')"></div>
        <a href="mailto:test@example.com">mail</a><a href="#section">section</a>
        <img src="//cdn.example.com/image.png"><img src="data:image/png;base64,AAAA">
        <script type="module" src="js/main.js?v=2"></script>
        <script>const html = \`<img src="media/\${name}.png"><img src="media/template.png">\`;</script>
        <script type="application/json">{"src":"media/json-missing.png"}</script>
        </body></html>`,
    "css/main.css": `/* url(missing.png) */ @import 'extra.css?v=2';
        .a { background: url('../media/a%20b.svg#icon'); }`,
    "css/extra.css": `.b { background:url("../media/a b.svg"); }
        @import url('nested.css');`,
    "css/nested.css": `@import 'main.css'; .c { background: url('../media/nested.png'); }`,
    "js/main.js": `import './side.js?v=1'; import { x } from './dep.js?catalog=v1#x';
        export { x } from './dep.js?v=2'; export * from './dep.js?v=3';
        const lazy = import('./lazy.js?v=1');
        // import './comment-missing.js';
        // const missing = 'media/comment-missing.png';
        const direct = 'media/image.png'; const quoted = \`media/image.png\`;
        const fragment = '<img src="media/fragment.png">';
        const attack = {attackAsset:'./media/assets/spells/spell', attackAssetHD:'./media/assets/spells/custom-hd.jpg'};
        const normal = {attackAsset:'./media/assets/spells/normal'};`,
    "js/side.js": "",
    "js/dep.js": "export const x = 1;",
    "js/lazy.js": "",
    "media/image.png": "",
    "media/template.png": "",
    "media/fragment.png": "",
    "media/nested.png": "",
    "media/a b.svg": "",
    "media/assets/spells/spell-ld.jpg": "",
    "media/assets/spells/custom-hd.jpg": "",
    "media/assets/spells/normal-ld.jpg": "",
    "media/assets/spells/normal-hd.jpg": "",
};

function scan(t, files) {
    const temporaryRoot = path.resolve(os.tmpdir());
    const root = fs.mkdtempSync(path.join(temporaryRoot, "codex-asset-test-"));
    t.after(() => {
        assert.equal(path.dirname(root), temporaryRoot);
        assert.ok(path.basename(root).startsWith("codex-asset-test-"));
        fs.rmSync(root, { recursive: true, force: true });
    });
    for (const [relative, contents] of Object.entries(files)) {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, contents);
    }
    // Run the CLI outside the checkout so relative references cannot resolve by accident.
    const result = spawnSync(process.execPath, [scanner, root], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return { status: result.status, output: result.stdout + result.stderr };
}

test("valid templates, URL encoding, query imports and spell variants pass", t => {
    const result = scan(t, fixture);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /References assets\/imports OK/);
});

const missingCases = [
    ["media/image.png", ["html: index.html -> media/image.png", "css: index.html -> media/image.png", "js-asset: js/main.js -> media/image.png"]],
    ["media/template.png", ["html: index.html -> media/template.png"]],
    ["media/fragment.png", ["html: js/main.js -> media/fragment.png"]],
    ["media/a b.svg", ["html: index.html -> media/a%20b.svg?v=1#icon", "css: css/main.css -> ../media/a%20b.svg#icon"]],
    ["media/nested.png", ["css: css/nested.css -> ../media/nested.png"]],
    ["js/side.js", ["import: js/main.js -> ./side.js?v=1"]],
    ["js/dep.js", ["./dep.js?catalog=v1#x", "./dep.js?v=2", "./dep.js?v=3"]],
    ["js/lazy.js", ["import: js/main.js -> ./lazy.js?v=1"]],
    ["media/assets/spells/spell-ld.jpg", ["js-asset: js/main.js -> ./media/assets/spells/spell-ld.jpg"]],
    ["media/assets/spells/custom-hd.jpg", ["js-asset: js/main.js -> ./media/assets/spells/custom-hd.jpg"]],
    ["media/assets/spells/normal-hd.jpg", ["js-asset: js/main.js -> ./media/assets/spells/normal-hd.jpg"]],
];
for (const [missing, diagnostics] of missingCases) {
    test(`missing ${missing} fails with the reference reported`, t => {
        const files = { ...fixture };
        delete files[missing];
        const result = scan(t, files);
        assert.equal(result.status, 1, result.output);
        for (const diagnostic of diagnostics) assert.ok(result.output.includes(diagnostic), result.output);
        assert.doesNotMatch(result.output, /comment-missing|json-missing|\$\{name\}/);
    });
}

test("HTML, CSS and module imports require exact paths; JS assets retain extension fallback", t => {
    const result = scan(t, {
        "index.html": '<html><link href="main.css"><img src="media/icon"></html>',
        "main.css": '.icon { background: url("media/icon"); }',
        "main.js": 'import "./extensionless"; const icon = "media/icon";',
        "extensionless.js": "",
        "media/icon.svg": "",
    });
    assert.equal(result.status, 1, result.output);
    for (const diagnostic of ["html: index.html -> media/icon", "css: main.css -> media/icon", "import: main.js -> ./extensionless"]) {
        assert.ok(result.output.includes(diagnostic), result.output);
    }
    assert.doesNotMatch(result.output, /js-asset:/);
});

test("syntax errors in nested modules fail verification", t => {
    const result = scan(t, { ...fixture, "js/nested/broken.js": "export const broken = ;" });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /Unexpected token/);
});

test("exported dynamic scripts preserve checks of static HTML assets", t => {
    const source = 'const report = `<html><img src="media/report.png"><script>const fmt=${formatter.toString()}; ${runtime.toString()}</script></html>`;';
    const files = { "index.html": "<html></html>", "js/report.js": source, "media/report.png": "" };
    const valid = scan(t, files);
    assert.equal(valid.status, 0, valid.output);
    delete files["media/report.png"];
    const missing = scan(t, files);
    assert.equal(missing.status, 1, missing.output);
    assert.match(missing.output, /html: js\/report.js -> media\/report.png/);
});

test("static inline scripts still reject invalid JavaScript", t => {
    const result = scan(t, { "index.html": '<html><script>const broken = ;</script></html>' });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /Unexpected token/);
});

test("dynamic exports do not hide invalid adjacent static scripts", t => {
    const result = scan(t, {
        "index.html": "<html></html>",
        "js/report.js": 'const report = `<script>${runtime.toString()}</script><script>const broken = ;</script>`;',
    });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /Unexpected token/);
});
