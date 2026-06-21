/* ============================================================
   MEASURE — misst RTP über mehrere PAY_SCALE-Werte (große Sims),
   damit der exakte 96%-Punkt interpoliert werden kann.
   Aufruf:  node measure.js [N] [scale1 scale2 ...]
   ============================================================ */
const LF = require("./src/config.js");
require("./src/math.js");
const C = LF.CONFIG;
const M = LF.Math;

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runSim(N, seed) {
  const rng = makeRng(seed);
  let total = 0, baseSum = 0, hits = 0, fs = 0, maxX = 0, ccap = 0;
  for (let i = 0; i < N; i++) {
    const arr = M.newBoard(rng);
    const base = M.resolveArr(rng, arr, false, null);
    baseSum += base.winX;
    let x = base.winX;
    if (base.scatters >= 3) { fs++; x += M.runFreeSpins(rng, M.triggerAward(base.scatters)); }
    if (x > C.MAX_WIN_X) { ccap++; x = C.MAX_WIN_X; }
    total += x;
    if (x > 0) hits++;
    if (x > maxX) maxX = x;
  }
  return { rtp: total / N * 100, baseRtp: baseSum / N * 100, hitRate: hits / N * 100, fsFreq: N / fs, maxX, ccap, N };
}

const N = parseInt(process.argv[2], 10) || 6000000;
const scales = process.argv.slice(3).map(Number);
if (!scales.length) scales.push(0.062, 0.065, 0.068, 0.071);

console.log("factor=1.15   N=" + N.toLocaleString("de-DE") + " pro Skala\n");
console.log("PAY_SCALE | RTP%    | Basis% | FS%    | Hit%  | FS(1in) | Cap-Treffer (1 in)");
console.log("----------+---------+--------+--------+-------+---------+-------------------");
const rows = [];
for (let i = 0; i < scales.length; i++) {
  C.PAY_SCALE = scales[i];
  const r = runSim(N, 500 + i);
  rows.push({ scale: scales[i], rtp: r.rtp });
  console.log(
    scales[i].toFixed(5).padStart(8) + " | " +
    r.rtp.toFixed(2).padStart(7) + " | " +
    r.baseRtp.toFixed(2).padStart(6) + " | " +
    (r.rtp - r.baseRtp).toFixed(2).padStart(6) + " | " +
    r.hitRate.toFixed(1).padStart(5) + " | " +
    String(Math.round(r.fsFreq)).padStart(7) + " | " +
    r.ccap + " (1 in " + (r.ccap ? Math.round(r.N / r.ccap) : "—") + ")"
  );
}

// Lineare Interpolation auf 96%
rows.sort((a, b) => a.scale - b.scale);
let best = null;
for (let i = 0; i < rows.length - 1; i++) {
  const a = rows[i], b = rows[i + 1];
  if ((a.rtp - 96) * (b.rtp - 96) <= 0) {
    const t = (96 - a.rtp) / (b.rtp - a.rtp);
    best = a.scale + t * (b.scale - a.scale);
  }
}
console.log("\n-> Interpolierter PAY_SCALE für 96% RTP: " + (best ? best.toFixed(6) : "außerhalb des Bereichs"));
