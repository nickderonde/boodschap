#!/usr/bin/env node
// ST-04: maakt alle iconen, het opstartscherm en de feature graphic opnieuw uit de SVG-bron in assets/source/.
// Gebruik: npm run make:icons. Renderen met @resvg/resvg-js (MPL-2.0, devDependency); PNG's via scripts/lib/png.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { encodePng, rgb } from './lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/source');
const OUT = path.join(ROOT, 'assets/images');
const STORE = path.join(ROOT, 'store/graphics');
const SITE = path.join(ROOT, 'site/assets');

// Kleuren uit src/ui/theme.ts (accent licht/donker, achtergronden).
export const COLORS = { accent: '#1F7A55', accentDeep: '#17633F', accentLight: '#2A9467', accentDark: '#3DBB82', bgLight: '#F6F6F3', bgDark: '#111214', white: '#FFFFFF' };

const glyphPart = fs.readFileSync(path.join(SRC, 'glyph.svg.part'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/** De tas met vinkje in de gegeven kleuren; check = 'cut' maakt het vinkje doorzichtig (masker). */
function glyph({ bag, check, transform = '' }) {
  if (check === 'cut') {
    const shape = glyphPart.replaceAll('{{BAG}}', '#FFFFFF').replace('id="glyph"', 'id="m"').replaceAll('{{CHECK}}', '#000000');
    return `<defs><mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">${shape}</mask></defs>
      <g transform="${transform}"><rect x="0" y="0" width="1024" height="1024" fill="${bag}" mask="url(#cut)"/></g>`;
  }
  return `<g transform="${transform}">${glyphPart.replaceAll('{{BAG}}', bag).replaceAll('{{CHECK}}', check)}</g>`;
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const gradient = (id, a, b) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
const CENTER = 'translate(0 -11)'; // glyph-midden (y 523) naar 512
const SAFE = 'translate(512 512) scale(0.68) translate(-512 -523)'; // binnen de veilige cirkel van het adaptieve icoon

export const VARIANTS = {
  // iOS / algemeen: volledig vlak, geen alfa (Apple).
  'icon.png': { size: 1024, alpha: false, body: () => gradient('g', COLORS.accentLight, COLORS.accentDeep) + `<rect width="1024" height="1024" fill="url(#g)"/>` + glyph({ bag: COLORS.white, check: COLORS.accent, transform: CENTER }) },
  // iOS 18: donker en getint (Should): doorzichtige achtergrond, het systeem levert de achtergrond.
  'icon-ios-dark.png': { size: 1024, alpha: true, body: () => glyph({ bag: COLORS.accentDark, check: 'cut', transform: CENTER }) },
  'icon-ios-tinted.png': { size: 1024, alpha: true, body: () => glyph({ bag: COLORS.white, check: 'cut', transform: CENTER }) },
  // Android adaptive icon: voorgrond doorzichtig binnen de veilige zone; achtergrondkleur in app.json; monochroom.
  'adaptive-foreground.png': { size: 1024, alpha: true, body: () => glyph({ bag: COLORS.white, check: COLORS.accent, transform: SAFE }) },
  'adaptive-monochrome.png': { size: 1024, alpha: true, body: () => glyph({ bag: COLORS.white, check: 'cut', transform: SAFE }) },
  // Opstartscherm: afgerond icoon op de achtergrond van het thema (licht/donker).
  'splash-icon.png': { size: 1024, alpha: true, body: () => gradient('g', COLORS.accentLight, COLORS.accentDeep) + `<rect width="1024" height="1024" rx="230" fill="url(#g)"/>` + glyph({ bag: COLORS.white, check: COLORS.accent, transform: CENTER }) },
  'splash-icon-dark.png': { size: 1024, alpha: true, body: () => `<rect width="1024" height="1024" rx="230" fill="${COLORS.accentLight}"/>` + glyph({ bag: COLORS.white, check: COLORS.accentLight, transform: CENTER }) },
};

function render(svgText, width, height) {
  const r = new Resvg(svgText, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' } });
  const img = r.render();
  if (img.width !== width || img.height !== height) throw new Error(`render ${img.width}x${img.height} ≠ ${width}x${height}`);
  return img.pixels;
}

function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`  ${path.relative(ROOT, file)}`);
}

export function makeAll() {
  console.log('Iconen en opstartscherm:');
  for (const [name, v] of Object.entries(VARIANTS)) {
    const text = svg(1024, 1024, v.body());
    write(path.join(SRC, name.replace('.png', '.svg')), text);
    write(path.join(OUT, name), encodePng(v.size, v.size, render(text, v.size, v.size), { alpha: v.alpha, background: rgb(COLORS.accent) }));
  }
  // Play-icoon 512x512 (32-bit PNG, volledig gevuld; Google maakt zelf de afronding).
  const play = svg(1024, 1024, VARIANTS['icon.png'].body());
  write(path.join(STORE, 'play-icon-512.png'), encodePng(512, 512, render(play, 512, 512), { alpha: true }));
  // Feature graphic 1024x500 (Google; JPEG of 24-bit PNG zonder alfa).
  const fg = svg(
    1024,
    500,
    gradient('g', COLORS.accentLight, COLORS.accentDeep) +
      `<rect width="1024" height="500" fill="url(#g)"/>` +
      glyph({ bag: COLORS.white, check: COLORS.accent, transform: 'translate(40 62) scale(0.36)' }) +
      `<g fill="#FFFFFF" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
         <text x="420" y="228" font-size="76" font-weight="800">BOODSCHAP!</text>
         <text x="423" y="292" font-size="34" font-weight="500" opacity="0.92">Samen je boodschappenlijst.</text>
         <text x="423" y="338" font-size="34" font-weight="500" opacity="0.92">Gratis, zonder account.</text>
       </g>`,
  );
  write(path.join(SRC, 'feature-graphic.svg'), fg);
  write(path.join(STORE, 'feature-graphic-1024x500.png'), encodePng(1024, 500, render(fg, 1024, 500), { alpha: false }));
  // Website: favicon en logo.
  const logo = svg(1024, 1024, VARIANTS['splash-icon.png'].body());
  write(path.join(SITE, 'icon-192.png'), encodePng(192, 192, render(logo, 192, 192), { alpha: true }));
  write(path.join(SITE, 'icon-512.png'), encodePng(512, 512, render(logo, 512, 512), { alpha: true }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) makeAll();
