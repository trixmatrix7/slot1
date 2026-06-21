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
const FS = C.FREESPINS;
const MSTART = FS.multiplier.start, MFAC = FS.multiplier.factor, MMAX = FS.multiplier.max, MSTEP = FS.multiplier.step, MACC = FS.multiplier.accel || 0;
const MULT_MODE_FAC = MFAC && MFAC > 1;
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

function fill(rng) { for (let k = 0; k < N_CELLS; k++) board[k] = pick(rng, CUM_FULL); }

// resolve: gibt winX zurück, schreibt scatters in out[0]
function resolve(rng, isFS, state, out) {
  let winX = 0;
  for (;;) {
    for (let i = 0; i < NS; i++) { counts[i] = 0; winFlag[i] = 0; }
    let wild = 0;
    for (let k = 0; k < N_CELLS; k++) {
      const id = board[k];
      if (id === WILD) wild++;
      else if (id === SCAT) { /* zählt nicht */ }
      else counts[id]++;
    }
    let totalX = 0, anyWin = false;
    for (let p = 0; p < PAYIDX.length; p++) {
      const idx = PAYIDX[p];
      if (counts[idx] > 0) {
        let eff = counts[idx] + wild; if (eff > N_CELLS) eff = N_CELLS;
        const x = payTab[p][eff];
        if (x > 0) { totalX += x; winFlag[idx] = 1; anyWin = true; }
      }
    }
    if (!anyWin) break;
    const mult = isFS ? state.m : 1;
    winX += totalX * mult;
    const refillCum = (isFS && SCATTER_IN_FS) ? CUM_FULL : CUM_NOSC;
    for (let k = 0; k < N_CELLS; k++) {
      const id = board[k];
      if (id === SCAT) continue;
      if (id === WILD || winFlag[id]) board[k] = pick(rng, refillCum);
    }
    if (isFS) {
      if (MULT_MODE_FAC) state.m = Math.min(MMAX, state.m * MFAC);
      else { state.m = Math.min(MMAX, state.m + state.step); state.step += MACC; }
    }
  }
  let sc = 0;
  for (let k = 0; k < N_CELLS; k++) if (board[k] === SCAT) sc++;
  out[0] = sc;
  return winX;
}

function runFS(rng, award) {
  let left = award, done = 0, fsWin = 0;
  const state = { m: MSTART, step: MSTEP };
  const out = [0];
  while (left > 0 && done < FS.maxSpins) {
    left--; done++;
    fill(rng);
    fsWin += resolve(rng, true, state, out);
    const sc = out[0];
    left += sc >= 3 ? (RT[3] || 0) : sc >= 2 ? (RT[2] || 0) : 0;
  }
  return fsWin;
}

function runMany(N, seed) {
  const rng = makeRng(seed);
  const out = [0];
  let total = 0, baseSum = 0, hits = 0, fs = 0, ccap = 0, maxX = 0;
  for (let i = 0; i < N; i++) {
    fill(rng);
    const bw = resolve(rng, false, null, out);
    baseSum += bw;
    let x = bw;
    if (out[0] >= 3) { fs++; x += runFS(rng, triggerAward(out[0])); }
    if (x > MAXW) { ccap++; x = MAXW; }
    total += x;
    if (x > 0) hits++;
    if (x > maxX) maxX = x;
  }
  return { rtp: total / N * 100, baseRtp: baseSum / N * 100, hitRate: hits / N * 100, fsFreq: N / fs, ccap, maxX, N };
}

const N = parseInt(process.argv[2], 10) || 50000000;
const scales = process.argv.slice(3).map(Number);
if (!scales.length) scales.push(0.066, 0.0675, 0.069);

console.log("factor=" + MFAC + "   N=" + N.toLocaleString("de-DE") + " pro Skala");
console.log("PAY_SCALE | RTP%   | Basis% | FS%    | Hit%  | FS(1in) | maxWin | Cap (1 in)");
console.log("----------+--------+--------+--------+-------+---------+--------+-----------");
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
    "1 in " + (r.ccap ? Math.round(r.N / r.ccap) : "—") + " (" + r.ccap + ")"
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
