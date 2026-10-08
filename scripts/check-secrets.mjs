#!/usr/bin/env node
// ST-15: zoekt in de werkmap én de volledige git-historie naar geheimen en persoonsgegevens, vóór de repo publiek wordt.
//
// Wat telt als treffer:
//  - bestanden met sleutels/certificaten (*.p8, *.p12, *.pfx, *.jks, *.keystore, *.mobileprovision, *.pem, *.key) en .env-bestanden;
//  - PEM-blokken met een privésleutel, `nsec1…`-sleutels, API-tokens (GitHub, Google, AWS, Expo, Slack, npm);
//  - 64-hex-geheimen buiten de allowlist (testsleutels en -vectoren in testbestanden);
//  - placeholders in site/ en store/ (KvK-nummer nog niet ingevuld) — de site mag zo niet live;
//  - e-mailadressen buiten de allowlist, lokale paden (/Users/<naam>/, /home/<naam>/, C:\Users\<naam>\), telefoonnummers;
//  - in de historie bovendien: e-mailadressen van auteurs en committers.
//
// Allowlist (gedocumenteerd, zie ALLOW hieronder):
//  - 64-hex in testbestanden (`test/**`, `*.test.ts(x)`): dat zijn vaste testsleutels en testvectoren, geen echte geheimen;
//  - e-mail: het contactadres van de uitgever, de Google-groep voor de gesloten test (PUBLICEREN.md), Co-Authored-By-adressen van GitHub/Anthropic (noreply), voorbeelddomeinen;
//  - `src/ui/licenses.generated.ts`: copyrightvermeldingen van externe pakketten (verplicht volgens hun licentie);
//  - telefoon: het fictieve voorbeeldnummer +31612345678 (invulvoorbeeld in PUBLICEREN.md);
//  - `package-lock.json`: integriteitshashes (sha512, geen 64-hex) en registry-URL's.
//
// Gebruik: npm run check:secrets            (werkmap + historie)
//          node scripts/check-secrets.mjs --worktree   (alleen werkmap)
// Exitcode 1 bij treffers. Dit script herschrijft niets.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ALLOW = {
  emails: [/^info@derondeengineering\.nl$/i, /^boodschap-testers@googlegroups\.com$/i, /^noreply@anthropic\.com$/i, /@users\.noreply\.github\.com$/i, /@example\.(com|org|net)$/i],
  hex64Files: [/^test\//, /\.test\.tsx?$/],
  // Fictieve voorbeeldnummers in documentatie (geen echte nummers): het invulvoorbeeld in docs/PUBLICEREN.md.
  phones: [/^\+31612345678$/],
  skipContentFiles: [/^src\/ui\/licenses\.generated\.ts$/, /^package-lock\.json$/, /^scripts\/check-secrets\.mjs$/, /\.(png|jpe?g|gif|ico|webp|ttf|otf|woff2?)$/i],
};

const BAD_FILE = /(^|\/)(\.env(\.[\w.-]+)?|[^/]+\.(p8|p12|pfx|jks|keystore|mobileprovision|pem|key))$/i;
const ENV_EXAMPLE = /(^|\/)\.env\.example$/i;

