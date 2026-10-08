// Minimale PNG-lezer en -schrijver voor de store-acceptatietests (Eindtester): afmetingen, alfakanaal en bounding box.
import fs from 'node:fs';
import zlib from 'node:zlib';

export interface PngInfo {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  interlace: number;
  /** Heeft het bestand een alfakanaal (colortype 4/6) of transparantie (tRNS)? */
  hasAlpha: boolean;
}

function chunks(buf: Buffer): { type: string; data: Buffer }[] {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('geen PNG');
  const out: { type: string; data: Buffer }[] = [];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    out.push({ type: buf.subarray(i + 4, i + 8).toString('ascii'), data: buf.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
  }
  return out;
}

export function pngInfo(file: string): PngInfo {
  const cs = chunks(fs.readFileSync(file));
  const h = cs.find((c) => c.type === 'IHDR')!.data;
  const colorType = h[9];
  return {
    width: h.readUInt32BE(0),
    height: h.readUInt32BE(4),
    bitDepth: h[8],
    colorType,
    interlace: h[12],
    hasAlpha: colorType === 4 || colorType === 6 || cs.some((c) => c.type === 'tRNS'),
  };
}

/** Bounding box van de niet-(bijna-)transparante pixels (8-bit, niet-geïnterlinieerd, colortype 6 of 4). */
export function opaqueBox(file: string): { x0: number; y0: number; x1: number; y1: number; transparentShare: number } {
  const buf = fs.readFileSync(file);
  const cs = chunks(buf);
  const h = cs.find((c) => c.type === 'IHDR')!.data;
  const [w, hh, depth, ct, il] = [h.readUInt32BE(0), h.readUInt32BE(4), h[8], h[9], h[12]];
  if (depth !== 8 || il !== 0 || (ct !== 6 && ct !== 4)) throw new Error(`niet ondersteund: depth ${depth} type ${ct} interlace ${il}`);
  const bpp = ct === 6 ? 4 : 2;
  const raw = zlib.inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const stride = w * bpp;
  const px = Buffer.alloc(stride * hh);
  for (let y = 0; y < hh; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const r = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v: number;
      if (f === 0) v = r;
      else if (f === 1) v = r + a;
      else if (f === 2) v = r + b;
      else if (f === 3) v = r + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = r + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = v & 255;
    }
  }
  let x0 = w, y0 = hh, x1 = -1, y1 = -1, transparent = 0;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = px[y * stride + x * bpp + bpp - 1];
      if (alpha < 8) transparent++;
      else {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, transparentShare: transparent / (w * hh) };
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

/** Effen RGB-PNG (zonder alfakanaal), voor de invoer van het screenshot-script. */
export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const mk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), mk('IHDR', ihdr), mk('IDAT', zlib.deflateSync(raw)), mk('IEND', Buffer.alloc(0))]);
}
