#!/usr/bin/env node
// ST-07: genereert src/ui/licenses.generated.ts uit dezelfde bron als `check:licenses` (package.json-bestanden in
// node_modules, transitief vanaf de productie-dependencies). Per pakket: naam, versie, SPDX-licentie en de
// copyrightregels uit het licentiebestand; daarnaast één volledige tekst per gebruikte licentiesoort.
// Gebruik: npm run gen:licenses (na elke wijziging in dependencies; een test controleert dat het bestand actueel is).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOW, productionPackages } from './check-licenses.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/ui/licenses.generated.ts');

function licenseFile(dir) {
  const f = fs.readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.[a-z]+)?$/i.test(n) || /^licen[cs]e[-_.]/i.test(n));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '') : null;
}

/** Apache-2.0 §4(d): de inhoud van een NOTICE-bestand van het pakket moet mee (review CR-03 K-3). */
function noticeFile(dir) {
  const f = fs.readdirSync(dir).find((n) => /^notice(\.[a-z]+)?$/i.test(n));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '').trim() : null;
}

function copyrights(text) {
  if (!text) return [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => (/^(copyright\b|©)/i.test(l) || (/^\(c\)/i.test(l) && /\b(19|20)\d\d\b/.test(l))) && !/copyright (notice|holder|owner|license)/i.test(l) && l.length < 200);
  return [...new Set(lines)].slice(0, 3);
}

/** De licentietekst zonder de copyrightregels van dat ene pakket (die staan per pakket in de lijst). */
function template(text) {
  return text
    .split('\n')
    .map((l) => (/^\s*(copyright\b|\(c\)|©)/i.test(l.trim()) && !/copyright (notice|holder|owner|license)/i.test(l) ? 'Copyright (c) <houder(s)>: zie de vermelding bij het pakket.' : l))
    .join('\n')
    .trim();
}

/** Losse SPDX-ID's uit een expressie (voor de tekstenlijst). */
const ids = (expr) => String(expr).replace(/[()]/g, ' ').split(/\s+/).filter((t) => t && !/^(AND|OR|WITH)$/i.test(t));

export function generate(root = ROOT) {
  const pkgs = productionPackages(root);
  const entries = [];
  const textFor = new Map();
  for (const p of pkgs) {
    const text = licenseFile(p.dir);
    const c = copyrights(text);
    const entry = { n: p.name, v: p.version, l: p.license, c: c.length > 0 ? c : p.author ? [`Copyright (c) ${p.author}`] : [] };
    const notice = /Apache-2\.0/.test(p.license) ? noticeFile(p.dir) : null;
    if (notice) entry.notice = notice;
    entries.push(entry);
    // Eén representatieve volledige tekst per licentiesoort (van een pakket met precies die ene licentie).
    if (text && ids(p.license).length === 1 && !textFor.has(p.license) && text.length > 100) textFor.set(p.license, template(text));
  }
  // Bij "A OR B" geldt voor ons de eerste toegestane licentie; alleen die tekst is nodig.
  const used = [...new Set(entries.flatMap((e) => (/\bOR\b/.test(e.l) ? [ids(e.l).find((id) => ALLOW.has(id))] : ids(e.l)).filter(Boolean)))].sort();
  const texts = Object.fromEntries(used.map((id) => [id, textFor.get(id) ?? `Zie https://spdx.org/licenses/${id}.html`]));
  const body =
    '// GEGENEREERD door scripts/gen-licenses.mjs (ST-07). Niet met de hand wijzigen; draai `npm run gen:licenses`.\n' +
    '/* eslint-disable */\n' +
    '/** n = naam, v = versie, l = SPDX-licentie, c = copyrightregels, notice = NOTICE-inhoud (Apache-2.0 §4(d)). */\n' +
    'export interface LicenseEntry { n: string; v: string; l: string; c: string[]; notice?: string }\n' +
    `export const LICENSE_ENTRIES: LicenseEntry[] = ${JSON.stringify(entries)};\n` +
    '/** Eén volledige tekst per licentiesoort; de copyrightregels per pakket staan in LICENSE_ENTRIES. */\n' +
    `export const LICENSE_TEXTS: Record<string, string> = ${JSON.stringify(texts)};\n`;
  return body;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(OUT, generate());
  console.log(`Geschreven: ${path.relative(ROOT, OUT)}`);
}
