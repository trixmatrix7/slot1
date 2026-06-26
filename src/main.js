/* ============================================================
   MAIN — Bootstrap: Pixi-App, Verdrahtung Grid/UI/Engine, Resize, Ticker.
   ============================================================ */
(function () {
  const LF = window.LF;
  const C = LF.CONFIG;

  // --- Pixi-App (transparent, damit #bg durchscheint) ---
  // Backbuffer-Auflösung wird in resize() an die Anzeige angepasst, ABER auf 2× gedeckelt:
  // darüber hinaus (High-DPI/Fullscreen) explodiert die Fill-Rate (jeder additive Glow/Scrim
  // wird über den ganzen Buffer gerendert) ohne sichtbaren Gewinn bei den weichen PNG/Glow-Arts.
  // antialias aus: Art ist sprite-basiert (roundPixels gesetzt) -> MSAA kostet global viel, bringt kaum.
  const app = new PIXI.Application({
    width: C.DESIGN_W,
    height: C.DESIGN_H,
    backgroundAlpha: 0,
    antialias: false,
    resolution: 1,        // Start; wird in resize() (auf max. 2×) überschrieben
    autoDensity: false,
    powerPreference: "high-performance",
  });
  document.getElementById("game").appendChild(app.view);
  app.stage.eventMode = "static";

  // --- UI zuerst (legt Rahmen an), dann Grid DAZWISCHEN einhängen ---
  const ui = new LF.UI(app);

  const grid = new LF.Grid(LF.rng);
  // Grid direkt über den Rahmen (Index 1), aber unter Logo/Bar/Overlays:
  ui.root.addChildAt(grid, 1);

  const engine = new LF.Engine({ app, grid, ui, rng: LF.rng });

  // --- UI-Hooks an Engine ---
  ui.onSpin = () => engine.spin();
  ui.onBet = (dir) => engine.changeBet(dir);
  ui.onBuy = () => engine.openBuyMenu();
  ui.onBuyFeature = (scatters) => engine.buyFeature(scatters);
  ui.onToggleBoost = () => engine.toggleBoost();
  ui.onBuyBetChange = (dir) => { engine.changeBet(dir); engine.openBuyMenu(); };
  ui.onAutoplay = () => engine.toggleAutoplay();
  ui.onBetMax = () => engine.setBetMax();
  ui.onMenu = () => ui.openSettingsMenu();

  // --- Ticker: Tweens + UI-Animation ---
  app.ticker.add(() => {
    // dt klemmen: bei Frame-Drops/Last springen die Tweens/Frame-Stepper sonst (Ruckeln).
    const dt = Math.min(app.ticker.deltaMS, 50);
    LF.tween.update(dt);
    ui.update(dt);
  });

  // --- Sicherheitsnetz: unbehandelte Promise-Fehler sichtbar loggen (statt still schlucken) ---
  window.addEventListener("unhandledrejection", (e) => { console.error("unhandledrejection:", e.reason); });

  // --- Audio bei erster User-Geste freischalten (Browser-Policy) ---
  const unlockAudio = () => { if (LF.sound) LF.sound.unlock(); };
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);

  // --- Tastatur: Leertaste = Spin ---
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); engine.spin(); }
  });

  // --- Responsives 16:9-Layout + native Pixel-Auflösung ---
  const screenEl = document.getElementById("screen");
  function resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const target = C.DESIGN_W / C.DESIGN_H; // 16:9
    let w = ww, h = ww / target;
    if (h > wh) { h = wh; w = wh * target; }
    screenEl.style.width = Math.floor(w) + "px";
    screenEl.style.height = Math.floor(h) + "px";

    // Renderer-Auflösung = Geräte-Pixel pro Design-Einheit, GEDECKELT auf 2×.
    // Cap verhindert 8–13MP-Backbuffer auf High-DPI-Fullscreen (Haupt-Lag-Quelle auf Vercel);
    // 2× ist für weiche Glow/Sprite-Arts visuell ununterscheidbar von 3–4×.
    const dpr = window.devicePixelRatio || 1;
    const res = Math.max(1, Math.min(2, (w * dpr) / C.DESIGN_W));
    if (Math.abs(app.renderer.resolution - res) > 0.01) {
      app.renderer.resolution = res;
      if (app.renderer.events) app.renderer.events.resolution = res;
    }
    // Backbuffer in Design-Koordinaten neu aufspannen (übernimmt die neue Auflösung)
    app.renderer.resize(C.DESIGN_W, C.DESIGN_H);
  }
  window.addEventListener("resize", resize);
  resize();

  // --- Intro: Loading-Screen -> Splash -> Klick -> Ingame ---
  const intro = new LF.Intro(app);
  (async () => {
    try {
      await Promise.all([LF.loadAssets(), intro.playLoading()]);
    } catch (e) {
      intro.showError("Bilder nicht geladen — bitte über http://localhost:8080 starten.");
      return;
    }
    ui.refreshUITextures(); // Control-Bar-Bilder jetzt einsetzen (UI wurde vor dem Laden gebaut)
    if (LF.prefetchOverlays) LF.prefetchOverlays(); // Menü-Overlays im Hintergrund warmladen (nicht blockierend)
    await intro.showSplash();          // wartet auf Klick (schaltet Audio frei)
    await intro.finish();              // Intro ausblenden
    grid.spawnAll(false);              // Startboard (ohne Anticipation/Sirene)
  })();

  // Für Debug/Konsole
  window.GAME = { app, grid, ui, engine, intro, LF };
})();
