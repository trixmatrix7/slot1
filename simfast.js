/* ============================================================
   SIMFAST — schneller WAYS-Simulator (5×5, 3125 Ways, KEIN Tumble).
   Identische Regeln wie math.js (waysEval) — Indizes + vorberechnete
   Pay-Tabelle für ~10x Speed. Erwartungs-RTP stabil über 50+ Mio Spins.
   Aufruf:  node simfast.js [N] [scale1 scale2 ...]
   ============================================================ */
const LF = require("./src/config.js");
const C = LF.CONFIG;

const SY = C.SYMBOLS, NS = SY.length;
const KIND = SY.map((s) => (s.kind === "wild" ? 1 : s.kind === "scatter" ? 2 : 0)); // 0 pay,1 wild,2 scatter
let WILD = -1, SCAT = -1; const PAYIDX = [];
SY.forEach((s, i) => { if (s.kind === "wild") WILD = i; else if (s.kind === "scatter") SCAT = i; else PAYIDX.push(i); });
const PAYLI = new Int32Array(NS).fill(-1); PAYIDX.forEach((si, pli) => (PAYLI[si] = pli)); // symIdx -> Pay-Listen-Index

function buildCum(filter) {
  const idxs = [], cum = []; let t = 0;
  for (let i = 0; i < NS; i++) if (filter(i)) { t += SY[i].weight; idxs.push(i); cum.push(t); }
  return { idxs, cum, total: t };
}
const CUM_FULL = buildCum(() => true);
const CUM_NOSC = buildCum((i) => KIND[i] !== 2);

const COLS = C.COLS, ROWS = C.ROWS, MAXW = C.MAX_WIN_X, SCAP = C.MAX_SCATTERS || 5, MINR = C.MIN_WAYS_REELS || 3;
const FS = C.FREESPINS, MSTART = FS.multiplier.start || 1, MMAX = FS.multiplier.max || 100, MPER = FS.multiplier.perSpin || 1, RT = FS.retriggerByScatters || {};

// payTab[payListIndex][reels 0..COLS] (× scale). "≥ Schwelle, höchste" (Pays steigen mit reels).
let payTab = null;
function buildPayTab(scale) {
  payTab = [];
  for (let pi = 0; pi < PAYIDX.length; pi++) {
    const def = SY[PAYIDX[pi]];
    const row = new Float64Array(COLS + 1);
    for (let n = 0; n <= COLS; n++) {
      let best = 0;
      if (def.pays) for (const th in def.pays) if (n >= +th) best = Math.max(best, def.pays[th]);
      row[n] = best * scale;
    }
    payTab.push(row);
  }
}
function triggerAward(sc) { let a = 0; const t = FS.trigger; for (const k in t) if (sc >= +k) a = t[k]; return a; }
function retriggerSpins(sc) { let a = 0; for (const k in RT) if (sc >= +k) a = RT[k]; return a; }
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, CUM) {
  const r = rng() * CUM.total, cum = CUM.cum, idxs = CUM.idxs;
  for (let i = 0; i < cum.length; i++) if (r < cum[i]) return idxs[i];
  return idxs[idxs.length - 1];
}