// Patronen worden uit delen opgebouwd, zodat dit bestand zichzelf niet als treffer ziet.
const RULES = [
  { id: 'pem-private-key', re: new RegExp('-----BEGIN ' + '([A-Z ]*)PRIVATE KEY-----') },
  { id: 'nostr-nsec', re: new RegExp('\\bn' + 'sec1[02-9ac-hj-np-z]{58}\\b') },
  { id: 'github-token', re: new RegExp('\\b(gh[pousr]_[A-Za-z0-9]{36,}|github_' + 'pat_[A-Za-z0-9_]{40,})\\b') },
  { id: 'google-api-key', re: new RegExp('\\bAI' + 'za[0-9A-Za-z_-]{35}\\b') },
  { id: 'aws-access-key', re: new RegExp('\\bAK' + 'IA[0-9A-Z]{16}\\b') },
  { id: 'slack-token', re: new RegExp('\\bxox' + '[abprs]-[0-9A-Za-z-]{10,}') },
  { id: 'npm-token', re: new RegExp('\\bnpm' + '_[A-Za-z0-9]{36}\\b') },
  { id: 'expo-token', re: new RegExp('EXPO_' + 'TOKEN\\s*[=:]\\s*["\']?[A-Za-z0-9_-]{20,}') },
  { id: 'generic-secret-assignment', re: new RegExp('\\b(api[_-]?key|secret|passw(or)?d|token)\\b\\s*[=:]\\s*["\'][A-Za-z0-9/+_=-]{24,}["\']', 'i') },
  { id: 'hex64', re: /\b[0-9a-fA-F]{64}\b/, hex: true },
  { id: 'local-path', re: new RegExp('(/' + 'Users/[A-Za-z][\\w.-]*/|/home/[a-z][\\w.-]*/|[A-Z]:\\\\Users\\\\[A-Za-z])') },
  { id: 'phone-nl', re: /(\+31|0031)[\s-]?\(?0?\)?[1-9][\d\s-]{7,10}\d|\b06[\s-]?\d{8}\b/ },
  // Review CR-03 C-4: placeholders die niet live mogen (KvK-nummer) in gepubliceerde inhoud (site/, store/).
  { id: 'placeholder', re: new RegExp('KVK-' + 'NUMMER|\\[TO' + 'DO'), only: /^(site|store)\// },
  { id: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, email: true },
];

/** Controleert één regel tekst; geeft de treffers (rule-id + fragment). */
export function scanLine(line, file) {
  const hits = [];
  for (const r of RULES) {
    if (r.email) {
      for (const m of line.matchAll(r.re)) if (!ALLOW.emails.some((a) => a.test(m[0]))) hits.push({ rule: r.id, match: m[0] });
      continue;
    }
    if (r.only && !r.only.test(file)) continue;
    const m = r.re.exec(line);
    if (!m) continue;
    if (r.hex && ALLOW.hex64Files.some((a) => a.test(file))) continue;
    if (r.id === 'phone-nl' && ALLOW.phones.some((a) => a.test(m[0].replace(/[\s-]/g, '')))) continue;
    hits.push({ rule: r.id, match: m[0].slice(0, 80) });
  }
  return hits;
}

export function scanFileName(file) {
  return BAD_FILE.test(file) && !ENV_EXAMPLE.test(file) ? [{ rule: 'secret-file', match: file }] : [];
}

const skip = (file) => ALLOW.skipContentFiles.some((a) => a.test(file));

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 });
}

export function scanWorktree() {
  const files = git(['ls-files', '-co', '--exclude-standard']).split('\n').filter(Boolean);
  const findings = [];
  for (const file of files) {
    for (const h of scanFileName(file)) findings.push({ where: file, ...h });
    if (skip(file)) continue;
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs) || fs.statSync(abs).size > 5_000_000) continue;
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const h of scanLine(line, file)) findings.push({ where: `${file}:${i + 1}`, ...h });
    });
  }
  return findings;
}

export function scanHistory() {
  const findings = [];
  let commits = [];
  try {
    commits = git(['rev-list', '--all']).split('\n').filter(Boolean);
  } catch {
    return findings; // geen git-repo
  }
  // Metagegevens: auteur en committer.
  for (const line of git(['log', '--all', '--format=%h%x09%an <%ae>%x09%cn <%ce>']).split('\n').filter(Boolean)) {
    const [h, author, committer] = line.split('\t');
    for (const who of [author, committer]) {
      const email = /<([^>]+)>/.exec(who)?.[1] ?? '';
      if (email && !ALLOW.emails.some((a) => a.test(email))) findings.push({ where: `commit ${h} (metagegevens)`, rule: 'commit-email', match: email });
    }
    for (const m of git(['log', '-1', '--format=%B', h]).matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)) {
      if (!ALLOW.emails.some((a) => a.test(m[0]))) findings.push({ where: `commit ${h} (bericht)`, rule: 'email', match: m[0] });
    }
  }
  // Inhoud: alle toegevoegde regels in alle commits.
  for (const c of commits) {
    const out = git(['show', '--format=', '--unified=0', '--no-color', c]);
    let file = '';
    for (const line of out.split('\n')) {
      if (line.startsWith('+++ b/')) {
        file = line.slice(6);
        for (const h of scanFileName(file)) findings.push({ where: `${c.slice(0, 7)}:${file}`, ...h });
        continue;
      }
      if (!line.startsWith('+') || line.startsWith('+++') || skip(file)) continue;
      for (const h of scanLine(line.slice(1), file)) findings.push({ where: `${c.slice(0, 7)}:${file}`, ...h });
    }
  }
  return findings;
}

function report(title, findings) {
  console.log(`\n${title}: ${findings.length === 0 ? 'schoon' : `${findings.length} treffer(s)`}`);
  const seen = new Set();
  for (const f of findings) {
    const key = `${f.where}|${f.rule}|${f.match}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  [${f.rule}] ${f.where}: ${f.match}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const wt = scanWorktree();
  report('Werkmap', wt);
  let hist = [];
  if (!process.argv.includes('--worktree')) {
    hist = scanHistory();
    report('Git-historie (alle commits, alleen gelezen)', hist);
  }
  if (wt.length + hist.length > 0) {
    console.log('\nNiet publiceren voordat dit is opgelost. Historie: niet herschrijven zonder besluit van Nick (bijv. een nieuwe, schone root-commit voor de publieke repo).');
    process.exit(1);
  }
  console.log('\nGeen geheimen of persoonsgegevens gevonden.');
}
