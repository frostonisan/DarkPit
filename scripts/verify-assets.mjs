import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "dossier");
const missing = [];

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
    const clean = ref.split(/[?#]/)[0];
    const base = new URL(baseWebPath, "https://local/");
    return new URL(clean, base).pathname.replace(/^\/+/, "");
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
    missing.push(`${kind}: ${rel(file)} -> ${ref}`);
}

const files = walk(root);
const jsFiles = files.filter((file) => file.endsWith(".js"));
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const linkedCss = new Set();

for (const file of htmlFiles) {
    const text = fs.readFileSync(file, "utf8");
    const baseWebPath = `${rel(file)}`;
    for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const ref = match[1];
        if (/^(https?:|data:|#)/.test(ref)) continue;

        const webPath = webPathFrom(baseWebPath, ref);
        const target = toFile(webPath);
        if (!existsWithFallback(target)) {
            recordMissing(file, ref, "html");
        } else if (webPath.endsWith(".css")) {
            linkedCss.add(target);
        }
    }
}

for (const file of linkedCss) {
    const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const baseWebPath = `${rel(file)}`;
    for (const match of text.matchAll(/url\((?!["']?data:)([^)]+)\)/g)) {
        const ref = match[1].trim().replace(/^["']|["']$/g, "");
        if (/^(https?:|data:|#)/.test(ref)) continue;

        const webPath = webPathFrom(baseWebPath, ref);
        const target = toFile(webPath);
        if (!existsWithFallback(target)) {
            recordMissing(file, ref, "css");
        }
    }
}

for (const file of jsFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/import\s+(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
        const spec = match[1];
        if (!spec.startsWith(".") && !spec.startsWith("/")) continue;

        const target = spec.startsWith("/")
            ? path.join(root, spec.slice(1))
            : path.resolve(path.dirname(file), spec);

        if (!fs.existsSync(target)) {
            recordMissing(file, spec, "import");
        }
    }

    for (const match of text.matchAll(/["']((?:\/?media\/|(?:\.\.?\/)+media\/)[^"'`]+)["']/g)) {
        const ref = match[1];
        if (ref.includes("${")) continue;

        const webPath = webPathFrom("index.html", ref);
        const target = toFile(webPath);
        if (!existsWithFallback(target)) {
            recordMissing(file, ref, "js-asset");
        }
    }
}

if (missing.length > 0) {
    console.error("References manquantes:");
    for (const item of missing) {
        console.error(` - ${item}`);
    }
    process.exit(1);
}

console.log("References assets/imports OK.");
