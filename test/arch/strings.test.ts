// UX-01: geen losse zichtbare teksten in app/ en src/ui/ buiten strings.nl.ts.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== 'strings.nl.ts') out.push(p);
  }
  return out;
}

describe('UX-01: teksten gecentraliseerd', () => {
  it('UX-01: geen JSX-tekst of letterlijke title/placeholder/accessibilityLabel buiten strings.nl.ts', () => {
    const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src/ui'))].filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const jsxText = /(?<!=)>\s*([A-Za-zÀ-ÿ][^<>{};()=]*?)\s*</g;
      const props = /\b(title|placeholder|accessibilityLabel)\s*=\s*["'][^"']+["']/g;
      const hits = [...code.matchAll(jsxText)].map((m) => m[1]).filter((t) => /[A-Za-zÀ-ÿ]{2,}/.test(t) && !/^(Stack|View|Text)$/.test(t));
      expect([path.relative(ROOT, f), hits]).toEqual([path.relative(ROOT, f), []]);
      expect([path.relative(ROOT, f), [...code.matchAll(props)].map((m) => m[0])]).toEqual([path.relative(ROOT, f), []]);
    }
  });
});
