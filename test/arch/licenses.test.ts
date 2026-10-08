// NF-07: alle dependencies open source (SPDX OR/AND, MPL-2.0 toegestaan; E-19).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

describe('NF-07: licenties', () => {
  it('NF-07: scripts/check-licenses.mjs slaagt op node_modules', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-licenses.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/alle licenties toegestaan/);
  });

  it('NF-07: SPDX-expressies worden juist geëvalueerd', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { spdxAllowed } from ${JSON.stringify(path.join(ROOT, 'scripts/check-licenses.mjs'))};
         const cases = ['MIT', '(BSD-3-Clause OR GPL-2.0)', 'MIT AND Apache-2.0', 'GPL-3.0', 'MIT AND GPL-3.0', '(MIT OR CC0-1.0)', 'MPL-2.0', 'UNLICENSED'];
         console.log(JSON.stringify(cases.map((c) => spdxAllowed(c))));`,
      ],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(out)).toEqual([true, true, true, false, false, true, true, false]);
  });
});
