// Laagregels uit ARCHITECTURE §2, plus het verbod op globale tijd, timers, willekeur en crypto (E-11, E-21, K-2).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');
const srcFiles = walk(path.join(ROOT, 'src')).map(rel);
const appFiles = walk(path.join(ROOT, 'app')).map(rel);

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function importsOf(file: string): string[] {
  const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const out: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Een import naar een projectbestand, als pad relatief aan de root (zonder extensie), of null voor een pakket. */
function resolveLocal(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  return rel(path.resolve(ROOT, path.dirname(file), spec));
}

const layerOf = (p: string): string => {
  const m = /^src\/(core|storage|sync|service|ui)\//.exec(p);
  if (m) return m[1];
  if (p.startsWith('app/')) return 'app';
  if (p === 'src/config') return 'config';
  return 'root';
};

describe('Architectuur: importregels (§2, S-19, NF-08)', () => {
  it('er zijn bronbestanden om te controleren', () => {
    expect(srcFiles.length).toBeGreaterThan(20);
  });

  it('core importeert niets uit andere lagen en geen react-native/expo-*/node', () => {
    for (const f of srcFiles.filter((f) => f.startsWith('src/core/'))) {
      for (const spec of importsOf(f)) {
        const local = resolveLocal(f, spec);
        if (local) expect([f, layerOf(local)]).toEqual([f, 'core']);
        else expect([f, spec]).toEqual([f, expect.stringMatching(/^(@noble\/(hashes|ciphers)\/.+|fflate)$/)]);
      }
    }
  });

  it('S-19: sync importeert core, config, sync en alleen interfaces; de engine importeert geen transports of nostr', () => {
    for (const f of srcFiles.filter((f) => f.startsWith('src/sync/'))) {
      for (const spec of importsOf(f)) {
        const local = resolveLocal(f, spec);
        if (local) {
          expect([f, ['core', 'sync', 'config'].includes(layerOf(local))]).toEqual([f, true]);
          if (f.startsWith('src/sync/engine/')) {
            expect([f, local.startsWith('src/sync/transports/')]).toEqual([f, false]);
            expect([f, /nostr/i.test(local)]).toEqual([f, false]);
          }
        } else if (f.startsWith('src/sync/engine/')) {
          expect([f, /nostr|expo|react-native|^ws$|^node:/.test(spec)]).toEqual([f, false]);
        } else if (f.startsWith('src/sync/transports/memory/')) {
          expect([f, spec]).toEqual([f, expect.stringMatching(/^(@noble\/hashes\/.+)$/)]);
        } else {
          expect([f, spec]).toEqual([f, expect.stringMatching(/^(nostr-tools\/pure|@noble\/hashes\/.+)$/)]);
        }
      }
    }
  });

  it('storage importeert core en storage; alleen de Expo-drivers importeren expo-*', () => {
    for (const f of srcFiles.filter((f) => f.startsWith('src/storage/'))) {
      for (const spec of importsOf(f)) {
        const local = resolveLocal(f, spec);
        if (local) expect([f, ['core', 'storage'].includes(layerOf(local))]).toEqual([f, true]);
        else if (/^expo-/.test(spec)) expect([f, /\/(ExpoSqliteDriver|ExpoSecureKeyStore)\.ts$/.test(f)]).toEqual([f, true]);
        else expect([f, spec]).toEqual([f, 'not-allowed']);
      }
    }
  });

  it('service importeert core, storage, sync en config; Expo alleen in createApp.ts', () => {
    for (const f of srcFiles.filter((f) => f.startsWith('src/service/'))) {
      for (const spec of importsOf(f)) {
        const local = resolveLocal(f, spec);
        if (local) expect([f, ['core', 'storage', 'sync', 'service', 'config', 'root'].includes(layerOf(local))]).toEqual([f, true]);
        else expect([f, f.endsWith('/createApp.ts')]).toEqual([f, true]);
      }
    }
  });

  it('Node-only code (node:*, ws) staat alleen onder test/', () => {
    for (const f of [...srcFiles, ...appFiles]) {
      for (const spec of importsOf(f)) expect([f, /^node:|^ws$|^fs$|^path$/.test(spec)]).toEqual([f, false]);
    }
  });

  it('E-11 / E-21 / K-2: geen globale Date.now, setTimeout, setInterval, Math.random of crypto buiten de toegestane bestanden', () => {
    const allowed = (f: string) =>
      f.startsWith('src/ui/platform/') || f === 'src/service/createApp.ts' || f === 'src/polyfills.ts' || f === 'src/selftest.ts';
    const banned = [/(^|[^.\w])Date\.now\s*\(/, /(^|[^.\w])setTimeout\s*\(/, /(^|[^.\w])setInterval\s*\(/, /Math\.random\s*\(/, /(^|[^.\w])crypto\./, /globalThis\.crypto/, /\bnew Date\s*\(\s*\)/];
    for (const f of srcFiles.filter((f) => !allowed(f))) {
      // Methodesignaturen in interfaces (`setTimeout(fn: () => void, …)`) zijn geen aanroepen.
      const code = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8')).replace(/^\s*(setTimeout|setInterval|clearTimeout)\s*\(\s*\w+\s*:.*$/gm, '');
      for (const re of banned) expect([f, re.source, re.test(code)]).toEqual([f, re.source, false]);
    }
  });

  it('E-11: nostr-tools generateSecretKey wordt nergens gebruikt', () => {
    for (const f of srcFiles) {
      const code = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      expect([f, /generateSecretKey/.test(code)]).toEqual([f, false]);
    }
  });
});
