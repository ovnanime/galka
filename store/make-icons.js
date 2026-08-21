/* ============================================================
   Иконки из store/logo-source.png.

   Adaptive icon Android обрезается маской, форма которой зависит от
   лаунчера. Гарантированно видна только центральная окружность
   диаметром 72 из 108 единиц холста. Поэтому рисунок вписывается
   в неё целиком — тогда крыло не отрежет ни на одном телефоне.

   Вписывание идёт по минимальной окружности вокруг непрозрачных
   пикселей, а не по габаритной рамке: у логотипа углы пустые,
   и по окружности он получается заметно крупнее при той же гарантии.

   Запуск: node store/make-icons.js
   ============================================================ */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'logo-source.png');

/* ---------------- чтение PNG ---------------- */

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('это не PNG');

  let pos = 8, width = 0, height = 0, depth = 0, color = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      if (data[12] !== 0) throw new Error('чересстрочный PNG не поддерживается');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }

  if (depth !== 8 || (color !== 2 && color !== 6)) {
    throw new Error(`нужен 8-битный RGB или RGBA, получено: глубина ${depth}, тип ${color}`);
  }

  const channels = color === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 3);

  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[i] = v & 0xFF;
    }
    prev = line;

    // альфу источника накладываем на белое: логотип нарисован по белому фону
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 3;
      if (channels === 4) {
        const al = line[s + 3] / 255;
        out[d]     = Math.round(line[s]     * al + 255 * (1 - al));
        out[d + 1] = Math.round(line[s + 1] * al + 255 * (1 - al));
        out[d + 2] = Math.round(line[s + 2] * al + 255 * (1 - al));
      } else {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
      }
    }
  }

  return { width, height, data: out };
}

/* ---------------- запись PNG ---------------- */

const CRC = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(pixels, size, alpha) {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc(size * (size * ch + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    pixels.copy(raw, p, y * size * ch, (y + 1) * size * ch);
    p += size * ch;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- разбор рисунка ---------------- */

const INK = 235;   // всё темнее — считаем рисунком, светлее — фоном

/** Центр и радиус минимальной окружности, накрывающей рисунок */
function inkCircle(img) {
  const { width, height, data } = img;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 3;
      if (data[d] < INK || data[d + 1] < INK || data[d + 2] < INK) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('на картинке не найдено рисунка');

  // Центр уточняем: сдвигаем к точке, где максимальный радиус меньше
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const maxRadiusFrom = (px, py) => {
    let m = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = (y * width + x) * 3;
        if (data[d] < INK || data[d + 1] < INK || data[d + 2] < INK) {
          const r = (x - px) ** 2 + (y - py) ** 2;
          if (r > m) m = r;
        }
      }
    }
    return Math.sqrt(m);
  };

  let best = maxRadiusFrom(cx, cy);
  let step = Math.max(x1 - x0, y1 - y0) / 8;
  while (step > 0.5) {
    let moved = false;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const r = maxRadiusFrom(cx + dx, cy + dy);
      if (r < best - 0.01) { best = r; cx += dx; cy += dy; moved = true; break; }
    }
    if (!moved) step /= 2;
  }

  return { cx, cy, radius: best, box: { x0, y0, x1, y1 } };
}

/**
 * Отмечает «страницу» — белый фон вокруг логотипа. Заливка идёт от краёв
 * картинки, поэтому белые клетки календаря внутри логотипа не задеваются:
 * они замкнуты и до границы не достают.
 */
function pageMask(img) {
  const { width, height, data } = img;
  const page = new Uint8Array(width * height);
  const queue = [];

  const light = i => data[i * 3] > 200 && data[i * 3 + 1] > 200 && data[i * 3 + 2] > 200;
  const push = i => { if (!page[i] && light(i)) { page[i] = 1; queue.push(i); } };

  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }

  while (queue.length) {
    const i = queue.pop();
    const x = i % width, y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  return page;
}

/* ---------------- отрисовка ---------------- */

/**
 * @param cx,cy     центр области источника, попадающей в кадр
 * @param halfSpan  половина стороны этой области в пикселях источника
 * @param size      сторона результата
 * @param alpha     прозрачный фон вместо белого
 * @param circle    обрезать по кругу (для round-иконки)
 */
