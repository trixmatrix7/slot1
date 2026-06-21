/* ============================================================
   CONFIG — alle Spielparameter an EINER Stelle.
   Mechanik: Tumble (Cascade) + Scatter-Pays (Zählen überall im Raster).
   Symbole/Background ersetzt du später; hier nur Platzhalter-Defs.
   ============================================================ */
(function () {
  // Dual-Environment: funktioniert im Browser UND in Node (für den Simulator).
  const root = typeof window !== "undefined" ? window : globalThis;
  const LF = (root.LF = root.LF || {});

  // --- Render-Auflösung des "iframe" (16:9). Alle Koordinaten unten in diesem Raum. ---
  const DESIGN_W = 1200;
  const DESIGN_H = 675;

  // --- Raster: 6 Spalten × 5 Reihen (aus dem Original-Screenshot abgelesen) ---
  const COLS = 6;
  const ROWS = 5;

  const CELL = 86;   // Kachelgröße (dichter, wie im Original)
  const GAP = 2;     // Abstand zwischen Kacheln (Symbole fast bündig)

  const GRID_W = COLS * CELL + (COLS - 1) * GAP;   // 526
  const GRID_H = ROWS * CELL + (ROWS - 1) * GAP;   // 438

  // Raster leicht oberhalb der Mitte, zentriert (Controls liegen unten).
  const GRID_X = Math.round((DESIGN_W - GRID_W) / 2);          // links
  const GRID_Y = 112;                                          // oben

  /* -----------------------------------------------------------------
     SYMBOL-DEFINITIONEN (Platzhalter).
       id     : interner Key
       label  : Text auf der Platzhalter-Kachel
       kind   : 'royal' | 'high' | 'wild' | 'scatter'
       color  : Platzhalter-Füllfarbe (HEX int)
       weight : relative Häufigkeit beim Zufalls-Befüllen (Tumble-Nachschub)
       pays   : Auszahltabelle (Anzahl-Schwelle -> Multiplikator vom Gesamteinsatz)
                gilt für 'royal'/'high'. Scatter-Pays: Anzahl IRGENDWO im Raster.
     Ersetze später `color/label` durch deine Sprites (siehe grid.js → SymbolSprite).
  ----------------------------------------------------------------- */
  // Pfad zu den Symbol-PNGs
  const ASSET_PATH = "assets/symbols/";

  /* Die 9 echten Symbole.
       tex   : Dateiname (ohne .png) in assets/symbols/
       kind  : 'royal' < 'mid' < 'high' (alle zahlend) | 'wild' | 'scatter'
     Reihenfolge = aufsteigender Wert (low -> high). */
  // Höhere Schwellen (9/12/15 low, 8/10/12 high) = seltenere, aber stärkere
  // Connections. Pays insgesamt höher (passt zum additiven +1-Multiplikator).
  const SYMBOLS = [
    // Low / Royals (blaue Buchstaben)
    { id: "K", label: "K", tex: "symbol_low_e", kind: "royal", weight: 30, pays: { 9: 0.5, 12: 1.5, 15: 4 } },
    { id: "Q", label: "Q", tex: "symbol_low_f", kind: "royal", weight: 28, pays: { 9: 0.6, 12: 1.8, 15: 4.5 } },
    { id: "J", label: "J", tex: "symbol_low_g", kind: "royal", weight: 26, pays: { 9: 0.7, 12: 2.0, 15: 5 } },
    // Mid
    { id: "CUFFS",   label: "Handschellen", tex: "symbol_mid_c", kind: "mid", weight: 16, pays: { 8: 1.5, 10: 5, 13: 18 } },
    { id: "WHISKEY", label: "Whiskey",      tex: "symbol_mid_d", kind: "mid", weight: 13, pays: { 8: 2, 10: 7, 13: 25 } },
    // High (Charaktere)
    { id: "BOSS1", label: "Boss A", tex: "symbol_high_a", kind: "high", weight: 10, pays: { 8: 5, 10: 18, 12: 60 } },
    { id: "BOSS2", label: "Boss B", tex: "symbol_high_b", kind: "high", weight: 8,  pays: { 8: 8, 10: 30, 12: 100 } },
    // Wild — ersetzt alle Pay-Symbole (kein eigener Pay)
    { id: "W",  label: "WILD",    tex: "symbol_wild",    kind: "wild",    weight: 6, pays: null },
    // Scatter — löst Free Spins aus, zahlt nicht, bleibt beim Tumble liegen
    { id: "SC", label: "SCATTER", tex: "symbol_scatter", kind: "scatter", weight: 1.5, pays: null },
  ];

  /* -----------------------------------------------------------------
     FREE SPINS / SCATTER
       trigger : Anzahl Scatter -> vergebene Free Spins
       retrigger: 3+ Scatter während FS -> zusätzliche Spins
       fsMultiplier: Multiplikator startet bei start und +step pro Gewinn-Tumble,
                     bleibt das gesamte Feature über bestehen (Hacksaw-Stil).
  ----------------------------------------------------------------- */
  const FREESPINS = {
    trigger: { 3: 10, 4: 15, 5: 20, 6: 25 }, // 3 Scatter -> 10 FS, 4 Scatter -> 15 FS
    // Retrigger IN FS nach Scatter-Anzahl (Scatter können in FS auch via Cascade reindroppen):
    //   2 Scatter -> +2 Spins, 3+ Scatter -> +4 Spins.
    retriggerByScatters: { 2: 2, 3: 4 },
    scatterInFreeSpins: true,     // Scatter dürfen in FS beim Nachrutschen reindroppen
    // factor>1 => multiplikativ; factor<=1 => additiv (m += step pro Gewinn-Tumble).
    // ADDITIV +1 pro Connection (sane Multis statt 76x/100x).
    multiplier: { start: 1, step: 1, accel: 0, factor: 1.0, max: 1000 },
    maxSpins: 2000,               // Sicherheits-Cap gegen Endlos-Retrigger
  };

  // --- Bonus-Kauf-Menü (3 Cards) ---
  const BUY = {
    // Feature-Käufe: Kosten = costMult × Grundeinsatz, vergibt Free Spins wie N Scatter.
    feature: {
      3: { cost: 100, scatters: 3 },   // 3 Scatter Feature -> 100×
      4: { cost: 200, scatters: 4 },   // 4 Scatter Feature -> 200×
    },
    // Boost ("3× Freispiel-Chance"): Toggle. AN -> Einsatz ×3/Spin, Scatter ×3 häufiger.
    boost: {
      active: false,               // Laufzeit-Zustand (vom Spiel gesetzt; Sim kann ihn togglen)
      betMultiplier: 3,
      scatterWeightMultiplier: 3,
    },
  };

  // --- Einsatz-Stufen (Hacksaw-typisch min 0.10 / max 100). Index 1 = 0.20 default ---
  const BET_LEVELS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80, 1, 1.5, 2, 2.5, 4, 5, 8, 10, 20, 40, 60, 80, 100];
  const DEFAULT_BET_INDEX = 1;

  // --- Start-Guthaben (Original zeigt 0,00$ — für Demo spielbar gesetzt) ---
  const START_BALANCE = 1000;

  // --- Timing (ms) ---
  const TIMING = {
    dropStagger: 55,     // Versatz pro Spalte beim Reinfallen
    dropDuration: 360,   // Falldauer pro Symbol
    winHighlight: 520,   // Dauer Gewinn-Hervorhebung
    tumbleDrop: 300,     // Nachrutschen nach Entfernen
    betweenSpinsFS: 650, // Pause zwischen Free Spins
  };

  LF.CONFIG = {
    DESIGN_W, DESIGN_H,
    COLS, ROWS, CELL, GAP, GRID_W, GRID_H, GRID_X, GRID_Y,
    ASSET_PATH, SYMBOLS, FREESPINS, BUY,
    BET_LEVELS, DEFAULT_BET_INDEX, START_BALANCE,
    TIMING,
    // Scatter-Pays: Mindestanzahl, ab der ein Symbol überhaupt zahlt.
    MIN_PAY_COUNT: 8,
    // Max-Win-Cap: Gesamtgewinn eines Spins (inkl. Feature) ist gedeckelt.
    MAX_WIN_X: 10000,
    // RTP-Skalierung: globaler Faktor auf alle Auszahlungen (vom Simulator getunt).
    // 0.1800 -> ~96.0% RTP (additiver +1-Multi, neue Pays/Schwellen; über 35 Mio Spins kalibriert:
    // 0.181->96.08% @10M, 0.1808->96.49% @25M -> 0.1800 zentriert auf 96.0%).
    PAY_SCALE: 0.1800,
  };

  // Schnellzugriff per id
  LF.SYMBOL_BY_ID = {};
  SYMBOLS.forEach((s) => (LF.SYMBOL_BY_ID[s.id] = s));

  // Node-Export (für den Simulator)
  if (typeof module !== "undefined" && module.exports) module.exports = LF;
})();
