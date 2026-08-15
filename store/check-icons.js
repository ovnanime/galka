/* Проверка готовых иконок: где рисунок и остаётся ли запас до края.
   Запуск: node store/check-icons.js */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

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

function report(file, label) {
  const { w, h, ch, px } = decode(fs.readFileSync(file));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * ch;
      const ink = ch === 4 ? px[d + 3] > 24 : (px[d] < 235 || px[d + 1] < 235 || px[d + 2] < 235);
      if (ink) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const pad = [x0, w - 1 - x1, y0, h - 1 - y1];
  const min = Math.min(...pad);
  // насколько далеко рисунок уходит от центра — важно для круглой маски
  let maxR = 0;
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * ch;
      const ink = ch === 4 ? px[d + 3] > 24 : (px[d] < 235 || px[d + 1] < 235 || px[d + 2] < 235);
      if (ink) { const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (r > maxR) maxR = r; }
    }
  }
  console.log(`${label}  ${w}×${h}`);
  console.log(`   отступы: слева ${pad[0]}, справа ${pad[1]}, сверху ${pad[2]}, снизу ${pad[3]} px (минимум ${min})`);
  console.log(`   рисунок уходит от центра на ${maxR.toFixed(1)} px — это ${(maxR / (w / 2) * 100).toFixed(1)}% полуширины`);
  return { min, maxR, w };
}

const ROOT = path.join(__dirname, '..');
const fg = report(path.join(ROOT, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png'),
  'Передний слой адаптивной иконки');
// безопасная зона — окружность 72 из 108, то есть 66.7% полуширины
const limit = fg.w / 2 * (36 / 54);
console.log(`   безопасный предел: ${limit.toFixed(1)} px (66.7%)`);
console.log(`   ${fg.maxR <= limit ? 'ВПИСЫВАЕТСЯ — маска ничего не срежет' : 'ВЫХОДИТ ЗА ПРЕДЕЛ — крыло срежется'}\n`);

report(path.join(__dirname, 'icon-512.png'), 'Иконка для магазина');
