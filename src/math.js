/* ============================================================
   MATH — kanonische, reine Spiellogik (Browser + Node).
   Zieht Zufall NUR über eine übergebene rng()-Funktion [0,1).
   Dieselbe Datei wird vom Spiel (engine.js) und vom Simulator
   (sim.js) benutzt -> der gemessene RTP gilt 1:1 fürs echte Spiel.

   Scatter-Pays sind positionsunabhängig: ein Symbol zahlt nach
   ANZAHL im Raster. Deshalb genügt fürs Mathe-Modell ein flaches
   Array von 30 Symbolen (engine.js macht daraus die Animation).
   ============================================================ */
(function () {
  const root = typeof window !== "undefined" ? window : globalThis;
  const LF = (root.LF = root.LF || {});

  const M = {};

  // Lazily: Cumulative-Gewichtstabelle für schnelle gewichtete Auswahl
  let _cum = null, _cumTotal = 0, _cumSyms = null;
  function buildCum() {
    const C = LF.CONFIG;
    _cumSyms = C.SYMBOLS;
    _cum = new Float64Array(_cumSyms.length);
    let t = 0;
    for (let i = 0; i < _cumSyms.length; i++) { t += _cumSyms[i].weight; _cum[i] = t; }
    _cumTotal = t;
  }
  M.pick = function (rng) {
    if (!_cum) buildCum();
    const r = rng() * _cumTotal;
    for (let i = 0; i < _cum.length; i++) if (r < _cum[i]) return _cumSyms[i];
    return _cumSyms[_cumSyms.length - 1];
  };

  // Nachrutsch-Pick OHNE Scatter: Scatter landen nur beim initialen Walzendrop,
  // nicht beim Tumble-Nachfüllen (verhindert Scatter-Akkumulation/Endlos-Retrigger).
  let _cumP = null, _cumPTotal = 0, _cumPSyms = null;
  function buildCumP() {
    const C = LF.CONFIG;
    _cumPSyms = C.SYMBOLS.filter((s) => s.kind !== "scatter");
    _cumP = new Float64Array(_cumPSyms.length);
    let t = 0;
    for (let i = 0; i < _cumPSyms.length; i++) { t += _cumPSyms[i].weight; _cumP[i] = t; }
    _cumPTotal = t;
  }
  M.pickNoSc = function (rng) {
    if (!_cumP) buildCumP();
    const r = rng() * _cumPTotal;
    for (let i = 0; i < _cumP.length; i++) if (r < _cumP[i]) return _cumPSyms[i];
    return _cumPSyms[_cumPSyms.length - 1];
  };

  // Auszahlung eines Symbols bei gegebener Anzahl (× Gesamteinsatz),
  // skaliert mit PAY_SCALE (RTP-Stellschraube).
  M.payX = function (def, count) {
    if (!def.pays) return 0;
    let best = 0;
    for (const th in def.pays) if (count >= +th) best = Math.max(best, def.pays[th]);
    return best * (LF.CONFIG.PAY_SCALE || 1);
  };

  // Gewinn-Auswertung aus Symbol-Zählungen. Wild zählt zu jedem Pay-Symbol.
  // -> { totalX, winning:Set<id> }
  M.countWins = function (countsById, wildCount) {
    const ID = LF.SYMBOL_BY_ID;
    let totalX = 0;
    const winning = new Set();
    for (const id in countsById) {
      const def = ID[id];
      const eff = countsById[id] + wildCount;
      const x = M.payX(def, eff);
      if (x > 0) { totalX += x; winning.add(id); }
    }
    return { totalX, winning };
  };

  /* ---------- Flaches Modell (Simulator) ---------- */
  function fillArr(rng, n) {
    const cap = LF.CONFIG.MAX_SCATTERS || 4;
    const a = new Array(n);
    let sc = 0;
    for (let i = 0; i < n; i++) {
      let s = M.pick(rng);
      if (s.kind === "scatter") { if (sc >= cap) s = M.pickNoSc(rng); else sc++; }
      a[i] = s.id;
    }
    return a;
  }
  // Ein frisches Board als flaches Array (für Simulator-Detailstatistik).
  M.newBoard = function (rng) { return fillArr(rng, LF.CONFIG.COLS * LF.CONFIG.ROWS); };
  function arrCounts(arr) {
    const ID = LF.SYMBOL_BY_ID;
    const m = {};
    let wild = 0;
    for (let i = 0; i < arr.length; i++) {
      const id = arr[i], k = ID[id].kind;
      if (k === "wild") wild++;
      else if (k === "scatter") { /* zählt nicht für Pays */ }
      else m[id] = (m[id] || 0) + 1;
    }
    return { m, wild };
  }
  function countScatters(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] === "SC") s++;
    return s;
  }

  // Ein Board komplett auswerten (Tumble-Schleife). multState trägt den
  // FS-Multiplikator über das ganze Feature. Liefert { winX, scatters }.
  // Liefert den BASIS-Win des Spins (ohne FS-Multiplikator) + Scatter (capped).
  // Der FS-Multiplikator wird in runFreeSpins am Spin-ENDE angewandt.
  M.resolveArr = function (rng, arr, isFS) {
    const ID = LF.SYMBOL_BY_ID;
    const C = LF.CONFIG;
    const cap = C.MAX_SCATTERS || 4;
    const allowSc = isFS && C.FREESPINS.scatterInFreeSpins;
    let winX = 0;
    for (;;) {
      const { m, wild } = arrCounts(arr);
      // NUR EIN Gewinn-Typ pro Tumble (erste in Symbol-Reihenfolge: K, Q, J, ...).
      let winId = null, x = 0;
      for (const sym of C.SYMBOLS) {
        if (sym.kind === "wild" || sym.kind === "scatter") continue;
        const cnt = m[sym.id] || 0;
        if (!cnt) continue;
        const p = M.payX(sym, cnt + wild);
        if (p > 0) { winId = sym.id; x = p; break; }
      }
      if (!winId) break;
      winX += x;
      // nur diesen Typ (+ Wilds) entfernen und auffüllen; Scatter nur in FS und max cap
      let sc = countScatters(arr);
      for (let i = 0; i < arr.length; i++) {
        const id = arr[i];
        if (id === "SC") continue;
        const def = ID[id];
        if (def.kind === "wild" || id === winId) {
          let nid;
          if (allowSc && sc < cap) { nid = M.pick(rng).id; if (nid === "SC") sc++; }
          else nid = M.pickNoSc(rng).id;
          arr[i] = nid;
        }
      }
    }
    return { winX, scatters: Math.min(countScatters(arr), cap) };
  };

  M.triggerAward = function (scatters) {
    const t = LF.CONFIG.FREESPINS.trigger;
    let a = 0;
    for (const k in t) if (scatters >= +k) a = t[k];
    return a;
  };

  M.runFreeSpins = function (rng, award) {
    const C = LF.CONFIG;
    const mc = C.FREESPINS.multiplier;
    const rt = C.FREESPINS.retriggerByScatters || {};
    const maxSpins = C.FREESPINS.maxSpins || 400;
    let left = award, fsWin = 0, done = 0;
    let m = mc.start || 1; // Per-Spin-Multiplikator, wächst pro gewonnenem Spin
    while (left > 0 && done < maxSpins) {
      left--; done++;
      const arr = fillArr(rng, C.COLS * C.ROWS);
      const r = M.resolveArr(rng, arr, true);
      fsWin += r.winX * m;                                   // Spin-Win × aktueller Multi
      if (r.winX > 0) m = Math.min(mc.max || 100, m + (mc.perSpin || 1));
      if (r.scatters >= 3) left += (rt[3] || 0);             // Retrigger nur 3+
    }
    return fsWin;
  };

  // Ein kompletter Basis-Spin inkl. evtl. Free Spins, gedeckelt auf MAX_WIN_X.
  // Liefert den Gewinn als Vielfaches des Einsatzes.
  M.playSpinX = function (rng) {
    const C = LF.CONFIG;
    const arr = fillArr(rng, C.COLS * C.ROWS);
    const base = M.resolveArr(rng, arr, false);
    let total = base.winX;
    if (base.scatters >= 3) total += M.runFreeSpins(rng, M.triggerAward(base.scatters));
    return Math.min(total, C.MAX_WIN_X);
  };

  // Nur das gekaufte Feature (für Buy-RTP). scatters = 3 oder 4.
  M.playBuyX = function (rng, scatters) {
    const C = LF.CONFIG;
    const award = C.FREESPINS.trigger[scatters || 3] || 10;
    return Math.min(M.runFreeSpins(rng, award), C.MAX_WIN_X);
  };

  /* ---------- Positions-Auswertung (für die Animation in engine.js) ---------- */
  // idGrid[col][row] = id | null  ->  { wins, totalX, remove:[[c,r]], scatters }
  M.evaluate = function (idGrid) {
    const ID = LF.SYMBOL_BY_ID;
    const m = {}, symCells = {}, wildCells = [];
    let wild = 0, scatters = 0;
    for (let c = 0; c < idGrid.length; c++) {
      for (let r = 0; r < idGrid[c].length; r++) {
        const id = idGrid[c][r];
        if (id == null) continue;
        const k = ID[id].kind;
        if (k === "wild") { wild++; wildCells.push([c, r]); }
        else if (k === "scatter") { scatters++; }
        else { m[id] = (m[id] || 0) + 1; (symCells[id] || (symCells[id] = [])).push([c, r]); }
      }
    }
    // NUR EIN Gewinn-Typ pro Schritt (erste in Symbol-Reihenfolge) -> sequentieller Flow.
    const remove = [];
    const wins = [];
    let totalX = 0;
    for (const sym of LF.CONFIG.SYMBOLS) {
      if (sym.kind === "wild" || sym.kind === "scatter") continue;
      const cnt = m[sym.id] || 0;
      if (!cnt) continue;
      const x = M.payX(sym, cnt + wild);
      if (x > 0) {
        totalX = x;
        for (const cell of symCells[sym.id]) remove.push(cell);
        for (const cell of wildCells) remove.push(cell);
        wins.push({ id: sym.id, count: cnt + wild, x });
        break;
      }
    }
    return { wins, totalX, remove, scatters };
  };

  LF.Math = M;
  if (typeof module !== "undefined" && module.exports) module.exports = M;
})();
