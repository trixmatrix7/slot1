/* ============================================================
   SIMFAST — schneller Integer-Simulator (identische Regeln wie math.js,
   aber Symbol-Indizes + vorberechnete Pay-Tabelle -> ~10x schneller).
   Zweck: Erwartungs-RTP eines 10.000×-Games stabil über 50+ Mio Spins.
   Aufruf:  node simfast.js [N] [scale1 scale2 ...]
   ============================================================ */
const LF = require("./src/config.js");
const C = LF.CONFIG;

// --- Symbole in Index-Form bringen ---
const SY = C.SYMBOLS;
const NS = SY.length;
const KIND = new Array(NS);          // 0=pay,1=wild,2=scatter
const PAYIDX = [];                   // Indizes der zahlenden Symbole
let WILD = -1, SCAT = -1;
for (let i = 0; i < NS; i++) {
  const k = SY[i].kind;
  if (k === "wild") { KIND[i] = 1; WILD = i; }
  else if (k === "scatter") { KIND[i] = 2; SCAT = i; }
  else { KIND[i] = 0; PAYIDX.push(i); }
}
// Cumulative-Gewichte (voll inkl. Scatter / ohne Scatter)
function buildCum(filterFn) {
  const idxs = [], cum = [];
  let t = 0;
  for (let i = 0; i < NS; i++) if (filterFn(i)) { t += SY[i].weight; idxs.push(i); cum.push(t); }
  return { idxs, cum, total: t };
}
const CUM_FULL = buildCum(() => true);
const CUM_NOSC = buildCum((i) => KIND[i] !== 2);

const N_CELLS = C.COLS * C.ROWS;
const MAXW = C.MAX_WIN_X;
const SCAP = C.MAX_SCATTERS || 4;
const FS = C.FREESPINS;
const MSTART = FS.multiplier.start || 1, MMAX = FS.multiplier.max || 100, MPERSPIN = FS.multiplier.perSpin || 1;
const SCATTER_IN_FS = !!FS.scatterInFreeSpins;
const RT = FS.retriggerByScatters || {};

// Pay-Tabelle payTab[payListIndex][count 0..N_CELLS]
let payTab = null;
function buildPayTab(scale) {
  payTab = [];
  for (let pi = 0; pi < PAYIDX.length; pi++) {
    const def = SY[PAYIDX[pi]];
    const row = new Float64Array(N_CELLS + 1);
    for (let c = 0; c <= N_CELLS; c++) {
      let best = 0;
      if (def.pays) for (const th in def.pays) if (c >= +th) best = Math.max(best, def.pays[th]);
      row[c] = best * scale;
    }
    payTab.push(row);
  }
}
function triggerAward(sc) { let a = 0; const t = FS.trigger; for (const k in t) if (sc >= +k) a = t[k]; return a; }

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

const board = new Int8Array(N_CELLS);
const counts = new Int32Array(NS);
const winFlag = new Uint8Array(NS);

function fill(rng) {
  let sc = 0;
  for (let k = 0; k < N_CELLS; k++) {
    let id = pick(rng, CUM_FULL);
    if (id === SCAT) { if (sc >= SCAP) id = pick(rng, CUM_NOSC); else sc++; }
    board[k] = id;
  }
}

// resolve: Basis-Win des Spins (ohne FS-Multi), scatters in out[0] (capped).
function resolve(rng, isFS, out) {
  const allowSc = isFS && SCATTER_IN_FS;
  let winX = 0;
  for (;;) {
    for (let i = 0; i < NS; i++) counts[i] = 0;
    let wild = 0;
    for (let k = 0; k < N_CELLS; k++) {
      const id = board[k];
      if (id === WILD) wild++;
      else if (id === SCAT) { /* zählt nicht */ }
      else counts[id]++;
    }
    let winIdx = -1, x = 0;
    for (let p = 0; p < PAYIDX.length; p++) {
      const idx = PAYIDX[p];
      if (counts[idx] > 0) {
        let eff = counts[idx] + wild; if (eff > N_CELLS) eff = N_CELLS;
        const xx = payTab[p][eff];
        if (xx > 0) { winIdx = idx; x = xx; break; }
      }
    }
    if (winIdx < 0) break;
    winX += x;
    let sc = 0; if (allowSc) for (let k = 0; k < N_CELLS; k++) if (board[k] === SCAT) sc++;
    for (let k = 0; k < N_CELLS; k++) {
      const id = board[k];
      if (id === SCAT) continue;
      if (id === WILD || id === winIdx) {
        let nid;
        if (allowSc && sc < SCAP) { nid = pick(rng, CUM_FULL); if (nid === SCAT) sc++; }
        else nid = pick(rng, CUM_NOSC);
        board[k] = nid;
      }
    }
  }
  let scc = 0; for (let k = 0; k < N_CELLS; k++) if (board[k] === SCAT) scc++;
  out[0] = Math.min(scc, SCAP);
  return winX;
}

let FS_SPINS = 0, FS_MAXLEN = 0, FS_MAXMULT = 0;
function runFS(rng, award) {
  let left = award, done = 0, fsWin = 0, m = MSTART;
  const out = [0];
  while (left > 0 && done < FS.maxSpins) {
    left--; done++;
    fill(rng);
    const w = resolve(rng, true, out);   // Basis-Win
    fsWin += w * m;                       // Spin-Win × Per-Spin-Multi
    if (w > 0) m = Math.min(MMAX, m + MPERSPIN);
    if (out[0] >= 3) left += (RT[3] || 0);
  }
  FS_SPINS += done; if (done > FS_MAXLEN) FS_MAXLEN = done; if (m > FS_MAXMULT) FS_MAXMULT = m;
  return fsWin;
}

function runMany(N, seed) {
  const rng = makeRng(seed);
  const out = [0];
  FS_SPINS = 0; FS_MAXLEN = 0; FS_MAXMULT = 0;
  let total = 0, baseSum = 0, hits = 0, fs = 0, ccap = 0, maxX = 0;
  for (let i = 0; i < N; i++) {
    fill(rng);
    const bw = resolve(rng, false, out);
    baseSum += bw;
    let x = bw;
    if (out[0] >= 3) { fs++; x += runFS(rng, triggerAward(out[0])); }
    if (x > MAXW) { ccap++; x = MAXW; }
    total += x;
    if (x > 0) hits++;
    if (x > maxX) maxX = x;
  }
  return { rtp: total / N * 100, baseRtp: baseSum / N * 100, hitRate: hits / N * 100, fsFreq: N / fs,
    ccap, maxX, N, avgFsLen: fs ? FS_SPINS / fs : 0, maxFsLen: FS_MAXLEN, maxMult: FS_MAXMULT };
}

const N = parseInt(process.argv[2], 10) || 50000000;
const scales = process.argv.slice(3).map(Number);
if (!scales.length) scales.push(0.066, 0.0675, 0.069);

console.log("multi=+" + MPERSPIN + "/win-spin   N=" + N.toLocaleString("de-DE") + " pro Skala");
console.log("PAY_SCALE | RTP%   | Basis% | FS%    | Hit%  | FS(1in) | maxWin | avgFS | maxFS | maxMult");
console.log("----------+--------+--------+--------+-------+---------+--------+-------+-------+--------");
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
    r.avgFsLen.toFixed(1).padStart(5) + " | " +
    String(r.maxFsLen).padStart(5) + " | " +
    String(r.maxMult).padStart(6)
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
