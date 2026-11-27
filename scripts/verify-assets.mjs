import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import sax from "sax";

const traverse = traverseModule.default || traverseModule;
const root = path.resolve(process.argv[2] ?? fileURLToPath(new URL("../docs", import.meta.url)));
const missing = new Set();
const linkedCss = new Set();

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walk(fullPath));
        } else {
            out.push(fullPath);
        }
    }
    return out;
}

function rel(file) {
    return path.relative(root, file).replaceAll(path.sep, "/");
}

function webPathFrom(baseWebPath, ref) {
    const base = new URL(baseWebPath, "https://local/");
    return decodeURIComponent(new URL(ref, base).pathname).replace(/^\/+/, "");
}

function toFile(webPath) {
    return path.join(root, ...webPath.split("/"));
}

function existsWithFallback(filePath) {
    if (fs.existsSync(filePath)) return true;
    if (path.extname(filePath)) return false;

    return [".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3"].some((ext) =>
        fs.existsSync(`${filePath}${ext}`)
    );
}

function recordMissing(file, ref, kind) {
    missing.add(`${kind}: ${rel(file)} -> ${ref}`);
}

function checkReference(file, ref, kind, baseWebPath = rel(file)) {
    if (!ref || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(ref) || ref.includes("${")) return;
    const webPath = webPathFrom(baseWebPath, ref);
    const target = toFile(webPath);
    const exists = kind === "js-asset" ? existsWithFallback(target) : fs.existsSync(target);
    if (!exists) {
        recordMissing(file, ref, kind);
    } else if (webPath.endsWith(".css")) {
        linkedCss.add(target);
    }
}

function scanCss(file, source, baseWebPath = rel(file)) {
    const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
        checkReference(file, (match[1] ?? match[2] ?? match[3]).trim(), "css", baseWebPath);
    }
    for (const match of text.matchAll(/@import\s+["']([^"']+)["']/gi)) {
        checkReference(file, match[1], "css", baseWebPath);
    }
}

function scanHtml(file, source, baseWebPath = rel(file), dynamicTemplate = false) {
    const parser = sax.parser(false, { lowercase: true });
    let scriptType = "";
    let inStyle = false;
    let style = "";
    parser.onopentag = ({ name, attributes }) => {
        for (const key of ["src", "href", "poster"]) {
            checkReference(file, attributes[key], "html", baseWebPath);
        }
        if (attributes.style) scanCss(file, attributes.style, baseWebPath);
        if (name === "script") scriptType = (attributes.type || "").toLowerCase();
        if (name === "style") { inStyle = true; style = ""; }
    };
    parser.onscript = source => {
        // Exported report scripts only become JavaScript after interpolation.
        // Their static HTML and media references are still checked above.
        if (dynamicTemplate && source.includes("${dynamic}")) return;
        if (!scriptType || /^(?:module|(?:text|application)\/(?:java|ecma)script)$/.test(scriptType)) {
            scanJavaScript(file, source, baseWebPath);
        }
    };
    parser.ontext = text => { if (inStyle) style += text; };
    parser.onclosetag = name => {
        if (name === "style") { scanCss(file, style, baseWebPath); inStyle = false; }
    };
    // SAX needs a root even for fragments and must treat script bodies as raw text.
    parser.write(`<asset-scan-root>${source}</asset-scan-root>`).close();
}

function staticString(node) {
    if (node?.type === "StringLiteral") return node.value;
    if (node?.type === "TemplateLiteral" && !node.expressions.length) return node.quasis[0].value.cooked;
    return null;
}

function propertyName(node) {
    return node?.type === "ObjectProperty" ? (node.key.name ?? node.key.value) : null;
}

function scanJavaScript(file, source, documentBase = "index.html") {
    const ast = parse(source, { sourceType: "unambiguous", sourceFilename: file });
    const checkImport = node => {
        const ref = staticString(node);
        if (ref?.startsWith(".") || ref?.startsWith("/")) checkReference(file, ref, "import");
    };
    function scanString(ref, dynamicTemplate = false) {
        if (/^(?:\/?media\/|(?:\.\.?\/)+media\/)/.test(ref)) {
            checkReference(file, ref, "js-asset", documentBase);
        } else if (/<[a-z][\s\S]*>/i.test(ref)) {
            scanHtml(file, ref, documentBase, dynamicTemplate);
        }
    }
    traverse(ast, {
        ImportDeclaration({ node }) { checkImport(node.source); },
        ExportNamedDeclaration({ node }) { checkImport(node.source); },
        ExportAllDeclaration({ node }) { checkImport(node.source); },
        CallExpression({ node }) {
            if (node.callee.type === "Import") checkImport(node.arguments[0]);
        },
        ObjectProperty({ node, parent }) {
            if (propertyName(node) !== "attackAsset") return;
            const prefix = staticString(node.value);
            if (!prefix) return;
            const hd = parent.properties.find(prop => propertyName(prop) === "attackAssetHD");
            // The loader and attack UI consume LD plus an explicit HD path or the HD suffix.
            checkReference(file, `${prefix}-ld.jpg`, "js-asset", documentBase);
            checkReference(file, staticString(hd?.value) || `${prefix}-hd.jpg`, "js-asset", documentBase);
        },
        StringLiteral({ node, parent }) {
            if (propertyName(parent) === "attackAsset" && parent.value === node) return;
            scanString(node.value);
        },
        TemplateLiteral({ node, parent }) {
            if (propertyName(parent) === "attackAsset" && parent.value === node) return;
            scanString(node.quasis.map(part => part.value.cooked ?? part.value.raw).join("${dynamic}"), node.expressions.length > 0);
        },
    });
}

const files = walk(root);
for (const file of files.filter(file => file.endsWith(".html"))) {
    scanHtml(file, fs.readFileSync(file, "utf8"));
}
for (const file of files.filter(file => /\.[cm]?js$/.test(file))) {
    scanJavaScript(file, fs.readFileSync(file, "utf8"));
}
for (const file of linkedCss) {
    scanCss(file, fs.readFileSync(file, "utf8"));
}

if (missing.size > 0) {
    console.error("References manquantes:");
    for (const item of missing) {
        console.error(` - ${item}`);
    }
    process.exit(1);
}

console.log("References assets/imports OK.");