// Walzen-Zustand: Treffer pro Pay-Symbol pro Walze + Wilds pro Walze.
const reelPay = []; for (let c = 0; c < COLS; c++) reelPay.push(new Int32Array(PAYIDX.length));
const reelWild = new Int32Array(COLS);
let scatterCount = 0;
function fill(rng) {
  scatterCount = 0;
  for (let c = 0; c < COLS; c++) {
    reelPay[c].fill(0); reelWild[c] = 0;
    for (let r = 0; r < ROWS; r++) {
      let id = pick(rng, CUM_FULL);
      if (id === SCAT) { if (scatterCount >= SCAP) id = pick(rng, CUM_NOSC); else scatterCount++; }
      if (id === WILD) reelWild[c]++;
      else if (id === SCAT) { /* nur Trigger */ }
      else reelPay[c][PAYLI[id]]++;
    }
  }
}
function waysWin() {
  let win = 0;
  for (let pli = 0; pli < PAYIDX.length; pli++) {
    let ways = 1, nr = 0;
    for (let c = 0; c < COLS; c++) {
      const cnt = reelPay[c][pli] + reelWild[c];
      if (cnt === 0) break;
      ways *= cnt; nr++;
    }
    if (nr >= MINR) { const pay = payTab[pli][nr]; if (pay > 0) win += pay * ways; }
  }
  return win;
}
let FS_SPINS = 0;
function runFS(rng, award) {
  let left = award, done = 0, fsWin = 0, m = MSTART;
  while (left > 0 && done < FS.maxSpins) {
    left--; done++;
    fill(rng);
    const w = waysWin();
    fsWin += w * m;
    m = Math.min(MMAX, m + MPER);
    left += retriggerSpins(scatterCount);
  }
  FS_SPINS += done;
  return fsWin;
}
function runMany(N, seed) {
  const rng = makeRng(seed);
  FS_SPINS = 0;
  let total = 0, baseSum = 0, hits = 0, fs = 0, ccap = 0, maxX = 0;
  for (let i = 0; i < N; i++) {
    fill(rng);
    const bw = waysWin(); baseSum += bw;
    let x = bw;
    if (scatterCount >= 3) { fs++; x += runFS(rng, triggerAward(scatterCount)); }
    if (x > MAXW) { ccap++; x = MAXW; }
    total += x;
    if (x > 0) hits++;
    if (x > maxX) maxX = x;
  }
  return { rtp: total / N * 100, baseRtp: baseSum / N * 100, hitRate: hits / N * 100, fsFreq: fs ? N / fs : 0, ccap, maxX, N, avgFsLen: fs ? FS_SPINS / fs : 0 };
}

const N = parseInt(process.argv[2], 10) || 50000000;
const scales = process.argv.slice(3).map(Number).filter((x) => !isNaN(x));
if (!scales.length) scales.push(0.012, 0.015, 0.018);

console.log("WAYS 5×5  multi=+" + MPER + "/win-spin   N=" + N.toLocaleString("de-DE") + " pro Skala");
console.log("PAY_SCALE | RTP%   | Basis% | FS%    | Hit%  | FS(1in) | maxWin | caps | avgFS");
console.log("----------+--------+--------+--------+-------+---------+--------+------+------");
const t0 = Date.now();
const rows = [];
for (let i = 0; i < scales.length; i++) {
  buildPayTab(scales[i]);
  const r = runMany(N, 1000 + i);
  rows.push({ scale: scales[i], rtp: r.rtp });
  console.log(
    scales[i].toFixed(5).padStart(8) + " | " +
    r.rtp.toFixed(2).padStart(6) + " | " +
    r.baseRtp.toFixed(2).padStart(6) + " | " +
    (r.rtp - r.baseRtp).toFixed(2).padStart(6) + " | " +
    r.hitRate.toFixed(1).padStart(5) + " | " +
    String(Math.round(r.fsFreq)).padStart(7) + " | " +
    r.maxX.toFixed(0).padStart(6) + " | " +
    String(r.ccap).padStart(4) + " | " +
    r.avgFsLen.toFixed(1).padStart(5)
  );
}
console.log("Dauer: " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
rows.sort((a, b) => a.scale - b.scale);
for (let i = 0; i < rows.length - 1; i++) {
  const a = rows[i], b = rows[i + 1];
  if ((a.rtp - 96) * (b.rtp - 96) <= 0) {
    const t = (96 - a.rtp) / (b.rtp - a.rtp);
    console.log("-> 96% RTP bei PAY_SCALE ~ " + (a.scale + t * (b.scale - a.scale)).toFixed(6));
  }
}

// Buy-Feature-Probe: node simfast.js [N] buy  -> EV pro Scatter-Stufe + faire Kosten (96%).
if (process.argv.includes("buy")) {
  const scale = scales[0]; buildPayTab(scale);
  const rng = makeRng(424242);
  const NB = 2000000;
  console.log("\nBuy-Feature @ PAY_SCALE " + scale + "  (" + NB.toLocaleString("de-DE") + " Features/Stufe)");
  for (const ns of [3, 4, 5]) {
    const award = triggerAward(ns);
    let sum = 0, mx = 0, caps = 0;
    for (let i = 0; i < NB; i++) {
      let w = runFS(rng, award);
      if (w > MAXW) { w = MAXW; caps++; }
      sum += w; if (w > mx) mx = w;
    }
    const ev = sum / NB;
    console.log("  " + ns + " Scatter (" + award + " FS): EV=" + ev.toFixed(1) + "×  faire Kosten(96%)=" + (ev / 0.96).toFixed(0) + "×  maxFeat=" + mx.toFixed(0) + "  caps=" + caps);
  }
}
