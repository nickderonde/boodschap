// D-51 (review CR-03 A-1): Android neemt geen app-data mee in cloud-back-up of toestel-overdracht.
// Gecontroleerd in een echte, gegenereerde manifest (`expo prebuild` in een tijdelijke kopie, alleen Android).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require(path.join(ROOT, 'plugins/withNoDataExtraction')) as { DOMAINS: string[]; DATA_EXTRACTION_RULES: string; FULL_BACKUP_CONTENT: string };

describe('D-51: geen back-up en geen toestel-overdracht op Android', () => {
  let tmp = '';
  let manifest = '';
  let rules = '';
  let full = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boodschap-d51-'));
    for (const f of fs.readdirSync(ROOT)) {
      if (['node_modules', 'dist', 'coverage', '.git', 'ios', 'android', '.expo'].includes(f)) continue;
      fs.cpSync(path.join(ROOT, f), path.join(tmp, f), { recursive: true });
    }
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules/expo/bin/cli'), 'prebuild', '--no-install', '--clean', '--platform', 'android'], {
      cwd: tmp,
      env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
      stdio: 'pipe',
    });
    const res = path.join(tmp, 'android/app/src/main');
    manifest = fs.readFileSync(path.join(res, 'AndroidManifest.xml'), 'utf8');
    rules = fs.readFileSync(path.join(res, 'res/xml/data_extraction_rules.xml'), 'utf8');
    full = fs.readFileSync(path.join(res, 'res/xml/full_backup_content.xml'), 'utf8');
  }, 180_000);

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('D-51: <application> verwijst naar onze regels (niet die van expo-secure-store) en allowBackup staat uit', () => {
    const app = /<application[^>]*>/.exec(manifest)![0];
    expect(app).toMatch(/android:allowBackup="false"/);
    expect(app).toMatch(/android:dataExtractionRules="@xml\/data_extraction_rules"/);
    expect(app).toMatch(/android:fullBackupContent="@xml\/full_backup_content"/);
    expect(app).not.toMatch(/secure_store_/);
  });

  it('D-51: cloud-backup én device-transfer sluiten alle domeinen uit; ook de oude full-backup-content', () => {
    for (const section of ['cloud-backup', 'device-transfer']) {
      const m = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(rules);
      expect([section, !!m]).toEqual([section, true]);
      for (const d of plugin.DOMAINS) expect([section, d, m![1].includes(`<exclude domain="${d}" path="."/>`)]).toEqual([section, d, true]);
      expect(m![1]).not.toMatch(/<include/);
    }
    for (const d of ['root', 'file', 'database', 'sharedpref', 'external']) expect(full).toContain(`<exclude domain="${d}" path="."/>`);
    expect(full).not.toMatch(/<include/);
  });
});
