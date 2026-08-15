/* Как адаптивная иконка выглядит после наложения на подложку и обрезки
   круглой маской. Нужно, чтобы проверять результат глазами, а не гадать.
   Запуск: node store/preview-icon.js */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const BG = [0x00, 0x00, 0x00];   // должен совпадать с ic_launcher_background

function decode(buf) {
  let pos = 8, w = 0, h = 0, color = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); color = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const ch = color === 6 ? 4 : 3;
  const stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * ch);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[i] = v & 0xFF;
    }
    prev = line;
    line.copy(px, y * stride);
  }
  return { w, h, ch, px };
}

const CRC = (() => { const t = new Int32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c; } return t; })();
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encode(px, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) { raw[p++] = 0; px.copy(raw, p, y * size * 4, (y + 1) * size * 4); p += size * 4; }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

const ROOT = path.join(__dirname, '..');
const fg = decode(fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png')));

// Видна только центральная область 72 из 108 холста
const view = Math.round(fg.w * 72 / 108);
const off = Math.round((fg.w - view) / 2);
const out = Buffer.alloc(view * view * 4);
const half = view / 2;

for (let y = 0; y < view; y++) {
  for (let x = 0; x < view; x++) {
    const s = ((y + off) * fg.w + (x + off)) * 4;
    const a = fg.px[s + 3] / 255;
    const o = (y * view + x) * 4;
    const inside = Math.hypot(x + 0.5 - half, y + 0.5 - half) <= half - 0.5;
    out[o]     = Math.round(fg.px[s]     * a + BG[0] * (1 - a));
    out[o + 1] = Math.round(fg.px[s + 1] * a + BG[1] * (1 - a));
    out[o + 2] = Math.round(fg.px[s + 2] * a + BG[2] * (1 - a));
    out[o + 3] = inside ? 255 : 0;
  }
}

const file = path.join(__dirname, 'preview-icon.png');
fs.writeFileSync(file, encode(out, view));
console.log(`готово: ${file} (${view}×${view}) — так иконку покажет лаунчер с круглой маской`);
