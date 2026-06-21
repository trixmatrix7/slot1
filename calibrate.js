/* ============================================================
   CALIBRATE — sucht per Binärsuche den PAY_SCALE, der für einen
   gegebenen Multiplikator-Faktor exakt 96% RTP liefert, und gibt
   eine ausführliche Statistik (inkl. 10.000×-Cap-Rate) aus.
   Aufruf:  node calibrate.js <factor> [calN] [verifyN] [targetRTP]
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
  let total = 0, hits = 0, fs = 0, maxX = 0, ccap = 0, c100 = 0, c1000 = 0, c5000 = 0, baseSum = 0;
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
    if (x > 100) c100++;
    if (x > 1000) c1000++;
    if (x > 5000) c5000++;
  }
  return { rtp: total / N * 100, baseRtp: baseSum / N * 100, hitRate: hits / N * 100,
    fsFreq: N / fs, maxX, ccap, c100, c1000, c5000, N };
}

const factor = parseFloat(process.argv[2] || "1.15");
const calN = parseInt(process.argv[3], 10) || 800000;
const verifyN = parseInt(process.argv[4], 10) || 4000000;
const target = parseFloat(process.argv[5] || "96");

C.FREESPINS.multiplier.factor = factor;

// Binärsuche auf PAY_SCALE (RTP wächst monoton mit scale)
let lo = 0.0001, hi = 1.0;
for (let it = 0; it < 16; it++) {
  const mid = (lo + hi) / 2;
  C.PAY_SCALE = mid;
  const rtp = runSim(calN, 100 + it).rtp;
  if (rtp < target) lo = mid; else hi = mid;
  process.stdout.write(`  it${it}: scale=${mid.toFixed(6)} rtp=${rtp.toFixed(2)}\n`);
}
const scale = (lo + hi) / 2;
C.PAY_SCALE = scale;

console.log("\n=== VERIFIKATION (" + verifyN.toLocaleString("de-DE") + " Spins) ===");
const f = runSim(verifyN, 777);
const pf = (n) => (n / f.N * 100).toFixed(4) + "%";
console.log(" factor:           ", factor);
console.log(" PAY_SCALE:        ", scale.toFixed(6));
console.log(" RTP:              ", f.rtp.toFixed(3) + "%");
console.log("   Basisspiel:     ", f.baseRtp.toFixed(2) + "%   Free Spins: " + (f.rtp - f.baseRtp).toFixed(2) + "%");
console.log(" Hit-Rate:         ", f.hitRate.toFixed(2) + "%");
console.log(" FS-Trigger:       ", "~1 in " + Math.round(f.fsFreq));
console.log(" Max-Win gesehen:  ", f.maxX.toFixed(0) + "x");
console.log(" >100x:            ", pf(f.c100));
console.log(" >1000x:           ", pf(f.c1000));
console.log(" >5000x:           ", pf(f.c5000));
console.log(" 10000x-Cap:       ", f.ccap + " Treffer  (~1 in " + (f.ccap ? Math.round(f.N / f.ccap) : "—") + ")");
