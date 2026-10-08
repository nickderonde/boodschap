// Minimale PNG-encoder/-lezer zonder externe afhankelijkheden (node:zlib). Gebruikt door make-icons en make-screenshots:
// resvg levert altijd RGBA; Apple eist voor het app-icoon en de schermafbeeldingen een PNG zonder alfakanaal.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * Codeert RGBA-pixels als PNG. Met `alpha: false` wordt het alfakanaal weggelaten (kleurtype 2, RGB); halfdoorzichtige
 * pixels worden dan eerst op `background` gelegd.
 */
export function encodePng(width, height, rgba, { alpha = true, background = [255, 255, 255] } = {}) {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc((width * ch + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * ch + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = row + 1 + x * ch;
      if (alpha) {
        raw[d] = rgba[s];
        raw[d + 1] = rgba[s + 1];
        raw[d + 2] = rgba[s + 2];
        raw[d + 3] = rgba[s + 3];
      } else {
        const a = rgba[s + 3] / 255;
        raw[d] = Math.round(rgba[s] * a + background[0] * (1 - a));
        raw[d + 1] = Math.round(rgba[s + 1] * a + background[1] * (1 - a));
        raw[d + 2] = Math.round(rgba[s + 2] * a + background[2] * (1 - a));
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bitdiepte
  ihdr[9] = alpha ? 6 : 2; // kleurtype
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Leest breedte, hoogte, bitdiepte en kleurtype uit de PNG-kop (voor controles). */
export function pngInfo(buf) {
  const sig = buf.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error('geen PNG');
  const colorType = buf[25];
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType, hasAlpha: colorType === 4 || colorType === 6 };
}

/** Hex-kleur → [r, g, b]. */
export function rgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
