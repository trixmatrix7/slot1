/* ============================================================
   SIM — Monte-Carlo-Simulator für RTP / Volatilität.
   Nutzt EXAKT die Spiellogik aus src/math.js (dieselbe wie das Spiel).
   Aufruf:  node sim.js [anzahlSpins]      (Default 1.000.000)
   ============================================================ */
const LF = require("./src/config.js");
require("./src/math.js");
const C = LF.CONFIG;
const M = LF.Math;

// Schneller, deterministischer PRNG (mulberry32) — reproduzierbar.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = parseInt(process.argv[2], 10) || 1000000;
const rng = makeRng(20260621);

let totalX = 0, baseX = 0, fsX = 0;
let hits = 0, fsTriggers = 0, maxX = 0, capHits = 0;
// Win-Verteilung (× Einsatz)
const edges = [0, 1, 2, 5, 10, 20, 50, 100, 500, 1000, 5000, 10000, Infinity];
const buckets = new Array(edges.length).fill(0);

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const arr = M.newBoard(rng);
  const base = M.resolveArr(rng, arr, false, null);
  let x = base.winX;
  baseX += base.winX;
  if (base.scatters >= 3) {
    fsTriggers++;
    const w = M.runFreeSpins(rng, M.triggerAward(base.scatters));
    x += w;
    fsX += w;
  }
  if (x > C.MAX_WIN_X) { capHits++; x = C.MAX_WIN_X; }
  // (baseX/fsX sind ungedeckelt; totalX nutzt den gedeckelten Wert)
  totalX += x;
  if (x > 0) hits++;
  if (x > maxX) maxX = x;
  for (let b = 0; b < edges.length - 1; b++) {
    if (x > edges[b] && x <= edges[b + 1]) { buckets[b]++; break; }
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const rtp = (totalX / N) * 100;
const baseRtp = (baseX / N) * 100;
const fsRtpCapped = rtp - baseRtp; // grobe Näherung (FS vor Cap separat unten)
const pct = (n) => ((n / N) * 100).toFixed(4) + "%";

console.log("============================================================");
console.log(" SLOT RTP-SIMULATION");
console.log("============================================================");
console.log(" Spins:            ", N.toLocaleString("de-DE"));
console.log(" PAY_SCALE:        ", C.PAY_SCALE);
console.log(" Max-Win-Cap:      ", C.MAX_WIN_X + "x");
console.log(" Dauer:            ", secs + "s");
console.log("------------------------------------------------------------");
console.log(" RTP (gedeckelt):  ", rtp.toFixed(3) + "%");
console.log("   davon Basisspiel:", baseRtp.toFixed(3) + "%");
console.log("   davon Free Spins:", (fsX / N * 100).toFixed(3) + "% (ungedeckelt)");
console.log(" Hit-Rate:         ", pct(hits));
console.log(" FS-Trigger:       ", pct(fsTriggers), " (~1 in " + Math.round(N / fsTriggers) + ")");
console.log(" Max-Win gesehen:  ", maxX.toFixed(2) + "x");
console.log(" Cap-Treffer:      ", pct(capHits), "(" + capHits + ")");
console.log("------------------------------------------------------------");
console.log(" Win-Verteilung (× Einsatz):");
for (let b = 0; b < edges.length - 1; b++) {
  const lo = edges[b], hi = edges[b + 1];
  const label = hi === Infinity ? `>${lo}x` : `${lo}-${hi}x`;
  console.log("   " + label.padEnd(12), pct(buckets[b]));
}
console.log("============================================================");

// Für Auto-Tuning: empfohlener PAY_SCALE, um auf Ziel-RTP zu kommen.
const target = 96;
console.log(" -> Für " + target + "% RTP: PAY_SCALE ~ " +
  (C.PAY_SCALE * (target / rtp)).toFixed(5));