function render(img, page, cx, cy, halfSpan, size, mode, circle) {
  const alpha = mode === 'cutout' || mode === 'invert';
  const ch = alpha ? 4 : 3;
  const out = Buffer.alloc(size * size * ch);
  const half = size / 2;
  const inv = halfSpan / half;                        // пикселей источника на пиксель результата
  const clipR = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = cx + (x + 0.5 - half) * inv;
      const sy = cy + (y + 0.5 - half) * inv;

      // усреднение по площади: при уменьшении берём весь попавший квадрат
      let r = 0, g = 0, b = 0, n = 0, onPage = 0;
      const r0 = Math.max(0, Math.floor(sx - inv / 2)), r1 = Math.min(img.width - 1, Math.ceil(sx + inv / 2));
      const c0 = Math.max(0, Math.floor(sy - inv / 2)), c1 = Math.min(img.height - 1, Math.ceil(sy + inv / 2));
      for (let yy = c0; yy <= c1; yy++) {
        for (let xx = r0; xx <= r1; xx++) {
          const i = yy * img.width + xx, d = i * 3;
          r += img.data[d];
          g += img.data[d + 1];
          b += img.data[d + 2];
          onPage += page[i];
          n++;
        }
      }
      const outsideSource = n === 0;
      if (outsideSource) { r = g = b = 255; n = 1; onPage = 1; }
      r /= n; g /= n; b /= n;

      const o = (y * size + x) * ch;
      const clipped = circle && Math.hypot(x + 0.5 - half, y + 0.5 - half) > clipR;

      if (mode === 'invert') {
        // Круг становится белым, рисунок внутри — чёрным. На тёмной подложке
        // логотип читается целиком, а не только его белые линии.
        const a = 1 - onPage / n;
        out[o] = Math.round(255 - r); out[o + 1] = Math.round(255 - g); out[o + 2] = Math.round(255 - b);
        out[o + 3] = clipped ? 0 : Math.round(255 * a);
      } else if (mode === 'invert-dark') {
        // то же самое, уже наложенное на чёрное — для мест без прозрачности
        const a = 1 - onPage / n;
        out[o] = Math.round((255 - r) * a);
        out[o + 1] = Math.round((255 - g) * a);
        out[o + 2] = Math.round((255 - b) * a);
      } else if (mode === 'dark') {
        // то же самое, но уже наложенное на чёрное: подложка чёрная,
        // поэтому цвет просто умножается на непрозрачность
        const a = 1 - onPage / n;
        out[o] = Math.round(r * a); out[o + 1] = Math.round(g * a); out[o + 2] = Math.round(b * a);
      } else if (mode === 'opaque') {
        out[o] = Math.round(r); out[o + 1] = Math.round(g); out[o + 2] = Math.round(b);
      } else {
        // Прозрачна только страница вокруг логотипа. Всё остальное —
        // и чёрное, и замкнутые белые клетки — рисуется как есть.
        const a = clipped ? 0 : Math.round(255 * (1 - onPage / n));
        out[o] = Math.round(r); out[o + 1] = Math.round(g); out[o + 2] = Math.round(b); out[o + 3] = a;
      }
    }
  }
  return out;
}


function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return `${path.relative(ROOT, file).replace(/\\/g, '/')} — ${(buf.length / 1024).toFixed(1)} КБ`;
}

/* ---------------- сборка ---------------- */

const img = decodePNG(fs.readFileSync(SRC));
const page = pageMask(img);
const c = inkCircle(img);
console.log(`источник: ${img.width}×${img.height}`);
console.log(`рисунок: центр (${c.cx.toFixed(0)}, ${c.cy.toFixed(0)}), радиус ${c.radius.toFixed(0)} px`);
console.log(`поля источника обрезаны: рамка ${c.box.x0}..${c.box.x1} по горизонтали`);

// Чёрный логотипа должен совпасть с цветом подложки, иначе круг проступит кольцом
const dark = {};
for (let i = 0; i < img.width * img.height; i++) {
  if (page[i]) continue;
  const d = i * 3;
  if (img.data[d] < 60) {
    const key = `${img.data[d]},${img.data[d + 1]},${img.data[d + 2]}`;
    dark[key] = (dark[key] || 0) + 1;
  }
}
const top = Object.entries(dark).sort((a, b) => b[1] - a[1])[0];
const [dr, dg, db] = top[0].split(',').map(Number);
const hex = '#' + [dr, dg, db].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
console.log(`основной тёмный цвет логотипа: ${hex} (${top[1]} точек) — такой должна быть подложка`);
console.log(`доля страницы: ${(page.reduce((s, v) => s + v, 0) / page.length * 100).toFixed(0)}%\n`);

const res = p => path.join(ROOT, 'android/app/src/main/res', p);
const done = [];

// Передний слой адаптивной иконки. Центр — центр описанной окружности,
// иначе крыло перевесит. Доля 0.64 вместо предельных 0.667: запас на
// сглаженные края, которые иначе выходят за границу на доли процента.
const SAFE = 0.64;
const fgSpan = c.radius / SAFE;
for (const [dir, size] of [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]]) {
  done.push(write(res(`mipmap-${dir}/ic_launcher_foreground.png`),
    encodePNG(render(img, page, c.cx, c.cy, fgSpan, size, 'cutout', false), size, true)));
}

// Квадратные иконки маска не режет, поэтому центруем по габаритам рисунка,
// а не по окружности — иначе логотип уезжает влево.
const bx = (c.box.x0 + c.box.x1) / 2;
const by = (c.box.y0 + c.box.y1) / 2;
const boxHalf = Math.max(c.box.x1 - c.box.x0, c.box.y1 - c.box.y0) / 2;

// Запасные растровые иконки для Android до 8
// Запасные растровые иконки для Android до 8: маски нет, поэтому сами
// обрезаем по кругу — иначе получится логотип в белом квадрате.
const legacySpan = c.radius / 0.96;
for (const [dir, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  const round = encodePNG(render(img, page, c.cx, c.cy, legacySpan, size, 'cutout', true), size, true);
  done.push(write(res(`mipmap-${dir}/ic_launcher.png`), round));
  done.push(write(res(`mipmap-${dir}/ic_launcher_round.png`), round));
}

// Карточка магазина и вкладка браузера — на чёрном.
// У исходника углы белые, и в карточке магазина они лезли в глаза светлыми
// уголками вокруг круга. На чёрном логотип выглядит ровно так же, как иконка
// на телефоне: там подложка тоже чёрная.
const storeSpan = boxHalf / 0.94;
done.push(write(path.join(__dirname, 'icon-512.png'),
  encodePNG(render(img, page, bx, by, storeSpan, 512, 'dark', false), 512, false)));
done.push(write(path.join(ROOT, 'www/icon-192.png'),
  encodePNG(render(img, page, bx, by, storeSpan, 192, 'dark', false), 192, false)));

console.log(done.join('\n'));
