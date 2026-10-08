#!/usr/bin/env node
// ST-09: zet ruwe schermafbeeldingen (van Nicks toestellen, met de demolijst uit docs/store/demo-data.md) om naar de
// formaten die Apple en Google eisen, op een achtergrond in de stijl van de app, met optioneel een bijschrift.
//
// Invoer:  store/screenshots/raw/*.png|jpg (de bestandsnaam bepaalt de volgorde; bijv. 01-lijst.png)
//          store/screenshots/captions.json (optioneel): { "01-lijst.png": { "nl": "…", "en": "…" } }
// Uitvoer: store/screenshots/out/<formaat>/<taal>/NN.png, zonder alfakanaal:
//   apple-6.9  1320x2868  (iPhone met Dynamic Island, groot; ook geldig: 1290x2796, 1260x2736)
//   apple-6.3  1179x2556  (iPhone met Dynamic Island, middel; door Apple verplicht als er geen 6.9-beelden zijn)
//   google     1080x1920  (telefoon, 9:16; zijden 320–3840 px, lange zijde ≤ 2x korte zijde)
// Bronnen (gecontroleerd 2026-10-07): developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
// en support.google.com/googleplay/android-developer/answer/9866151.
// Gebruik: npm run make:screenshots [-- --in <map> --out <map>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { encodePng } from './lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const FORMATS = {
  'apple-6.9': { width: 1320, height: 2868, min: 1, max: 10 },
  'apple-6.3': { width: 1179, height: 2556, min: 1, max: 10 },
  google: { width: 1080, height: 1920, min: 2, max: 8 },
};

const COLORS = { top: '#2A9467', bottom: '#17633F', text: '#FFFFFF' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Breekt een bijschrift in maximaal twee regels van ongeveer `max` tekens. */
function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines;
}

/** SVG voor één eindbeeld: achtergrond, bijschrift en het ruwe beeld met afgeronde hoeken. */
export function composeSvg({ width, height }, imageDataUri, imgW, imgH, caption) {
  const pad = Math.round(width * 0.07);
  const captionH = caption ? Math.round(height * 0.16) : 0;
  const top = caption ? pad + captionH : pad;
  const availW = width - 2 * pad;
  const availH = height - top - pad;
  const scale = Math.min(availW / imgW, availH / imgH);
  const w = Math.round(imgW * scale);
  const h = Math.round(imgH * scale);
  const x = Math.round((width - w) / 2);
  const y = top + Math.round((availH - h) / 2);
  const r = Math.round(w * 0.07);
  const fontSize = Math.round(width * 0.062);
  const lines = caption ? wrap(caption, 24) : [];
  const text = lines
    .map((l, i) => `<text x="${width / 2}" y="${pad + Math.round(fontSize * 1.1) + i * Math.round(fontSize * 1.2)}" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${COLORS.text}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${esc(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COLORS.top}"/><stop offset="1" stop-color="${COLORS.bottom}"/></linearGradient>
    <clipPath id="shot"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  ${text}
  <rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="${r + 6}" fill="#000000" opacity="0.18"/>
  <image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shot)" href="${imageDataUri}" xlink:href="${imageDataUri}"/>
</svg>`;
}

function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), mime: 'image/png' };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) throw new Error('JPEG onleesbaar');
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), mime: 'image/jpeg' };
      i += 2 + len;
    }
  }
  throw new Error('alleen PNG of JPEG');
}

export function makeScreenshots({ inDir = path.join(ROOT, 'store/screenshots/raw'), outDir = path.join(ROOT, 'store/screenshots/out'), captionsFile } = {}) {
  const files = fs.existsSync(inDir) ? fs.readdirSync(inDir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort() : [];
  if (files.length === 0) throw new Error(`Geen ruwe beelden in ${inDir}. Zie docs/store/demo-data.md.`);
  const capPath = captionsFile ?? path.join(path.dirname(inDir), 'captions.json');
  const captions = fs.existsSync(capPath) ? JSON.parse(fs.readFileSync(capPath, 'utf8')) : null;
  const langs = captions ? ['nl', 'en'] : ['alle'];
  const written = [];
  for (const [name, fmt] of Object.entries(FORMATS)) {
    if (files.length < fmt.min || files.length > fmt.max) console.warn(`Let op: ${name} vraagt ${fmt.min}–${fmt.max} beelden, er zijn er ${files.length}; alleen de eerste ${fmt.max} worden gebruikt.`);
    for (const lang of langs) {
      const dir = path.join(outDir, name, lang);
      fs.mkdirSync(dir, { recursive: true });
      files.slice(0, fmt.max).forEach((f, i) => {
        const buf = fs.readFileSync(path.join(inDir, f));
        const { width, height, mime } = imageSize(buf);
        const caption = captions?.[f]?.[lang] ?? null;
        const svg = composeSvg(fmt, `data:${mime};base64,${buf.toString('base64')}`, width, height, caption);
        const img = new Resvg(svg, { fitTo: { mode: 'width', value: fmt.width }, font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' } }).render();
        const out = path.join(dir, `${String(i + 1).padStart(2, '0')}.png`);
        fs.writeFileSync(out, encodePng(img.width, img.height, img.pixels, { alpha: false }));
        written.push(out);
      });
    }
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (k) => {
    const i = process.argv.indexOf(k);
    return i > 0 ? path.resolve(process.argv[i + 1]) : undefined;
  };
  const out = makeScreenshots({ inDir: arg('--in'), outDir: arg('--out') });
  for (const f of out) console.log(`  ${path.relative(ROOT, f)}`);
}
