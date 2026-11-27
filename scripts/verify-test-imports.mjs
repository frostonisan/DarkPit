import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;
const root = resolve(process.argv[2] || fileURLToPath(new URL('../', import.meta.url)));
const issues = new Set(), exportsCache = new Map();
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(resolve(directory, entry.name)) : resolve(directory, entry.name));
const astFor = file => parse(readFileSync(file, 'utf8'), { sourceType: 'unambiguous', sourceFilename: file });
function moduleExports(file, visited = new Set()) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  if (visited.has(file)) return new Set();
  visited.add(file);
  const names = new Set();
  for (const node of astFor(file).program.body) {
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
    if (node.type === 'ExportAllDeclaration') {
      for (const name of moduleExports(resolve(dirname(file), node.source.value), visited)) if (name !== 'default') names.add(name);
    }
    if (node.type !== 'ExportNamedDeclaration') continue;
    for (const specifier of node.specifiers) names.add(specifier.exported.name || specifier.exported.value);
    const declaration = node.declaration;
    if (declaration?.id?.name) names.add(declaration.id.name);
    for (const item of declaration?.declarations || []) if (item.id.name) names.add(item.id.name);
  }
  exportsCache.set(file, names);
  return names;
}
function targetFor(file, ref) {
  if (!/\.js(?:[?#].*)?$/.test(ref)) return null;
  if (ref.startsWith('/js/')) return resolve(root, 'docs', '.' + ref.split(/[?#]/)[0]);
  if (/^(?:\.\.\/)+docs\/js\//.test(ref)) return resolve(dirname(file), ref.split(/[?#]/)[0]);
  if (file.startsWith(resolve(root, 'docs/js')) && /^\.\.?\//.test(ref)) return resolve(dirname(file), ref.split(/[?#]/)[0]);
  return null;
}
function check(file, ref, names = []) {
  const target = targetFor(file, ref);
  if (!target) return;
  const label = `${relative(root, file).replaceAll('\\', '/')} -> ${ref}`;
  if (!existsSync(target)) { issues.add(`Missing module: ${label}`); return; }
  if (!target.endsWith('.js')) return;
  const exported = moduleExports(target);
  for (const name of names) if (!exported.has(name)) issues.add(`Missing export ${name}: ${label}`);
}
for (const file of [...walk(resolve(root, 'scripts')), ...walk(resolve(root, 'docs/js'))].filter(file => /\.[cm]?js$/.test(file))) {
  traverse(astFor(file), {
    StringLiteral({ node }) { check(file, node.value); },
    ImportDeclaration({ node }) {
      check(file, node.source.value, node.specifiers.filter(s => s.type !== 'ImportNamespaceSpecifier')
        .map(s => s.type === 'ImportDefaultSpecifier' ? 'default' : s.imported.name || s.imported.value));
    },
    ExportNamedDeclaration({ node }) {
      if (node.source) check(file, node.source.value, node.specifiers.map(s => s.local.name || s.local.value));
    },
    CallExpression(path) {
      const node = path.node;
      if (node.callee.type !== 'Import' || node.arguments[0]?.type !== 'StringLiteral') return;
      const ref = node.arguments[0].value;
      if (!targetFor(file, ref)) return;
      const parent = path.parentPath;
      if (!parent.isAwaitExpression()) return;
      const context = parent.parentPath;
      if (context.isMemberExpression()) {
        const property = context.node.computed ? context.node.property.value : context.node.property.name;
        if (property) check(file, ref, [property]);
      }
      if (!context.isVariableDeclarator()) return;
      if (context.node.id.type === 'ObjectPattern') {
        check(file, ref, context.node.id.properties.filter(p => p.key).map(p => p.key.name || p.key.value));
      } else if (context.node.id.type === 'Identifier') {
        for (const reference of context.scope.getBinding(context.node.id.name)?.referencePaths || []) {
          const member = reference.parentPath;
          if (!member.isMemberExpression() || member.node.object !== reference.node) continue;
          const name = member.node.computed ? member.node.property.value : member.node.property.name;
          if (name) check(file, ref, [name]);
        }
      }
    },
  });
}
if (issues.size) {
  console.error([...issues].sort().join('\n'));
  process.exitCode = 1;
} else console.log('Game/test module paths and static export references OK.');
