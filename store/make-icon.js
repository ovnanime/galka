/* ============================================================
   Иконка для карточки магазина: PNG 512×512.

   Рисует то же, что лежит в ic_launcher_fg.xml, но на сплошном
   фоне и без маски — магазину нужен квадрат целиком.

   Запуск: node store/make-icon.js
   ============================================================ */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 512;          // сторона готовой картинки
const SS = 4;              // подпикселей на сторону, сглаживание краёв
const K = SIZE / 108;      // макет иконки задан на холсте 108×108

const BG     = [0x1B, 0x23, 0x40];
const WHITE  = [0xFF, 0xFF, 0xFF];
const ACCENT = [0x6E, 0x8B, 0xFF];
const INK    = [0x1B, 0x23, 0x40];

/* ---------- расстояния до фигур, в координатах макета ---------- */

function sdRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const qx = Math.abs(x - cx) - ((x1 - x0) / 2 - r);
  const qy = Math.abs(y - cy) - ((y1 - y0) / 2 - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(wx - t * vx, wy - t * vy);
}

/** Цвет точки макета. Порядок повторяет порядок слоёв в векторе. */
function colorAt(x, y) {
  // галка поверх всего
  const check = Math.min(
    sdSegment(x, y, 37, 63.5, 46, 72.5),
    sdSegment(x, y, 46, 72.5, 71, 52)
  );
  if (check <= 6.5 / 2 && sdRoundRect(x, y, 24, 33, 84, 85, 7) <= 0) return INK;

  // шапка календаря — верхняя часть корпуса
  const body = sdRoundRect(x, y, 24, 33, 84, 85, 7);
  if (body <= 0) return y <= 47 ? ACCENT : WHITE;

  // ушки
  if (sdRoundRect(x, y, 38, 24, 43, 36, 2.5) <= 0) return WHITE;
  if (sdRoundRect(x, y, 65, 24, 70, 36, 2.5) <= 0) return WHITE;

  return BG;
}

/* ---------- растеризация ---------- */

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
let p = 0;

for (let py = 0; py < SIZE; py++) {
  raw[p++] = 0;                                   // тип фильтра строки
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / K;
        const y = (py + (sy + 0.5) / SS) / K;
        const c = colorAt(x, y);
        r += c[0]; g += c[1]; b += c[2];
      }
    }
    const n = SS * SS;
    raw[p++] = Math.round(r / n);
    raw[p++] = Math.round(g / n);
    raw[p++] = Math.round(b / n);
  }
}

/* ---------- сборка PNG ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;    // бит на канал
ihdr[9] = 2;    // цвет: RGB без прозрачности
ihdr[10] = 0;   // сжатие
ihdr[11] = 0;   // фильтрация
ihdr[12] = 0;   // без чересстрочности

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, 'icon-512.png');
fs.writeFileSync(out, png);
console.log(`готово: ${out} (${(png.length / 1024).toFixed(1)} КБ, ${SIZE}×${SIZE})`);
