#!/usr/bin/env node
// NF-07: controleert de licenties van alle geïnstalleerde pakketten tegen een allowlist.
// Begrijpt SPDX-expressies (E-19): OR → één toegestane licentie is genoeg; AND → alle moeten toegestaan zijn; haakjes.
import fs from 'node:fs';
import path from 'node:path';

export const ALLOW = new Set([
  'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0', 'Unlicense',
  'BlueOak-1.0.0', 'CC-BY-4.0', 'Python-2.0', 'MPL-2.0',
]);

/** Evalueert een SPDX-expressie tegen de allowlist. */
export function spdxAllowed(expr, allow = ALLOW) {
  const tokens = String(expr).replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/).filter(Boolean);
  let i = 0;
  const parseOr = () => {
    let v = parseAnd();
    while (tokens[i] && tokens[i].toUpperCase() === 'OR') {
      i++;
      const r = parseAnd();
      v = v || r;
    }
    return v;
  };
  const parseAnd = () => {
    let v = parseAtom();
    while (tokens[i] && tokens[i].toUpperCase() === 'AND') {
      i++;
      const r = parseAtom();
      v = v && r;
    }
    return v;
  };
  const parseAtom = () => {
    const t = tokens[i++];
    if (t === '(') {
      const v = parseOr();
      if (tokens[i] === ')') i++;
      return v;
    }
    if (t === undefined) return false;
    return allow.has(t.replace(/\+$/, ''));
  };
  const v = parseOr();
  return v && i === tokens.length;
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ');
  return null;
}

export function scan(root) {
  const problems = [];
  let count = 0;
  const seen = new Set();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const p = path.join(dir, name);
      if (name.startsWith('@')) {
        walk(p);
        continue;
      }
      const pj = path.join(p, 'package.json');
      if (fs.existsSync(pj)) {
        let pkg;
        try {
          pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
        } catch {
          continue;
        }
        if (pkg.name && pkg.version) {
          const key = `${pkg.name}@${pkg.version}`;
          if (!seen.has(key)) {
            seen.add(key);
            count++;
            const lic = licenseOf(pkg);
            if (!lic) problems.push(`${key}: geen licentieveld`);
            else if (!spdxAllowed(lic)) problems.push(`${key}: ${lic}`);
          }
        }
      }
      walk(path.join(p, 'node_modules'));
    }
  };
  walk(path.join(root, 'node_modules'));
  return { count, problems };
}

/** Zoekt de map van een pakket zoals Node dat doet: vanaf `fromDir` omhoog in node_modules. */
function resolvePkgDir(fromDir, name, root) {
  let dir = fromDir;
  for (;;) {
    const cand = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
    if (path.resolve(dir) === path.resolve(root)) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * ST-07: alle productiepakketten (transitief vanaf `dependencies` van de app, inclusief geïnstalleerde optionele en
 * peer-afhankelijkheden), met hun licentie. Dezelfde bron als de licentiecontrole: de package.json-bestanden in node_modules.
 */
export function productionPackages(root) {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const out = new Map();
  const queue = [];
  const enqueue = (fromDir, deps) => {
    for (const name of Object.keys(deps ?? {})) {
      const dir = resolvePkgDir(fromDir, name, root);
      if (dir) queue.push(dir);
    }
  };
  enqueue(root, { ...rootPkg.dependencies, ...rootPkg.optionalDependencies });
  const seenDirs = new Set();
  while (queue.length > 0) {
    const dir = queue.shift();
    const real = fs.realpathSync(dir);
    if (seenDirs.has(real)) continue;
    seenDirs.add(real);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (!out.has(key)) out.set(key, { name: pkg.name, version: pkg.version, license: licenseOf(pkg) ?? 'ONBEKEND', dir, author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? null });
    enqueue(dir, { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies });
  }
  return [...out.values()].sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const { count, problems } = scan(process.cwd());
  if (problems.length > 0) {
    console.error(`Licentiecontrole: ${problems.length} van ${count} pakketten niet toegestaan:\n` + problems.join('\n'));
    process.exit(1);
  }
  console.log(`Licentiecontrole: ${count} pakketten, alle licenties toegestaan.`);
}
