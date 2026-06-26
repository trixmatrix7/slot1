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

  // WAYS-Pay eines Symbols bei N zusammenhängenden Walzen (von links), PRO WAY,
  // skaliert mit PAY_SCALE (RTP-Stellschraube).
  M.waysPay = function (def, reels) {
    if (!def.pays) return 0;
    let best = 0;
    for (const th in def.pays) if (reels >= +th) best = Math.max(best, def.pays[th]);
    return best * (LF.CONFIG.PAY_SCALE || 1);
  };

  // WAYS-Auswertung. reels[c] = Array der Symbol-ids in Walze c (Länge ROWS).
  // Ein Symbol gewinnt, wenn es (mit Wild als Joker) ab Walze 1 auf
  // zusammenhängenden Walzen liegt. Ways = Produkt der Treffer pro Walze.
  // Gewinn = waysPay(reels) × Ways. Jedes Symbol zahlt eigenständig (Summe).
  // -> { totalX, lines:[{id,reels,ways,x}] }
  M.waysEval = function (reels) {
    const C = LF.CONFIG, ID = LF.SYMBOL_BY_ID, minR = C.MIN_WAYS_REELS || 3;
    const cols = reels.length;
    const wildR = new Array(cols).fill(0);
    const cntR = new Array(cols);
    for (let c = 0; c < cols; c++) {
      cntR[c] = {};
      const col = reels[c];
      for (let r = 0; r < col.length; r++) {
        const id = col[r]; if (id == null) continue;
        const k = ID[id].kind;
        if (k === "wild") wildR[c]++;
        else if (k === "scatter") { /* zählt nicht für Pays */ }
        else cntR[c][id] = (cntR[c][id] || 0) + 1;
      }
    }
    let totalX = 0; const lines = [];
    for (const sym of C.SYMBOLS) {
      if (sym.kind === "wild" || sym.kind === "scatter" || !sym.pays) continue;
      let ways = 1, nr = 0;
      for (let c = 0; c < cols; c++) {
        const cnt = (cntR[c][sym.id] || 0) + wildR[c];
        if (cnt === 0) break;
        ways *= cnt; nr++;
      }
      if (nr >= minR) {
        const pay = M.waysPay(sym, nr);
        if (pay > 0) { const x = pay * ways; totalX += x; lines.push({ id: sym.id, reels: nr, ways, x }); }
      }
    }
    return { totalX, lines };
  };

  /* ---------- Sim/Modell (frische Walzen, KEIN Tumble) ---------- */
  function fillReels(rng) {
    const C = LF.CONFIG, cap = C.MAX_SCATTERS || 5;
    const reels = new Array(C.COLS); let sc = 0;
    for (let c = 0; c < C.COLS; c++) {
      reels[c] = new Array(C.ROWS);
      for (let r = 0; r < C.ROWS; r++) {
        let s = M.pick(rng);
        if (s.kind === "scatter") { if (sc >= cap) s = M.pickNoSc(rng); else sc++; }
        reels[c][r] = s.id;
      }
    }
    return reels;
  }
  M.newBoardReels = fillReels;
  function countScattersReels(reels) {
    let s = 0;
    for (let c = 0; c < reels.length; c++) for (let r = 0; r < reels[c].length; r++) if (reels[c][r] === "SC") s++;
    return Math.min(s, LF.CONFIG.MAX_SCATTERS || 5);
  }

  M.triggerAward = function (scatters) {
    const t = LF.CONFIG.FREESPINS.trigger;
    let a = 0;
    for (const k in t) if (scatters >= +k) a = t[k];
    return a;
  };

  // Retrigger-Spins für eine Scatter-Anzahl (analog triggerAward: höchste passende Schwelle).
  M.retriggerSpins = function (scatters) {
    const rt = LF.CONFIG.FREESPINS.retriggerByScatters || {};
    let a = 0;
    for (const k in rt) if (scatters >= +k) a = rt[k];
    return a;
  };

  M.runFreeSpins = function (rng, award) {
    const C = LF.CONFIG;
    const mc = C.FREESPINS.multiplier;
    const maxSpins = C.FREESPINS.maxSpins || 400;
    let left = award, fsWin = 0, done = 0;
    let m = mc.start || 1; // Gewinn-Multiplikator: gilt fürs ganze Feature, steigt JEDEN Spin
    while (left > 0 && done < maxSpins) {
      left--; done++;
      const reels = fillReels(rng);
      const w = M.waysEval(reels).totalX;
      fsWin += w * m;                                       // Spin-Win × aktueller Multi
      m = Math.min(mc.max || 100, m + (mc.perSpin || 1));   // Multi wächst mit JEDEM Freispiel
      left += M.retriggerSpins(countScattersReels(reels));  // Retrigger nach Config-Schwelle
    }
    return fsWin;
  };

  // Ein kompletter Basis-Spin inkl. evtl. Free Spins, gedeckelt auf MAX_WIN_X.
  M.playSpinX = function (rng) {
    const C = LF.CONFIG;
    const reels = fillReels(rng);
    let total = M.waysEval(reels).totalX;
    const sc = countScattersReels(reels);
    if (sc >= 3) total += M.runFreeSpins(rng, M.triggerAward(sc));
    return Math.min(total, C.MAX_WIN_X);
  };

  // Nur das gekaufte Feature (für Buy-RTP). scatters = 3 oder 4.
  M.playBuyX = function (rng, scatters) {
    const C = LF.CONFIG;
    const award = C.FREESPINS.trigger[scatters || 3] || 10;
    return Math.min(M.runFreeSpins(rng, award), C.MAX_WIN_X);
  };

  /* ---------- Positions-Auswertung (für die Animation in engine.js) ---------- */
  // idGrid[col][row] = id | null  ->  { totalX, winCells:[[c,r]], lines, scatters }
  M.evaluate = function (idGrid) {
    const C = LF.CONFIG, ID = LF.SYMBOL_BY_ID;
    const ws = M.waysEval(idGrid);
    // Gewinn-Zellen: pro Line alle Zellen mit dem Symbol/Wild auf den ersten N Walzen.
    // ln.cells = die Zellen DIESER Line (für sequenzielles Highlight nacheinander).
    const cellSet = new Set();
    for (const ln of ws.lines) {
      const cells = [];
      for (let c = 0; c < ln.reels; c++) {
        const col = idGrid[c];
        for (let r = 0; r < col.length; r++) {
          const id = col[r]; if (id == null) continue;
          if (id === ln.id || ID[id].kind === "wild") { cells.push([c, r]); cellSet.add(c + "," + r); }
        }
      }
      ln.cells = cells;
    }
    const winCells = Array.from(cellSet).map((k) => k.split(",").map(Number));
    let scatters = 0;
    for (let c = 0; c < idGrid.length; c++) for (let r = 0; r < idGrid[c].length; r++) { const id = idGrid[c][r]; if (id && ID[id].kind === "scatter") scatters++; }
    scatters = Math.min(scatters, C.MAX_SCATTERS || 5);
    return { totalX: ws.totalX, winCells, lines: ws.lines, scatters };
  };

  LF.Math = M;
  if (typeof module !== "undefined" && module.exports) module.exports = M;
})();
