/* ============================================================
   BAKE — transparentes Spritesheet auf kleinere Frames runterskalieren
   (premultiplizierter Box-Filter -> sauberer Alpha-Rand) und neu komponieren.
   Aufruf: node bake.js <in.png> <out.png> <cols> <rows> <inFrame> <outFrame>
   ============================================================ */
const fs = require("fs");
const { PNG } = require("pngjs");

const [, , inPath, outPath, colsA, rowsA, inFA, outFA] = process.argv;
const cols = +colsA, rows = +rowsA, inF = +inFA, outF = +outFA;
const factor = inF / outF;
if (!Number.isInteger(factor)) { console.error("inFrame muss durch outFrame teilbar sein"); process.exit(1); }

const src = PNG.sync.read(fs.readFileSync(inPath));
const out = new PNG({ width: cols * outF, height: rows * outF });

function px(img, x, y) { const i = (img.width * y + x) << 2; const d = img.data; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }

for (let fr = 0; fr < cols * rows; fr++) {
  const fc = fr % cols, frow = Math.floor(fr / cols);
  const sx0 = fc * inF, sy0 = frow * inF;
  const dx0 = fc * outF, dy0 = frow * outF;
  for (let oy = 0; oy < outF; oy++) {
    for (let ox = 0; ox < outF; ox++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let by = 0; by < factor; by++) {
        for (let bx = 0; bx < factor; bx++) {
          const p = px(src, sx0 + ox * factor + bx, sy0 + oy * factor + by);
          const al = p[3] / 255;
          r += p[0] * al; g += p[1] * al; b += p[2] * al; a += p[3]; // premultipliziert
        }
      }
      const n = factor * factor;
      const am = a / n;                       // mittlerer Alpha (0..255)
      const aw = am > 0 ? am / 255 : 0;       // zum Entpremultiplizieren
      const di = (out.width * (dy0 + oy) + (dx0 + ox)) << 2;
      out.data[di] = aw > 0 ? Math.round(r / n / aw) : 0;
      out.data[di + 1] = aw > 0 ? Math.round(g / n / aw) : 0;
      out.data[di + 2] = aw > 0 ? Math.round(b / n / aw) : 0;
      out.data[di + 3] = Math.round(am);
    }
  }
}

fs.writeFileSync(outPath, PNG.sync.write(out));
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log("baked " + outPath + "  " + out.width + "x" + out.height + "  " + kb + " KB");
