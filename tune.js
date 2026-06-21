/* ============================================================
   TUNE — sucht je Multiplikator-Beschleunigung (accel) den PAY_SCALE
   für 96% RTP und misst die Erreichbarkeit des 10.000×-Caps.
   Aufruf: node tune.js
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
  let total = 0, hits = 0, fs = 0, maxX = 0, ccap = 0, c1000 = 0, c5000 = 0;
  for (let i = 0; i < N; i++) {
    const arr = M.newBoard(rng);
    const base = M.resolveArr(rng, arr, false, null);
    let x = base.winX;
    if (base.scatters >= 3) { fs++; x += M.runFreeSpins(rng, M.triggerAward(base.scatters)); }
    if (x > C.MAX_WIN_X) { ccap++; x = C.MAX_WIN_X; }
    total += x;
    if (x > 0) hits++;
    if (x > maxX) maxX = x;
    if (x > 1000) c1000++;
    if (x > 5000) c5000++;
  }
  return {
    rtp: (total / N) * 100, hitRate: (hits / N) * 100, fsFreq: N / fs,
    maxX, ccap, c1000, c5000, N,
  };
}

function calibrate(factor, calN, finalN) {
  C.FREESPINS.multiplier.factor = factor;
  C.PAY_SCALE = 1;
  let r = runSim(calN, 11);
  let scale = 96 / r.rtp;
  for (let it = 0; it < 3; it++) {       // Verfeinerungen wg. Cap-Clipping
    C.PAY_SCALE = scale;
    r = runSim(calN, 21 + it);
    scale *= 96 / r.rtp;
  }
  C.PAY_SCALE = scale;
  const f = runSim(finalN, 999);
  return { factor, scale, f };
}

console.log("factor| PAY_SCALE  | RTP%   | Hit%  | FS(1in) | maxWin |  >1000x   |  >5000x   | Cap(=10000x)");
console.log("------+-----------+--------+-------+---------+--------+-----------+-----------+-------------");
for (const factor of [1.15, 1.25, 1.35, 1.45, 1.6]) {
  const { scale, f } = calibrate(factor, 400000, 2000000);
  const pf = (n) => (n / f.N * 100).toFixed(4) + "%";
  console.log(
    String(factor).padEnd(5) + " | " +
    scale.toFixed(6).padStart(9) + " | " +
    f.rtp.toFixed(2).padStart(6) + " | " +
    f.hitRate.toFixed(1).padStart(5) + " | " +
    String(Math.round(f.fsFreq)).padStart(7) + " | " +
    f.maxX.toFixed(0).padStart(6) + " | " +
    pf(f.c1000).padStart(9) + " | " +
    pf(f.c5000).padStart(9) + " | " +
    (f.ccap + " (~1 in " + (f.ccap ? Math.round(f.N / f.ccap) : "—") + ")")
  );
}
console.log("\nZiel: RTP ~96, Cap=10000x selten erreichbar (~1 in 0.5-2 Mio).");
