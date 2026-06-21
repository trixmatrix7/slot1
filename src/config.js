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
  // Pfad zu den (gebackenen, transparenten) Animations-Spritesheets
  const ANIM_PATH = "assets/anim/";

  /* -----------------------------------------------------------------
     SYMBOL-ANIMATIONEN (optional, pro Symbol-id).
       landing : Spritesheet das beim Reinfallen/Landen abgespielt wird
       win     : Spritesheet das beim Connecten (Gewinn) abgespielt wird
       cols/rows/frames : Raster-Layout des Sheets (row-major)
     Fehlt ein Eintrag/Sheet -> Symbol bleibt statisch (Fallback-Puls beim Win).
     Sheets sind bereits transparent (per bake.js auf 256px gebacken) -> kein Keying.
  ----------------------------------------------------------------- */
  // Sheets aus Sprite Studio: 6×5 / 30 Frames / 256px / 60fps / 500ms (untrimmed Raster).
  // Premiums: Landing (beim Landen) + Win (beim Connecten). Royals/Non-Premium ganz ohne Anim.
  // Scatter (SC) wird NICHT generisch animiert -> eigener Spezial-Flow (Tension-Glow + Win-Burst).
  const SYMBOL_ANIM = {
    BOSS1:   { landing: ANIM_PATH + "high_a_landing.png", win: ANIM_PATH + "high_a_win.png", cols: 6, rows: 5, frames: 30 }, // high A (Rapper)
    BOSS2:   { landing: ANIM_PATH + "high_b_landing.png", win: ANIM_PATH + "high_b_win.png", cols: 6, rows: 5, frames: 30 }, // high B (Biker)
    CUFFS:   { landing: ANIM_PATH + "mid_c_landing.png",  win: ANIM_PATH + "mid_c_win.png",  cols: 6, rows: 5, frames: 30 }, // Handschellen
    WHISKEY: { landing: ANIM_PATH + "mid_d_landing.png",  win: ANIM_PATH + "mid_d_win.png",  cols: 6, rows: 5, frames: 30 }, // Whiskey
    W:       { landing: ANIM_PATH + "wild_landing.png",   win: ANIM_PATH + "wild_win.png",   cols: 6, rows: 5, frames: 30 }, // Wild
    SC:      { landing: ANIM_PATH + "scatter_landing.png", win: ANIM_PATH + "scatter_win.png", cols: 6, rows: 5, frames: 30 }, // Scatter (Spezial-Flow)
  };

  /* Die 9 echten Symbole.
       tex   : Dateiname (ohne .png) in assets/symbols/
       kind  : 'royal' < 'mid' < 'high' (alle zahlend) | 'wild' | 'scatter'
     Reihenfolge = aufsteigender Wert (low -> high). */
  // Höhere Schwellen + deutlich höhere Pays (volatiler: dickere Wins, öfter mal nix).
  // Großer Spread Low->High = hohe Varianz. Level wird per PAY_SCALE auf 96% getunt.
  const SYMBOLS = [
    // Low / Royals (blaue Buchstaben)
    { id: "K", label: "K", tex: "symbol_low_e", kind: "royal", weight: 30, pays: { 9: 0.5, 12: 2, 15: 8 } },
    { id: "Q", label: "Q", tex: "symbol_low_f", kind: "royal", weight: 28, pays: { 9: 0.6, 12: 2.5, 15: 10 } },
    { id: "J", label: "J", tex: "symbol_low_g", kind: "royal", weight: 26, pays: { 9: 0.8, 12: 3, 15: 12 } },
    // Mid
    { id: "CUFFS",   label: "Handschellen", tex: "symbol_mid_c", kind: "mid", weight: 16, pays: { 8: 2, 10: 12, 13: 60 } },
    { id: "WHISKEY", label: "Whiskey",      tex: "symbol_mid_d", kind: "mid", weight: 13, pays: { 8: 3, 10: 18, 13: 100 } },
    // High (Charaktere) — sehr hoher Top-End für fetten Tail Richtung 10.000×
    { id: "BOSS1", label: "Boss A", tex: "symbol_high_a", kind: "high", weight: 10, pays: { 8: 12, 10: 70, 12: 500 } },
    { id: "BOSS2", label: "Boss B", tex: "symbol_high_b", kind: "high", weight: 8,  pays: { 8: 22, 10: 140, 12: 1500 } },
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
    trigger: { 3: 10, 4: 12, 5: 15, 6: 20 }, // 3 Scatter -> 10 FS, 4 Scatter -> 12 FS
    // Retrigger IN FS: NUR 3+ Scatter -> +4 Spins (deutlich seltener -> kürzere Features).
    retriggerByScatters: { 3: 4 },
    scatterInFreeSpins: true,     // Scatter dürfen in FS via Cascade reindroppen (max MAX_SCATTERS)
    // Per-Spin-Multiplikator: pro GEWONNENEM FS-Spin +perSpin; am Spin-Ende wird der
    // Spin-Win × m gerechnet (Multi fliegt visuell auf den Betrag). Bleibt sane (~Feature-Länge).
    multiplier: { start: 1, perSpin: 1, max: 100 },
    maxSpins: 400,                // Sicherheits-Cap gegen Endlos-Retrigger
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
    dropStagger: 70,     // Versatz pro Spalte beim Reinfallen
    dropDuration: 430,   // Falldauer pro Symbol
    winHighlight: 500,   // Win-Anim-Dauer: 30 Frames über 500ms = exakt 1 Frame/60Hz-Tick (gleichmäßig)
    landingDur: 260,     // Dauer der Landing-Animation (fire-and-forget beim Landen) — kurz/snappy
    tumbleDrop: 380,     // Nachrutschen nach Entfernen
    stepPause: 150,      // kleine Pause zwischen den Connection-Schritten
    betweenSpinsFS: 720, // Pause zwischen Free Spins
    sweatSlow: 1.7,      // Anticipation-Fall-Faktor (vorher 2.4 -> jetzt minimal schneller)
    sweatPause: 200,     // Pause pro Anticipation-Walze
    scatterLoop: 600,    // Dauer eines Scatter-Landing-Glow-Zyklus (loopt während der Tension)
    scatterTension: 1300,// Voller Tension-Hold bei 3+ Scatter (Trigger) — ~"2 Sek"-Gefühl
    scatterTensionShort: 350, // Kurzer Glow bei genau 2 Scatter (kein Trigger -> kein langes Warten)
  };

  LF.CONFIG = {
    DESIGN_W, DESIGN_H,
    COLS, ROWS, CELL, GAP, GRID_W, GRID_H, GRID_X, GRID_Y,
    ASSET_PATH, ANIM_PATH, SYMBOLS, SYMBOL_ANIM, FREESPINS, BUY,
    BET_LEVELS, DEFAULT_BET_INDEX, START_BALANCE,
    TIMING,
    // Scatter-Pays: Mindestanzahl, ab der ein Symbol überhaupt zahlt.
    MIN_PAY_COUNT: 8,
    // Max-Win-Cap: Gesamtgewinn eines Spins (inkl. Feature) ist gedeckelt.
    MAX_WIN_X: 10000,
    // Max. Scatter pro Board (Drop) — nie mehr als 4.
    MAX_SCATTERS: 4,
    // Grundgröße je Symbol-Art (× Zelle). Non-Premium (royals) kleiner für klare
    // visuelle Hierarchie Premium vs. Non-Premium. Scatter wird separat (1.34) behandelt.
    SYMBOL_SCALE: { royal: 0.82, mid: 1.0, high: 1.0, wild: 1.0 },
    // RTP-Skalierung: globaler Faktor auf alle Auszahlungen (vom Simulator getunt).
    // 0.1573 -> ~96.0% RTP (1-Typ-pro-Tumble + Per-Spin-Multi, höhere Pays, Scatter-Cap 4).
    // (Alt 0.1848 -> ~96.0% RTP (1-Typ-pro-Tumble + additiver +1-Multi; kalibriert:
    // 0.182->94.75%, 0.185->96.09% @14M -> interpoliert 0.1848).)
    PAY_SCALE: 0.1573,
  };

  // Schnellzugriff per id
  LF.SYMBOL_BY_ID = {};
  SYMBOLS.forEach((s) => (LF.SYMBOL_BY_ID[s.id] = s));

  // Node-Export (für den Simulator)
  if (typeof module !== "undefined" && module.exports) module.exports = LF;
})();
