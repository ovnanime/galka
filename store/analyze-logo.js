/* Разбор логотипа на связные тёмные области: можно ли отделить
   календарь от птицы и круга. Запуск: node store/analyze-logo.js */

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

const img = decode(fs.readFileSync(path.join(__dirname, 'logo-source.png')));
const { w, h, ch, px } = img;

const dark = new Uint8Array(w * h);
for (let i = 0; i < w * h; i++) {
  const d = i * ch;
  const lum = px[d] * 0.299 + px[d + 1] * 0.587 + px[d + 2] * 0.114;
  dark[i] = lum < 128 ? 1 : 0;
}

const label = new Int32Array(w * h).fill(-1);
const regions = [];

for (let start = 0; start < w * h; start++) {
  if (!dark[start] || label[start] >= 0) continue;
  const id = regions.length;
  const stack = [start];
  label[start] = id;
  let count = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;

  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    count++;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (x > 0 && dark[i - 1] && label[i - 1] < 0) { label[i - 1] = id; stack.push(i - 1); }
    if (x < w - 1 && dark[i + 1] && label[i + 1] < 0) { label[i + 1] = id; stack.push(i + 1); }
    if (y > 0 && dark[i - w] && label[i - w] < 0) { label[i - w] = id; stack.push(i - w); }
    if (y < h - 1 && dark[i + w] && label[i + w] < 0) { label[i + w] = id; stack.push(i + w); }
  }
  regions.push({ id, count, x0, y0, x1, y1 });
}

regions.sort((a, b) => b.count - a.count);
console.log(`тёмных областей всего: ${regions.length}\n`);
console.log('крупнейшие:');
regions.slice(0, 8).forEach((r, n) => {
  const share = (r.count / (w * h) * 100).toFixed(1);
  console.log(`  ${n + 1}. точек ${r.count} (${share}% картинки), рамка x ${r.x0}..${r.x1}, y ${r.y0}..${r.y1}`);
});

// Что лежит в предполагаемой зоне календаря — левее и выше птицы
const probe = [[420, 330], [380, 300], [500, 280], [340, 420]];
console.log('\nпробы в области календаря:');
probe.forEach(([x, y]) => {
  const i = y * w + x;
  const id = label[i];
  const r = id >= 0 ? regions.find(z => z.id === id) : null;
  console.log(`  (${x}, ${y}): ${dark[i] ? 'тёмная' : 'светлая'} точка` +
    (r ? `, область из ${r.count} точек, рамка x ${r.x0}..${r.x1}, y ${r.y0}..${r.y1}` : ''));
});
