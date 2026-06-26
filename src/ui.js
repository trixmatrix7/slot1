/* ============================================================
   UI — Rahmen, Logo-Platzhalter, Control-Bar (unten), Overlays.
   Positionen 1:1 am Original-Screenshot ausgerichtet (1200×675-Raum).
   Alle Grafiken sind Platzhalter (Vektoren/Text), 0 Asset-Loads.
   ============================================================ */
(function () {
  const LF = (window.LF = window.LF || {});
  const C = LF.CONFIG;

  // Farben
  const COL = {
    barBg: 0x141a1f,
    wood: 0x6b3f1d,
    woodDark: 0x4a2a12,
    panel: 0xd7dce1,      // Board-Hintergrund hinter den Symbolen = hellgrau
    cellLine: 0xb4bbc3,   // dezente Zell-Trennlinien
    cellTile: 0xe6e9ed,   // optionale hellere Kachelfläche pro Zelle
    text: 0xffffff,
    sub: 0xbcd0c2,
    yellow: 0xf4c020,
    yellowDark: 0xc8920a,
    green: 0x9ccc4a,
    spinRing: 0x2a2f34,
  };

  /* ---------- Helfer: runder Button ---------- */
  function roundButton(cx, cy, r, drawFn, onTap) {
    const cont = new PIXI.Container();
    cont.position.set(cx, cy);
    const g = new PIXI.Graphics();
    cont.addChild(g);
    drawFn(g, cont);
    cont.eventMode = "static";
    cont.cursor = "pointer";
    cont.hitArea = new PIXI.Circle(0, 0, r);
    cont.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
    cont.on("pointerover", () => (cont.scale.set(1.05)));
    cont.on("pointerout", () => (cont.scale.set(1.0)));
    cont.on("pointerdown", () => (cont.scale.set(0.95)));
    cont.on("pointerup", () => (cont.scale.set(1.05)));
    return cont;
  }

  /* ---------- Helfer: rechteckige Hit-Zone ---------- */
  function rectButton(x, y, w, h, onTap) {
    const cont = new PIXI.Container();
    cont.position.set(x, y);
    cont.eventMode = "static";
    cont.cursor = "pointer";
    cont.hitArea = new PIXI.Rectangle(0, 0, w, h);
    cont.on("pointertap", onTap);
    return cont;
  }

  /* ============================================================
     HUD-DESIGNSYSTEM (exakt nach Figma-CSS)
     Panel: linear-gradient(180deg,#111 0%,#1E1E1E 100%), 1px #000 Rand,
     inset Top-Highlight #fff@.24, inset Bottom #000@.24, radius 24.
     ============================================================ */
  const HUD = {
    panelTop: "#111111", panelBot: "#1E1E1E", radius: 24,
    textHi: 0xffffff, textMid: 0xc7ccd2, textLo: 0x8b9198,
    green: 0x3ec46d, greenLo: 0x2ea35a, field: 0x0e0e10, border: 0x000000,
    hairline: 0x2c2c30, chip: 0x2a2a2e,
  };

  // Panel als gebackene Canvas-Textur (Gradient + Rand + Top-Highlight). r = radius.
  // top/bot überschreiben die Gradient-Farben (für die dunkleren Settings-Overlays).
  function hPanel(w, h, r, top, bot) {
    r = r == null ? HUD.radius : r;
    top = top || HUD.panelTop; bot = bot || HUD.panelBot;
    const dpr = 2;
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    const rr = (x, y, ww, hh, rad) => {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, rad);
      ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
      ctx.arcTo(x, y + hh, x, y, rad);
      ctx.arcTo(x, y, x + ww, y, rad);
      ctx.closePath();
    };
    rr(0.5, 0.5, w - 1, h - 1, r);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top); grad.addColorStop(1, bot);
    ctx.fillStyle = grad; ctx.fill();
    ctx.save(); ctx.clip();
    // unten dunkel (inset -4px)
    ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.fillRect(0, h - 4, w, 4);
    // oben Highlight (inset 1px)
    ctx.strokeStyle = "rgba(255,255,255,0.24)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(r, 1); ctx.lineTo(w - r, 1); ctx.stroke();
    ctx.restore();
    // 1px schwarzer Rand
    ctx.strokeStyle = "rgba(0,0,0,1)"; ctx.lineWidth = 1; rr(0.5, 0.5, w - 1, h - 1, r); ctx.stroke();
    const sp = new PIXI.Sprite(PIXI.Texture.from(cv));
    sp.width = w; sp.height = h;
    sp.eventMode = "static"; // blockt Klicks (damit das Dim darunter nicht schließt)
    return sp;
  }

  // Poppins-Stack (wie die Control-Bar) — für die Overlays, damit alles aus einem Guss ist.
  const POPPINS = "Poppins, 'Arial Black', Arial, sans-serif";

  function hTxt(str, size, color, opts) {
    opts = opts || {};
    const t = new PIXI.Text(str, {
      fontFamily: opts.font || "Arial Black, Arial, sans-serif", fontSize: size, fontWeight: opts.weight || "900",
      fontStyle: opts.italic ? "italic" : "normal",
      fill: color != null ? color : HUD.textHi, letterSpacing: opts.ls || 0,
      align: opts.align || "left", lineHeight: opts.lh || 0, wordWrap: !!opts.wrap, wordWrapWidth: opts.wrap || 0,
    });
    return t;
  }
  // Poppins-Kurzform für Overlay-Texte
  function pTxtM(str, size, color, opts) { opts = opts || {}; opts.font = POPPINS; return hTxt(str, size, color, opts); }

  // grüner Primär-Button (OK / ACTIVATE / START)
  function hGreen(x, y, w, h, label, onTap) {
    const c = new PIXI.Container(); c.position.set(x, y);
    const g = new PIXI.Graphics();
    g.beginFill(HUD.greenLo); g.drawRoundedRect(0, 3, w, h, 10); g.endFill();
    g.beginFill(HUD.green); g.drawRoundedRect(0, 0, w, h, 10); g.endFill();
    g.beginFill(0xffffff, 0.18); g.drawRoundedRect(2, 2, w - 4, h * 0.45, 8); g.endFill();
    c.addChild(g);
    const t = hTxt(label, 15, 0x07210f, { ls: 1 }); t.anchor.set(0.5); t.position.set(w / 2, h / 2); c.addChild(t);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(0, 0, w, h);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
    c.on("pointerover", () => (g.alpha = 0.9)); c.on("pointerout", () => (g.alpha = 1));
    return c;
  }

  // dunkler Button (BACK / Bet Max)
  function hDark(x, y, w, h, label, onTap) {
    const c = new PIXI.Container(); c.position.set(x, y);
    const g = new PIXI.Graphics();
    g.beginFill(0x2a2a2e); g.drawRoundedRect(0, 0, w, h, 10); g.endFill();
    g.lineStyle(1.5, 0x000000, 1); g.drawRoundedRect(0, 0, w, h, 10);
    g.lineStyle(1, 0xffffff, 0.16); g.moveTo(10, 1.2); g.lineTo(w - 10, 1.2);
    c.addChild(g);
    const t = hTxt(label, 15, HUD.textHi, { ls: 1 }); t.anchor.set(0.5); t.position.set(w / 2, h / 2); c.addChild(t);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(0, 0, w, h);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
    c.on("pointerover", () => (g.alpha = 0.85)); c.on("pointerout", () => (g.alpha = 1));
    return c;
  }

  // oranger Primär-Button (START AUTOPLAY / BET MAX) — passt zum Bar-/Spin-Akzent
  function hOrange(x, y, w, h, label, onTap) {
    const c = new PIXI.Container(); c.position.set(x, y);
    const g = new PIXI.Graphics();
    g.beginFill(0xc9781a); g.drawRoundedRect(0, 3, w, h, 12); g.endFill();
    g.beginFill(0xf0a52e); g.drawRoundedRect(0, 0, w, h, 12); g.endFill();
    g.beginFill(0xffffff, 0.20); g.drawRoundedRect(2, 2, w - 4, h * 0.45, 10); g.endFill();
    c.addChild(g);
    const t = pTxtM(label, 15, 0x3a1e02, { weight: "800", ls: 1 }); t.anchor.set(0.5); t.position.set(w / 2, h / 2); c.addChild(t);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(0, 0, w, h);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
    c.on("pointerover", () => (g.alpha = 0.9)); c.on("pointerout", () => (g.alpha = 1));
    return c;
  }

  // iOS-Toggle. center-left at (x,y).
  function hToggle(x, y, on, onChange) {
    const c = new PIXI.Container(); c.position.set(x, y);
    const w = 48, h = 26;
    const g = new PIXI.Graphics(); c.addChild(g);
    const draw = (st) => {
      g.clear();
      g.beginFill(st ? HUD.green : 0x3a3a3e); g.drawRoundedRect(0, 0, w, h, 13); g.endFill();
      g.beginFill(0xffffff); g.drawCircle(st ? w - 13 : 13, h / 2, 10); g.endFill();
    };
    let s = !!on; draw(s);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(0, 0, w, h);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } s = !s; draw(s); onChange(s); });
    return c;
  }

  // +/- Stepper-Button (quadratisch, dunkel)
  function hStep(x, y, isPlus, onTap) {
    const c = new PIXI.Container(); c.position.set(x, y);
    const s = 38;
    const g = new PIXI.Graphics();
    g.beginFill(0x2a2a2e); g.drawRoundedRect(-s / 2, -s / 2, s, s, 9); g.endFill();
    g.lineStyle(1.5, 0x000000, 1); g.drawRoundedRect(-s / 2, -s / 2, s, s, 9);
    g.lineStyle({ width: 3, color: 0xffffff, cap: "round" });
    g.moveTo(-8, 0); g.lineTo(8, 0); if (isPlus) { g.moveTo(0, -8); g.lineTo(0, 8); }
    c.addChild(g);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(-s / 2, -s / 2, s, s);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
    c.on("pointerover", () => (g.alpha = 0.8)); c.on("pointerout", () => (g.alpha = 1));
    return c;
  }

  // Dunkle Settings-Overlay-Palette (näher an den Referenz-PNGs: fast schwarz)
  const DK = { top: "#171719", bot: "#0b0b0c", radius: 26, field: 0x0b0b0c, step: 0x33343a, knob: 0x2a2a2e };
  // Metallischer Titel-Verlauf (weiß -> grau), italic bold — wie in den Panels
  function gradTitle(str, size) { return pTxtM(str, size, ["#f2f2f2", "#8c8c8c"], { italic: true, weight: "800", ls: 0.5, align: "center" }); }

  // Dunkler Kipp-Schalter (Rocker) mit O/|-Zeichen auf dem Knopf. center-left at (x,y).
  function hRocker(x, y, on, onChange) {
    const c = new PIXI.Container(); c.position.set(x, y);
    const W = 62, H = 32, kw = 30;
    const g = new PIXI.Graphics(); c.addChild(g);
    const ch = pTxtM("", 15, 0xbfbfbf, { weight: "800" }); ch.anchor.set(0.5); c.addChild(ch);
    const draw = (st) => {
      g.clear();
      g.beginFill(0x0a0a0b); g.drawRoundedRect(0, 0, W, H, 9); g.endFill();           // Track (inset, fast schwarz)
      g.lineStyle(1.5, 0x000000, 1); g.drawRoundedRect(0.75, 0.75, W - 1.5, H - 1.5, 9);
      g.lineStyle(1, 0xffffff, 0.06); g.moveTo(9, 1.5); g.lineTo(W - 9, 1.5);          // ganz oben Hauch Highlight
      g.lineStyle(0);
      const kx = st ? W - kw - 3 : 3;
      g.beginFill(0x2c2c30); g.drawRoundedRect(kx, 3, kw, H - 6, 7); g.endFill();      // Knopf (heller)
      g.lineStyle(1, 0xffffff, 0.14); g.drawRoundedRect(kx + 0.5, 3.5, kw - 1, H - 7, 7); g.lineStyle(0);
      ch.text = st ? "|" : "O"; ch.style.fill = st ? 0xffffff : 0x9a9a9a; ch.position.set(kx + kw / 2, H / 2 + 0.5);
    };
    let s = !!on; draw(s);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(0, 0, W, H);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } s = !s; draw(s); onChange(s); });
    return c;
  }

  // Rocker zentriert auf (cx,cy) mit Breite w — zum Überdecken eines im PNG gebackenen Toggles.
  function hRockerC(cx, cy, w, on, onChange) {
    const W = w, H = Math.round(w * 0.5), kw = Math.round(w * 0.46), r = Math.round(H * 0.28);
    const c = new PIXI.Container(); c.position.set(cx - W / 2, cy - H / 2);
    const g = new PIXI.Graphics(); c.addChild(g);
    const ch = pTxtM("", Math.round(H * 0.5), 0xbfbfbf, { weight: "800" }); ch.anchor.set(0.5); c.addChild(ch);
    const draw = (st) => {
      g.clear();
      g.beginFill(0x0a0a0b); g.drawRoundedRect(0, 0, W, H, r); g.endFill();
      g.lineStyle(1.5, 0x000000, 1); g.drawRoundedRect(0.75, 0.75, W - 1.5, H - 1.5, r); g.lineStyle(0);
      const kx = st ? W - kw - 3 : 3;
      g.beginFill(0x2c2c30); g.drawRoundedRect(kx, 3, kw, H - 6, r - 2); g.endFill();
      g.lineStyle(1, 0xffffff, 0.14); g.drawRoundedRect(kx + 0.5, 3.5, kw - 1, H - 7, r - 2); g.lineStyle(0);
      ch.text = st ? "|" : "O"; ch.style.fill = st ? 0xffffff : 0x9a9a9a; ch.position.set(kx + kw / 2, H / 2 + 0.5);
    };
    let s = !!on; draw(s);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(-4, -4, W + 8, H + 8);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } s = !s; draw(s); onChange(s); });
    return c;
  }

  // Dunkler Primär-Button (START AUTOPLAY / BET MAX) — Gradient, italic, weiß
  function hButton(x, y, w, h, label, onTap) {
    const c = new PIXI.Container(); c.position.set(x, y);
    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.45); g.drawRoundedRect(0, 3, w, h, 14); g.endFill();
    g.beginFill(0x202024); g.drawRoundedRect(0, 0, w, h, 14); g.endFill();
    g.beginFill(0x000000, 0.30); g.drawRoundedRect(2, h * 0.55, w - 4, h * 0.45 - 2, 12); g.endFill();
    g.lineStyle(1.5, 0x000000, 1); g.drawRoundedRect(0.75, 0.75, w - 1.5, h - 1.5, 14);
    g.lineStyle(1, 0xffffff, 0.12); g.moveTo(14, 1.5); g.lineTo(w - 14, 1.5);
    c.addChild(g);
    const t = pTxtM(label, 17, ["#ffffff", "#d2d2d2"], { italic: true, weight: "800", ls: 0.6 }); t.anchor.set(0.5); t.position.set(w / 2, h / 2); c.addChild(t);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(0, 0, w, h);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
    c.on("pointerover", () => (g.alpha = 0.9)); c.on("pointerout", () => (g.alpha = 1));
    return c;
  }

  // Stepper −/+ für das Bet-Menü: hellgraue, gerundete Taste (heller als die Wertebox)
  function hStepBtn(x, y, w, h, isPlus, onTap) {
    const c = new PIXI.Container(); c.position.set(x, y);
    const g = new PIXI.Graphics();
    g.beginFill(0x35363c); g.drawRoundedRect(0, 0, w, h, 12); g.endFill();
    g.lineStyle(1.5, 0x000000, 1); g.drawRoundedRect(0.75, 0.75, w - 1.5, h - 1.5, 12);
    g.lineStyle(1, 0xffffff, 0.10); g.moveTo(12, 1.5); g.lineTo(w - 12, 1.5);
    g.lineStyle({ width: 3.2, color: 0xffffff, cap: "round" });
    const cx = w / 2, cy = h / 2;
    g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy); if (isPlus) { g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 10); }
    c.addChild(g);
    c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(0, 0, w, h);
    c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
    c.on("pointerover", () => (g.alpha = 0.85)); c.on("pointerout", () => (g.alpha = 1));
    return c;
  }

  // dunkle, eingelassene Wertebox (mittig zwischen den Steppern)
  function hValueBox(x, y, w, h) {
    const g = new PIXI.Graphics();
    g.beginFill(0x070708); g.drawRoundedRect(x, y, w, h, 12); g.endFill();
    g.lineStyle(1.5, 0x000000, 1); g.drawRoundedRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 12);
    return g;
  }

  function hClose(x, y, onTap) {
    return roundButton(x, y, 17,
      (g) => {
        g.beginFill(0x2a2a2e); g.drawCircle(0, 0, 17); g.endFill();
        g.lineStyle(1.5, 0x000000, 1); g.drawCircle(0, 0, 17);
        g.lineStyle({ width: 2.6, color: 0xffffff, cap: "round" });
        g.moveTo(-5, -5); g.lineTo(5, 5); g.moveTo(5, -5); g.lineTo(-5, 5);
      }, onTap);
  }

  class UI {
    constructor(app) {
      this.app = app;
      this.root = new PIXI.Container();
      app.stage.addChild(this.root);

      // Hooks (von main.js / engine gesetzt)
      this.onSpin = () => {};
      this.onBet = (dir) => {};
      this.onBuy = () => {};
      this.onAutoplay = () => {};
      this.onMenu = () => {};
      this.onBuyFeature = (scatters) => {};
      this.onToggleBoost = () => {};
      this.onBuyBetChange = (dir) => {};
      this.onBetMax = () => {};

      this._spinIconRot = 0;
      this._spinning = false;

      this._buildFrame();
      // EINE Control-Bar unten (Icons+Status+WIN oben, Credit/Bet+Spin unten).
      this._buildBottomBar();
      this._buildOverlays();
    }

    /* =================== RAHMEN / GRID-HINTERGRUND =================== */
    _buildFrame() {
      const gx = C.GRID_X, gy = C.GRID_Y, gw = C.GRID_W, gh = C.GRID_H;
      const pad = 22;

      const frame = new PIXI.Container();
      this.root.addChild(frame);

      // weicher Schatten/Scrim, damit das Board in der Szene sitzt (nicht "aufgeklebt")
      const scrim = this._radialScrim(gw + 240, gh + 220, 0.42);
      scrim.position.set(gx + gw / 2, gy + gh / 2);
      frame.addChild(scrim);

      // Holzrahmen (Platzhalter)
      const wood = new PIXI.Graphics();
      wood.beginFill(COL.woodDark);
      wood.drawRoundedRect(gx - pad - 6, gy - pad - 6, gw + (pad + 6) * 2, gh + (pad + 6) * 2, 22);
      wood.endFill();
      wood.beginFill(COL.wood);
      wood.drawRoundedRect(gx - pad, gy - pad, gw + pad * 2, gh + pad * 2, 18);
      wood.endFill();
      // dunkles Innenpanel
      wood.beginFill(COL.panel);
      wood.drawRoundedRect(gx - 8, gy - 8, gw + 16, gh + 16, 12);
      wood.endFill();
      frame.addChild(wood);

      // Zell-Trennlinien (Gitter)
      const lines = new PIXI.Graphics();
      lines.lineStyle(2, COL.cellLine, 0.8);
      for (let c = 0; c <= C.COLS; c++) {
        const x = gx + c * (C.CELL + C.GAP) - C.GAP / 2;
        lines.moveTo(x, gy - 4); lines.lineTo(x, gy + gh + 4);
      }
      for (let r = 0; r <= C.ROWS; r++) {
        const y = gy + r * (C.CELL + C.GAP) - C.GAP / 2;
        lines.moveTo(gx - 4, y); lines.lineTo(gx + gw + 4, y);
      }
      frame.addChild(lines);

      this._frameUnder = frame; // Grid wird DARÜBER eingehängt (siehe main.js)
    }

    /* =================== LOGO-PLATZHALTER (oben Mitte) =================== */
    _buildLogo() {
      const cx = C.DESIGN_W / 2;
      const cont = new PIXI.Container();
      cont.position.set(cx, 64);
      this.root.addChild(cont);

      const g = new PIXI.Graphics();
      g.lineStyle(3, 0xffffff, 0.5);
      g.beginFill(0x123a55, 0.55);
      g.drawRoundedRect(-150, -42, 300, 84, 16);
      g.endFill();
      cont.addChild(g);

      const t = new PIXI.Text("DEIN LOGO HIER", {
        fontFamily: "Arial Black, Arial", fontSize: 26, fontWeight: "900",
        fill: 0xffffff, stroke: 0x0a2233, strokeThickness: 4,
      });
      t.anchor.set(0.5);
      cont.addChild(t);
      this.logoPlate = cont;
    }

    /* =================== TOP CONTROL-STRIP (nach Figma) ===================
       Icon-Reihe links · Status-Text Mitte · WIN-Anzeige rechts. */
    _buildTopBar() {
      const W = C.DESIGN_W;
      const bar = new PIXI.Container();
      this.root.addChild(bar);
      this.topBar = bar;
      const SH = 44, cy = SH / 2;

      // dezenter dunkler Streifen + feine Trennlinie unten
      const bg = new PIXI.Graphics();
      bg.beginFill(0x000000, 0.34); bg.drawRect(0, 0, W, SH); bg.endFill();
      bg.lineStyle(1, 0xffffff, 0.05); bg.moveTo(0, SH - 0.5); bg.lineTo(W, SH - 0.5);
      bar.addChild(bg);

      // --- linke Icon-Reihe ---
      this._topIcons = {};
      const defs = [
        { key: "help",    tap: () => this.openInfo() },
        { key: "sliders", tap: () => this.openSettingsMenu() },
        { key: "expand",  tap: () => this.toggleFullscreen() },
        { key: "music",   tap: () => { if (LF.sound) LF.sound.setMusic(!LF.sound.musicEnabled); this._refreshTopIcons(); } },
        { key: "sound",   tap: () => { if (LF.sound) LF.sound.setEnabled(!LF.sound.enabled); this._refreshTopIcons(); } },
        { key: "mute",    tap: () => { if (LF.sound) { const muted = !LF.sound.enabled && !LF.sound.musicEnabled; LF.sound.setEnabled(muted); LF.sound.setMusic(muted); } this._refreshTopIcons(); } },
        { key: "dices",   tap: () => this.openProvablyFair() },
      ];
      let ix = 24;
      defs.forEach((d) => {
        const btn = new PIXI.Container();
        btn.position.set(ix, cy);
        const g = new PIXI.Graphics();
        btn.addChild(g);
        this._drawIcon(g, d.key, 9, true);
        btn.eventMode = "static"; btn.cursor = "pointer";
        btn.hitArea = new PIXI.Rectangle(-15, -15, 30, 30);
        btn.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } d.tap(); });
        btn.on("pointerover", () => (g.alpha = 1)); btn.on("pointerout", () => (g.alpha = 0.8));
        g.alpha = 0.8;
        bar.addChild(btn);
        this._topIcons[d.key] = g;
        ix += 31;
      });

      // --- Status-Mitte ---
      this.statusText = new PIXI.Text("START AND WIN", {
        fontFamily: "Arial Black, Arial", fontSize: 15, fontWeight: "900",
        fill: 0xeef1f4, letterSpacing: 2, align: "center",
      });
      this.statusText.anchor.set(0.5);
      this.statusText.position.set(W / 2, cy);
      bar.addChild(this.statusText);

      // --- WIN rechts ---
      const winLabel = new PIXI.Text("WIN", {
        fontFamily: "Arial Black, Arial", fontSize: 13, fontWeight: "900", fill: 0x9aa0a7, letterSpacing: 2,
      });
      winLabel.anchor.set(1, 0.5); winLabel.position.set(W - 116, cy);
      bar.addChild(winLabel);
      this.winTopText = new PIXI.Text("0,00$", {
        fontFamily: "Arial Black, Arial", fontSize: 16, fontWeight: "900", fill: 0xffffff,
      });
      this.winTopText.anchor.set(1, 0.5); this.winTopText.position.set(W - 18, cy);
      bar.addChild(this.winTopText);

      this._refreshTopIcons();
    }

    // Strich-Icons (Vektor), zentriert um (0,0). on=false -> gedimmt + Slash (Mute).
    _drawIcon(g, key, s, on) {
      on = on !== false;
      g.clear();
      const col = on ? 0xeef1f4 : 0x6c727a;
      const lw = Math.max(2, s * 0.22);
      const line = () => g.lineStyle({ width: lw, color: col, alpha: 1, cap: "round", join: "round" });
      if (key === "help") {
        line(); g.drawCircle(0, 0, s);
        g.lineStyle({ width: lw, color: col, cap: "round" });
        g.arc(0, -s * 0.16, s * 0.34, Math.PI * 1.1, Math.PI * 2.2);
        g.moveTo(s * 0.02, s * 0.06); g.lineTo(s * 0.02, s * 0.32);
        g.lineStyle(0); g.beginFill(col); g.drawCircle(s * 0.02, s * 0.58, lw * 0.62); g.endFill();
      } else if (key === "gear") {
        line(); g.drawCircle(0, 0, s * 0.5);
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6); g.lineTo(Math.cos(a) * s, Math.sin(a) * s); }
      } else if (key === "expand") {
        const k = s * 0.95, m = s * 0.46; line();
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
          g.moveTo(sx * (k - m), sy * k); g.lineTo(sx * k, sy * k); g.lineTo(sx * k, sy * (k - m));
        });
      } else if (key === "music") {
        g.lineStyle({ width: lw, color: col, cap: "round", join: "round" });
        g.moveTo(-s * 0.2, s * 0.55); g.lineTo(-s * 0.2, -s * 0.55); g.lineTo(s * 0.72, -s * 0.78); g.lineTo(s * 0.72, s * 0.3);
        g.lineStyle(0); g.beginFill(col);
        g.drawEllipse(-s * 0.45, s * 0.6, s * 0.3, s * 0.22);
        g.drawEllipse(s * 0.47, s * 0.35, s * 0.3, s * 0.22); g.endFill();
        if (!on) { g.lineStyle({ width: lw, color: 0xd86060, cap: "round" }); g.moveTo(-s, s); g.lineTo(s, -s); }
      } else if (key === "sound") {
        g.lineStyle(0); g.beginFill(col);
        g.drawPolygon([-s, -s * 0.32, -s * 0.32, -s * 0.32, s * 0.18, -s * 0.78, s * 0.18, s * 0.78, -s * 0.32, s * 0.32, -s, s * 0.32]); g.endFill();
        if (on) {
          g.lineStyle({ width: lw * 0.8, color: col, cap: "round" });
          g.arc(s * 0.1, 0, s * 0.55, -0.85, 0.85); g.arc(s * 0.1, 0, s * 0.92, -0.85, 0.85);
        } else {
          g.lineStyle({ width: lw, color: 0xd86060, cap: "round" }); g.moveTo(s * 0.3, -s * 0.6); g.lineTo(s * 1.0, s * 0.6);
        }
      } else if (key === "sliders") {
        const ys = [-s * 0.58, 0, s * 0.58], kx = [-s * 0.35, s * 0.35, -s * 0.05];
        g.lineStyle({ width: lw, color: col, cap: "round" });
        ys.forEach((yy) => { g.moveTo(-s, yy); g.lineTo(s, yy); });
        g.lineStyle(0); g.beginFill(col);
        ys.forEach((yy, i) => g.drawCircle(kx[i], yy, lw * 1.25)); g.endFill();
      } else if (key === "dices") {
        line(); g.drawRoundedRect(-s * 0.92, -s * 0.92, s * 1.84, s * 1.84, s * 0.42);
        g.lineStyle(0); g.beginFill(col);
        [[-0.42, -0.42], [0.42, -0.42], [0, 0], [-0.42, 0.42], [0.42, 0.42]].forEach(([dx, dy]) => g.drawCircle(dx * s, dy * s, lw * 0.82));
        g.endFill();
      } else if (key === "mute") {
        g.lineStyle(0); g.beginFill(on ? col : 0x6c727a);
        g.drawPolygon([-s, -s * 0.32, -s * 0.32, -s * 0.32, s * 0.12, -s * 0.78, s * 0.12, s * 0.78, -s * 0.32, s * 0.32, -s, s * 0.32]); g.endFill();
        g.lineStyle({ width: lw, color: 0xd86060, cap: "round" });
        g.moveTo(s * 0.42, -s * 0.42); g.lineTo(s * 0.98, s * 0.42); g.moveTo(s * 0.98, -s * 0.42); g.lineTo(s * 0.42, s * 0.42);
      }
    }

    _refreshTopIcons() {
      this._refreshUIIcons(); // Sound-Icon der Control-Bar mitziehen
      if (!this._topIcons) return;
      if (LF.sound) {
        if (this._topIcons.music) this._drawIcon(this._topIcons.music, "music", 9, LF.sound.musicEnabled);
        if (this._topIcons.sound) this._drawIcon(this._topIcons.sound, "sound", 9, LF.sound.enabled);
        if (this._topIcons.mute) this._drawIcon(this._topIcons.mute, "mute", 9, !(LF.sound.enabled || LF.sound.musicEnabled));
      }
    }

    setStatus(msg) {
      if (this.statusText) this.statusText.text = msg || "";
      if (this.statusText2) this.statusText2.text = msg || "";
    }

    toggleFullscreen() {
      const el = document.documentElement;
      try {
        if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
        else (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      } catch (e) {}
    }

    /* =================== INFO / RULES (paginiert, Figma 900×600) =================== */
    openInfo() { this._infoPage = this._infoPage || 0; this._renderInfo(); }

    // dünne weiße Chevrons / X (PNG-Stil, ohne Kreis)
    _navChevron(x, y, right, onTap) {
      const c = new PIXI.Container(); c.position.set(x, y);
      const g = new PIXI.Graphics(); g.lineStyle({ width: 3.2, color: 0xffffff, cap: "round", join: "round" });
      if (right) { g.moveTo(-5, -9); g.lineTo(6, 0); g.lineTo(-5, 9); } else { g.moveTo(5, -9); g.lineTo(-6, 0); g.lineTo(5, 9); }
      c.addChild(g); c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(-18, -18, 36, 36);
      c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
      return c;
    }
    _navX(x, y, size, onTap) {
      const c = new PIXI.Container(); c.position.set(x, y);
      const g = new PIXI.Graphics(); g.lineStyle({ width: 3.2, color: 0xffffff, cap: "round" });
      const s = size || 8; g.moveTo(-s, -s); g.lineTo(s, s); g.moveTo(s, -s); g.lineTo(-s, s);
      c.addChild(g); c.eventMode = "static"; c.cursor = "pointer"; c.hitArea = new PIXI.Rectangle(-18, -18, 36, 36);
      c.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
      return c;
    }

    _section(o, x, y, w, title, body) {
      const t = pTxtM(title, 17, ["#f2f2f2", "#9a9a9a"], { italic: true, weight: "800", ls: 0.4, align: "center" }); t.anchor.set(0.5, 0); t.position.set(x + w / 2, y); o.addChild(t);
      const b = pTxtM(body, 13.5, 0xb8babd, { weight: "700", align: "center", lh: 20, wrap: w }); b.anchor.set(0.5, 0); b.position.set(x + w / 2, y + 30); o.addChild(b);
    }

    // Ein Symbol + seine Pay-Stufen darunter (Spalte) — Layout wie im PNG-Paytable.
    _paySym(o, cx, topY, id) {
      const def = LF.SYMBOL_BY_ID[id]; if (!def) return;
      if (LF.textures && LF.textures[id]) { const sp = new PIXI.Sprite(LF.textures[id]); sp.anchor.set(0.5, 0); sp.width = sp.height = 84; sp.position.set(cx, topY); o.addChild(sp); }
      let y = topY + 96;
      if (def.pays) {
        // WAYS: pays[N reels] = Auszahlung PRO WAY. Anzeige "N → x.xx×" (× Gesamteinsatz, je Way).
        Object.keys(def.pays).sort((a, b) => b - a).forEach((k) => {
          const v = def.pays[k] * (C.PAY_SCALE || 1);
          const vs = v >= 0.1 ? v.toFixed(2) : v.toFixed(3);
          const row = pTxtM(k + " →  " + vs + "×", 14.5, 0xdcdcdc, { weight: "800", align: "center" });
          row.anchor.set(0.5, 0); row.position.set(cx, y); o.addChild(row); y += 28;
        });
      } else {
        const note = def.kind === "wild" ? "Substitutes\nall pay symbols" : "Pays nothing —\ntriggers Free Spins";
        const t = pTxtM(note, 13, 0xa8abae, { weight: "700", align: "center", lh: 18 }); t.anchor.set(0.5, 0); t.position.set(cx, y); o.addChild(t);
      }
    }

    _infoPages() {
      const fx = (px, pw, f) => px + f * pw;
      return [
        { title: "GAME RULES", render: (o, px, py, pw, ph, cx) => {
          const d = pTxtM("WAYS slot on a 5×5 grid — 3125 ways. Matching symbols pay left to right on consecutive reels, starting from the leftmost reel (3, 4 or 5 of a kind). A symbol's win = its per-way pay × the number of ways (the product of its count on each winning reel). WILD substitutes for all pay symbols. Pays below are PER WAY, × total bet.", 13.5, 0xc2c4c7, { weight: "700", align: "center", lh: 20, wrap: pw - 160 });
          d.anchor.set(0.5, 0); d.position.set(cx, py + 92); o.addChild(d);
          const ids = ["BOSS2", "BOSS1", "WHISKEY", "CUFFS"], xs = [0.18, 0.39, 0.61, 0.82];
          ids.forEach((id, i) => this._paySym(o, fx(px, pw, xs[i]), py + 188, id));
          // FEATURE-Symbol (Scatter) unten — wie im PNG
          if (LF.textures && LF.textures.SC) { const sp = new PIXI.Sprite(LF.textures.SC); sp.anchor.set(0.5); sp.width = sp.height = 96; sp.position.set(fx(px, pw, 0.33), py + 474); o.addChild(sp); }
          const fn = pTxtM("This is the SCATTER symbol.\nIt pays nothing but triggers the Free Spins feature.", 14.5, 0xd2d4d6, { weight: "700", lh: 24 }); fn.anchor.set(0, 0.5); fn.position.set(fx(px, pw, 0.41), py + 474); o.addChild(fn);
        } },
        { title: "PAYTABLE", render: (o, px, py, pw, ph, cx) => {
          const ids = ["K", "Q", "J", "W", "SC"], xs = [0.15, 0.325, 0.5, 0.675, 0.85];
          ids.forEach((id, i) => this._paySym(o, fx(px, pw, xs[i]), py + 120, id));
        } },
        { title: "MAIN GAME FEATURE", render: (o, px, py, pw, ph, cx) => {
          this._section(o, px + 80, py + 110, pw - 160, "WAYS — 3125 LINES", "There are no fixed paylines. A symbol wins when it lands on consecutive reels from the leftmost reel (3+). The number of ways is the product of how many of that symbol sit on each winning reel — up to 5×5×5×5×5 = 3125 ways. Each symbol pays independently and the wins are added together.");
          this._section(o, px + 80, py + 250, pw - 160, "SPECIAL SYMBOLS", "WILD substitutes for all paying symbols on every reel. SCATTER does not pay but triggers the Free Spins feature. The two characters (Guard, Inmate), the hammer and the knife are the high-value symbols.");
        } },
        { title: "FREE SPINS", render: (o, px, py, pw, ph, cx) => {
          const t3 = C.FREESPINS.trigger[3] || 10, t4 = C.FREESPINS.trigger[4] || 12;
          const mc = C.FREESPINS.multiplier || {}, ms = mc.start || 1, mp = mc.perSpin || 1;
          this._section(o, px + 80, py + 110, pw - 160, "TRIGGER & MULTIPLIER", "3 Scatters award " + t3 + " Free Spins, 4 Scatters award " + t4 + ". A win multiplier starts at " + ms + "× and grows by +" + mp + " on EVERY free spin. It applies to each spin's win and lasts the whole feature — long features climb into the hundreds.");
          this._section(o, px + 80, py + 250, pw - 160, "RETRIGGER & BONUS BUY", "2 Scatters during Free Spins award +5 spins, 3+ award +10 — features can run long. You can also buy the feature directly via Bonus Buy, or activate the Boost (3× scatter chance, bet ×3).");
        } },
        { title: "GAME RULES", render: (o, px, py, pw, ph, cx) => {
          this._section(o, px + 80, py + 110, pw - 160, "RTP & VOLATILITY", "Theoretical RTP ≈ 96%. Very high volatility — most of the payback rides on the Free Spins. All wins are added to your balance at the end of the spin.");
          this._section(o, px + 80, py + 230, pw - 160, "MAX WIN", "The maximum win per spin including the feature is capped at " + C.MAX_WIN_X.toLocaleString("en-US") + "× your bet.");
          this._section(o, px + 80, py + 350, pw - 160, "PROVABLY FAIR", "Every result is provably fair (commit/reveal, keccak256 — see the dice icon). Malfunction voids all pays and plays.");
        } },
      ];
    }

    _renderInfo() {
      const o = this.overlay; o.removeChildren(); o.visible = true;
      const W = C.DESIGN_W, H = C.DESIGN_H, cx = W / 2;
      this._dim(o, () => this.closeSettings());
      // fast-schwarzes, breites Panel wie im PNG
      const pw = 944, ph = 604, px = Math.round((W - pw) / 2), py = Math.round((H - ph) / 2);
      o.addChild(Object.assign(hPanel(pw, ph, DK.radius, DK.top, DK.bot), { x: px, y: py }));
      const pages = this._infoPages();
      const idx = this._infoPage % pages.length, page = pages[idx];
      const ttl = gradTitle(page.title, 22); ttl.anchor.set(0.5, 0); ttl.position.set(cx, py + 36); o.addChild(ttl);
      o.addChild(this._navX(px + pw - 40, py + 44, 11, () => this.closeSettings())); // Close oben-rechts
      page.render(o, px, py, pw, ph, cx);
      // Nav unten-links: ‹ ✕ ›   ·   Page x/N unten-rechts
      const navY = py + ph - 44;
      o.addChild(this._navChevron(px + 48, navY, false, () => { this._infoPage = (idx - 1 + pages.length) % pages.length; this._renderInfo(); }));
      o.addChild(this._navX(px + 92, navY, 8, () => this.closeSettings()));
      o.addChild(this._navChevron(px + 136, navY, true, () => { this._infoPage = (idx + 1) % pages.length; this._renderInfo(); }));
      const pg = pTxtM("Page " + (idx + 1) + "/" + pages.length, 13, 0xb0b3b6, { weight: "700", align: "right" }); pg.anchor.set(1, 0.5); pg.position.set(px + pw - 44, navY); o.addChild(pg);
    }

    /* =================== PROVABLY FAIR (Overview/Seeds/Verify, Figma 583×…) =================== */
    openProvablyFair() { this._fairTab = this._fairTab || "overview"; this._renderFair(); }

    _fairField(o, x, y, w, label, value) {
      const l = pTxtM(label, 11.5, HUD.textLo, { weight: "700", ls: 0.4 }); l.position.set(x, y); o.addChild(l);
      const g = new PIXI.Graphics(); g.beginFill(HUD.field); g.drawRoundedRect(x, y + 18, w, 36, 9); g.endFill(); g.lineStyle(1, 0x000000, 1); g.drawRoundedRect(x, y + 18, w, 36, 9); o.addChild(g);
      const v = pTxtM(value, 12.5, HUD.textMid, { weight: "700" }); v.anchor.set(0, 0.5); v.position.set(x + 12, y + 36); o.addChild(v);
    }

    // === RNG SETTINGS / PROVABLY FAIR — echte PNG-Tabs (Overview/Seeds/Verify) ===
    async _renderFair() {
      const tab = this._fairTab || "overview";
      const key = tab === "seeds" ? "ovRngSeeds" : tab === "verify" ? "ovRngVerify" : "ovRngOverview";
      await LF.ensureOverlay(key);
      // Breite über alle Tabs gleich (~430), Höhe je nach Tab; nicht zu groß, mittig.
      const P = this._pngPanel(key, 430, 640);
      const oc = LF.onchain || {}, cfg = oc.config || {};
      if (!this._fairClientSeed) { let s = ""; for (let i = 0; i < 16; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)]; this._fairClientSeed = s; this._fairNonce = 0; }
      const cseed = this._fairClientSeed;
      const commit = (oc.hashServerSeed && LF.keccak256) ? (oc.hashServerSeed(new Uint8Array(32)).slice(0, 42) + "…") : "—";
      const fTxt = (s, xf, yf, size, col) => { const v = pTxtM(s, size || 13, col || 0xcfcfcf, { weight: "700" }); v.anchor.set(0, 0.5); v.position.set(P.fx(xf), P.fy(yf)); P.o.addChild(v); return v; };
      // Tab-Hitzones (oben, 3 gleich breite Felder)
      const tabKeys = ["overview", "seeds", "verify"], txc = [0.22, 0.5, 0.78];
      tabKeys.forEach((t, i) => { this._hit(P.o, P.fx(txc[i] - 0.155), P.fy(0.01), P.fw(0.31), P.fh(0.065), () => { this._fairTab = t; this._renderFair(); }); });

      // Schritt 1: Panels sauber zeigen (PNG hat Texte/Buttons). Nur Klickzonen.
      // Werte in Seeds/Verify füllen die LEEREN Felder (kein Clash mit gebackenem Text).
      if (tab === "overview") {
        this._hit(P.o, P.fx(0.36), P.fy(0.90), P.fw(0.28), P.fh(0.06), () => this.flashMessage("keccak256 commit/reveal auf BASE"));
      } else if (tab === "seeds") {
        // nur die LEEREN Felder füllen (Total bets / New Client Seed sind im PNG gebacken)
        fTxt(cseed, 0.07, 0.243);
        fTxt(commit, 0.07, 0.388, 11);
        this._hit(P.o, P.fx(0.70), P.fy(0.70), P.fw(0.23), P.fh(0.055), () => { this._fairClientSeed = null; this._fairNonce = 0; this._renderFair(); });
      } else {
        // Verify ist ein Eingabe-Formular (leer by design) -> nur Button-Klickzone.
        this._hit(P.o, P.fx(0.22), P.fy(0.93), P.fw(0.56), P.fh(0.06), () => this.flashMessage("keccak256(seed:client:nonce) — live nach Deploy"));
      }
    }

    /* =================== CONTROL-BAR (1:1 aus dem HTML-Export) ===================
       Bar 978×124 zentriert. Echte Bilder: Coin, Sound, Würfel, Help; rechter
       Cluster (− Spin + Auto) als EIN Bild + transparente Klickzonen. Font: Poppins. */
    _buildBottomBar() {
      const W = C.DESIGN_W, H = C.DESIGN_H;
      const bar = new PIXI.Container();
      this.root.addChild(bar);
      this.bottomBar = bar;
      const T = LF.uiTextures || {};

      const BW = 978, BH = 124, BX = Math.round((W - BW) / 2), BY = H - BH - 8;
      const rx = (x) => BX + x, ry = (y) => BY + y;

      this._poppinsTexts = [];
      const pTxt = (str, size, color, weight, ls) => {
        const t = new PIXI.Text(str, {
          fontFamily: "Poppins, 'Arial Black', Arial, sans-serif", fontSize: size,
          fontWeight: String(weight || 700), fontStyle: "italic", fill: color, letterSpacing: ls || 0,
        });
        this._poppinsTexts.push(t);
        return t;
      };
      // Sprites werden mit ihrem Textur-KEY registriert: die UI wird vor
      // loadAssets() gebaut -> Texturen kommen erst danach. refreshUITextures()
      // setzt dann Textur + ursprüngliche Größe (sonst skaliert die neue Textur).
      this._uiSprites = [];
      const reg = (sp, key, w, h) => { sp._uiKey = key; sp._uiW = w; sp._uiH = h; this._uiSprites.push(sp); return sp; };
      const sprite = (key, cx, cy, size) => {
        const sp = new PIXI.Sprite((LF.uiTextures || {})[key] || PIXI.Texture.EMPTY);
        sp.anchor.set(0.5); sp.width = sp.height = size; sp.position.set(rx(cx), ry(cy));
        return reg(sp, key, size, size);
      };
      const iconBtn = (key, cx, cy, size, tap) => {
        const sp = sprite(key, cx, cy, size);
        sp.eventMode = "static"; sp.cursor = "pointer";
        sp.hitArea = new PIXI.Rectangle(-size / 2 - 5, -size / 2 - 5, size + 10, size + 10);
        sp.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } tap(); });
        sp.on("pointerover", () => (sp.alpha = 0.8)); sp.on("pointerout", () => (sp.alpha = 1));
        bar.addChild(sp); return sp;
      };

      // Gradient-Fade-Hintergrund (transparent -> #111), volle Breite
      const bg = this._vGradientSprite(W, 150, [[0, "rgba(30,30,30,0)"], [1, "#111111"]]);
      bg.position.set(0, H - 150); bar.addChild(bg);

      // --- Icons links: Sound (16,42) · Würfel (16,82) · Help (58,64) ---
      this.soundIcon = iconBtn("sndOn", 16, 42, 30, () => this.openSettingsMenu());
      iconBtn("dice", 16, 82, 30, () => this.openProvablyFair());
      iconBtn("help", 58, 64, 44, () => this.openInfo());

      // --- CREDIT / BET (Poppins italic) + Coin-Bild ---
      const cL = pTxt("CREDIT", 20, 0xdfe2e5, 700, -1.4); cL.anchor.set(0, 0.5); cL.position.set(rx(108), ry(40)); bar.addChild(cL);
      bar.addChild(sprite("coin", 208, 40, 19));
      this.balanceText = pTxt("0.00", 18, 0xeef0f2, 600, -0.2); this.balanceText.anchor.set(0, 0.5); this.balanceText.position.set(rx(224), ry(40)); bar.addChild(this.balanceText);
      const bL = pTxt("BET", 20, 0xdfe2e5, 700, -1.4); bL.anchor.set(0, 0.5); bL.position.set(rx(108), ry(84)); bar.addChild(bL);
      bar.addChild(sprite("coin", 220, 84, 19));
      this.betText = pTxt("0.00", 18, 0xeef0f2, 600, -0.2); this.betText.anchor.set(0, 0.5); this.betText.position.set(rx(236), ry(84)); bar.addChild(this.betText);
      bar.addChild(rectButton(rx(104), ry(70), 150, 36, () => this.openBetMenu()));

      // Boost-Badge (3×)
      this.boostBadge = new PIXI.Container();
      const bbg = new PIXI.Graphics(); bbg.beginFill(0xe5208c); bbg.drawRoundedRect(0, 0, 56, 14, 7); bbg.endFill();
      this.boostBadge.addChild(bbg);
      const bbt = pTxt("3× BOOST", 9, 0xffffff, 700); bbt.anchor.set(0.5); bbt.position.set(28, 7); this.boostBadge.addChild(bbt);
      this.boostBadge.position.set(rx(300), ry(96)); this.boostBadge.visible = false;
      bar.addChild(this.boostBadge);

      // --- Status / WIN (Mitte) ---
      this.statusText2 = pTxt("START AND WIN", 30, 0xffffff, 700, -2);
      this.statusText2.anchor.set(0.5); this.statusText2.position.set(rx(526), ry(62)); bar.addChild(this.statusText2);

      // --- rechter Cluster: EIN Bild (− Spin + Auto) + Klickzonen ---
      this.spinClusterImg = new PIXI.Sprite((LF.uiTextures || {}).clusterIdle || PIXI.Texture.EMPTY);
      this.spinClusterImg.width = 209; this.spinClusterImg.height = 125; this.spinClusterImg.position.set(rx(769), ry(0));
      reg(this.spinClusterImg, "clusterIdle", 209, 125);
      bar.addChild(this.spinClusterImg);
      bar.addChild(rectButton(rx(771), ry(14), 46, 44, () => this.onBet(-1)));         // −
      this.spinBtn = rectButton(rx(837), ry(8), 74, 74, () => { if (!this._spinning) this.onSpin(); }); bar.addChild(this.spinBtn);
      bar.addChild(rectButton(rx(930), ry(14), 46, 44, () => this.onBet(+1)));         // +
      this.autoBtn = rectButton(rx(796), ry(79), 155, 42, () => this.openAutoplayMenu()); bar.addChild(this.autoBtn);
      this.spinIcon = new PIXI.Graphics(); this.autoIcon = new PIXI.Graphics(); // Dummies (update/setAutoplay-kompatibel)

      // --- BONUS BUY (oben-links über der Bar, gleicher Stil) ---
      const buyW = 168, buyH = 42, buyX = rx(2), buyY = BY - buyH - 6;
      this.buyBtn = rectButton(buyX, buyY, buyW, buyH, () => this.onBuy());
      const buyG = new PIXI.Graphics();
      buyG.beginFill(0x2c2c2c); buyG.drawRoundedRect(0, 0, buyW, buyH, 12); buyG.endFill();
      buyG.lineStyle(1.5, 0x000000, 1); buyG.drawRoundedRect(0, 0, buyW, buyH, 12);
      buyG.lineStyle(1, 0xffffff, 0.16); buyG.moveTo(12, 1.2); buyG.lineTo(buyW - 12, 1.2);
      this.buyBtn.addChild(buyG);
      const bCoin = new PIXI.Sprite((LF.uiTextures || {}).coin || PIXI.Texture.EMPTY); bCoin.anchor.set(0.5); bCoin.width = bCoin.height = 22; bCoin.position.set(24, buyH / 2); reg(bCoin, "coin", 22, 22); this.buyBtn.addChild(bCoin);
      const buyT = pTxt("BONUS BUY", 14, 0xffaf68, 700, 0.5); buyT.anchor.set(0.5); buyT.position.set(buyW / 2 + 12, buyH / 2); this.buyBtn.addChild(buyT);
      this.buyBtn.cursor = "pointer";
      this.buyBtn.on("pointerover", () => (buyG.alpha = 0.85)); this.buyBtn.on("pointerout", () => (buyG.alpha = 1));
      bar.addChild(this.buyBtn);

      // Poppins ist ein Webfont -> Pixi rastert Canvas-Text beim Erstellen.
      // Sobald der Font wirklich da ist, alle Bar-Texte neu rastern lassen.
      if (typeof document !== "undefined" && document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.load("italic 700 20px Poppins"),
          document.fonts.load("italic 600 18px Poppins"),
          document.fonts.load("italic 700 30px Poppins"),
        ]).then(() => {
          (this._poppinsTexts || []).forEach((t) => { try { t.dirty = true; } catch (e) {} });
        }).catch(() => {});
      }
    }

    // Textur setzen UND die ursprüngliche Anzeigegröße wiederherstellen
    // (eine neue Textur würde sonst über die alte scale skalieren).
    _setUITex(sp, tex) { if (sp && tex) { sp.texture = tex; if (sp._uiW) sp.width = sp._uiW; if (sp._uiH) sp.height = sp._uiH; } }

    // Nach loadAssets aufrufen: alle Bar-Bilder mit den echten Texturen bestücken.
    refreshUITextures() {
      const T = LF.uiTextures || {};
      (this._uiSprites || []).forEach((sp) => this._setUITex(sp, T[sp._uiKey]));
      this._refreshUIIcons();
      this.setSpinning(this._spinning);
    }

    _refreshUIIcons() {
      const T = LF.uiTextures || {};
      if (this.soundIcon && LF.sound) this._setUITex(this.soundIcon, LF.sound.enabled ? T.sndOn : T.sndOff);
    }

    // weicher dunkler Radial-Scrim (Schatten unter dem Board), anchor 0.5
    _radialScrim(w, h, maxAlpha) {
      const cw = Math.ceil(w), ch = Math.ceil(h);
      const cv = document.createElement("canvas");
      cv.width = cw; cv.height = ch;
      const ctx = cv.getContext("2d");
      const cx = cw / 2, cy = ch / 2;
      const inner = Math.min(cw, ch) * 0.28;
      const outer = Math.max(cw, ch) * 0.55;
      const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      grad.addColorStop(0, "rgba(0,0,0," + maxAlpha + ")");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
      const sp = new PIXI.Sprite(PIXI.Texture.from(cv));
      sp.anchor.set(0.5);
      return sp;
    }

    // glatter vertikaler Farbverlauf als Sprite (über Offscreen-Canvas)
    _vGradientSprite(w, h, stops) {
      const cv = document.createElement("canvas");
      cv.width = Math.max(2, Math.ceil(w));
      cv.height = Math.max(2, Math.ceil(h));
      const ctx = cv.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
      stops.forEach((s) => grad.addColorStop(s[0], s[1]));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cv.width, cv.height);
      const sp = new PIXI.Sprite(PIXI.Texture.from(cv));
      sp.width = w; sp.height = h;
      return sp;
    }

    // "kreisende Pfeile"-Icon (zwei Bögen + saubere Spitzen) zentriert um (0,0)
    _drawRefreshIcon(g, r, color, lw) {
      g.clear();
      lw = lw || Math.max(3, r * 0.2);
      // ein Bogen-Pfeil von startA bis endA; Spitze sitzt am endA entlang der Tangente
      const seg = (startA, endA) => {
        g.lineStyle({ width: lw, color, alpha: 1, cap: "round" });
        g.arc(0, 0, r, startA, endA);
        g.lineStyle(0);
        const e = endA;
        const px = Math.cos(e) * r, py = Math.sin(e) * r;     // Endpunkt auf dem Bogen
        const tx = -Math.sin(e), ty = Math.cos(e);            // Tangente (Laufrichtung)
        const nx = Math.cos(e), ny = Math.sin(e);             // Radial (nach außen)
        const ah = lw * 1.9, aw = lw * 1.45;
        g.beginFill(color);
        g.drawPolygon([
          px + tx * ah, py + ty * ah,        // Spitze
          px + nx * aw, py + ny * aw,        // äußere Basis
          px - nx * aw, py - ny * aw,        // innere Basis
        ]);
        g.endFill();
      };
      // zwei Pfeile, gegenüberliegend, mit Lücke oben/unten
      const gap = 0.62;
      seg(gap, Math.PI - gap);
      seg(Math.PI + gap, Math.PI * 2 - gap);
    }

    /* =================== OVERLAYS =================== */
    _buildOverlays() {
      this.overlay = new PIXI.Container();
      this.overlay.visible = false;
      this.root.addChild(this.overlay);

      this.fsLayer = new PIXI.Container();
      this.fsLayer.visible = false;
      this.root.addChild(this.fsLayer);

      // --- FS-Zähler kompakt rechts ---
      const hx = 1040, hy = 152, hw = 136, hh = 92, hcx = hx + hw / 2;
      const hud = new PIXI.Graphics();
      hud.beginFill(0x0a0f14, 0.62);
      hud.drawRoundedRect(hx, hy, hw, hh, 14);
      hud.endFill();
      hud.lineStyle(1, 0xffffff, 0.10);
      hud.drawRoundedRect(hx, hy, hw, hh, 14);
      this.fsLayer.addChild(hud);

      const fsLbl = new PIXI.Text("FREISPIELE", {
        fontFamily: "Arial", fontSize: 13, fontWeight: "700", fill: 0xbcd0c2, letterSpacing: 1,
      });
      fsLbl.anchor.set(0.5); fsLbl.position.set(hcx, hy + 26); this.fsLayer.addChild(fsLbl);

      this.fsCountText = new PIXI.Text("0 / 0", {
        fontFamily: "Arial Black, Arial", fontSize: 30, fontWeight: "900", fill: 0xffe27a,
      });
      this.fsCountText.anchor.set(0.5); this.fsCountText.position.set(hcx, hy + 60);
      this.fsLayer.addChild(this.fsCountText);

      // --- Multiplikator-Feld oben mittig (kleine Box) ---
      const mbCx = C.DESIGN_W / 2, mbCy = 70;
      this._multBoxPos = { x: mbCx, y: mbCy };
      this.multBox = new PIXI.Container();
      this.multBox.position.set(mbCx, mbCy);
      this.fsLayer.addChild(this.multBox);
      const mbBg = new PIXI.Graphics();
      mbBg.beginFill(0x0a0f14, 0.78); mbBg.drawRoundedRect(-62, -27, 124, 54, 13); mbBg.endFill();
      mbBg.lineStyle(2, 0xffd54f, 0.9); mbBg.drawRoundedRect(-62, -27, 124, 54, 13);
      this.multBox.addChild(mbBg);
      const mbLbl = new PIXI.Text("MULTIPLIKATOR", {
        fontFamily: "Arial", fontSize: 10, fontWeight: "700", fill: 0xbcd0c2, letterSpacing: 1,
      });
      mbLbl.anchor.set(0.5); mbLbl.position.set(0, -15); this.multBox.addChild(mbLbl);
      this.multBoxText = new PIXI.Text("x1", {
        fontFamily: "Arial Black, Arial", fontSize: 26, fontWeight: "900", fill: 0xffd54f,
      });
      this.multBoxText.anchor.set(0.5); this.multBoxText.position.set(0, 8); this.multBox.addChild(this.multBoxText);

      // --- Zentraler Multiplikator-Pop (fliegt bei Erhöhung hoch in die Box) ---
      this.multPop = new PIXI.Container();
      this.multPop.position.set(C.DESIGN_W / 2, C.DESIGN_H / 2 - 24);
      this.multPop.alpha = 0;
      this.root.addChild(this.multPop);
      this.multPopGlow = new PIXI.Text("x1", {
        fontFamily: "Arial Black, Arial", fontSize: 104, fontWeight: "900", fill: 0xff5da2,
      });
      this.multPopGlow.anchor.set(0.5); this.multPopGlow.alpha = 0.35; this.multPop.addChild(this.multPopGlow);
      this.multPopText = new PIXI.Text("x1", {
        fontFamily: "Arial Black, Arial", fontSize: 88, fontWeight: "900",
        fill: 0xffd54f, stroke: 0x3a1020, strokeThickness: 9,
      });
      this.multPopText.anchor.set(0.5); this.multPop.addChild(this.multPopText);

      // --- Per-Spin-Multiply (FS): zentraler Betrag + "×m"-Token der drauf fliegt ---
      this.spinWinText = new PIXI.Text("", {
        fontFamily: "Arial Black, Arial", fontSize: 52, fontWeight: "900",
        fill: 0xffffff, stroke: 0x14391a, strokeThickness: 6,
      });
      this.spinWinText.anchor.set(0.5); this.spinWinText.visible = false;
      this.root.addChild(this.spinWinText);
      this.multToken = new PIXI.Text("×2", {
        fontFamily: "Arial Black, Arial", fontSize: 56, fontWeight: "900",
        fill: 0xffd54f, stroke: 0x2a0f1a, strokeThickness: 7,
      });
      this.multToken.anchor.set(0.5); this.multToken.visible = false;
      this.root.addChild(this.multToken);

      // Win-Anzeige (mittig über der Bar bei Gewinn)
      this.winBanner = new PIXI.Text("", {
        fontFamily: "Arial Black, Arial", fontSize: 30, fontWeight: "900",
        fill: 0xffe27a, stroke: 0x402a00, strokeThickness: 5,
      });
      this.winBanner.anchor.set(0.5);
      this.winBanner.position.set(C.DESIGN_W / 2, C.DESIGN_H - 112);
      this.winBanner.visible = false;
      this.root.addChild(this.winBanner);

      // Toast
      this.toast = new PIXI.Text("", {
        fontFamily: "Arial Black, Arial", fontSize: 28, fontWeight: "900",
        fill: 0xffffff, stroke: 0x000000, strokeThickness: 5,
      });
      this.toast.anchor.set(0.5);
      this.toast.position.set(C.DESIGN_W / 2, C.DESIGN_H / 2);
      this.toast.alpha = 0;
      this.root.addChild(this.toast);

      // --- Win-Celebration (Superb/Sensational/Epic + hochzählender Betrag) ---
      this.winLayer = new PIXI.Container();
      this.winLayer.visible = false;
      this.winLayer.position.set(C.DESIGN_W / 2, C.DESIGN_H / 2 - 8);
      this.root.addChild(this.winLayer);
      const wScrim = this._radialScrim(760, 440, 0.55);
      this.winLayer.addChild(wScrim);
      this.winTierText = new PIXI.Text("", {
        fontFamily: "Arial Black, Arial", fontSize: 48, fontWeight: "900",
        fill: 0xffd54f, stroke: 0x2a0f1a, strokeThickness: 7,
      });
      this.winTierText.anchor.set(0.5); this.winTierText.position.set(0, -66);
      this.winLayer.addChild(this.winTierText);
      this.winPill = new PIXI.Graphics();
      this.winPill.position.set(0, 28);
      this.winLayer.addChild(this.winPill);
      this.winAmountText = new PIXI.Text("0,00$", {
        fontFamily: "Arial Black, Arial", fontSize: 50, fontWeight: "900",
        fill: 0xffffff, stroke: 0x14391a, strokeThickness: 6,
      });
      this.winAmountText.anchor.set(0.5); this.winAmountText.position.set(0, 28);
      this.winLayer.addChild(this.winAmountText);
    }

    // Win-Celebration: Stufe nach Gewinn (× Einsatz), Betrag zählt hoch. -> Promise
    async showWinCelebration(totalWin, winX) {
      let tier = null, level = 2, color = 0x9ccc4a;
      if (winX >= 120) { tier = "EPIC WIN"; level = 4; color = 0xff5da2; }
      else if (winX >= 75) { tier = "SENSATIONAL"; level = 3; color = 0xffd54f; }
      else if (winX >= 15) { tier = "SUPERB"; level = 2; color = 0x9ccc4a; }
      else return;

      this.winTierText.text = tier;
      this.winTierText.style.fill = color;
      this.winPill.clear();
      this.winPill.beginFill(0x000000, 0.25); this.winPill.drawRoundedRect(-188, -25, 376, 96, 48); this.winPill.endFill();
      this.winPill.lineStyle(4, 0xffffff, 0.9);
      this.winPill.beginFill(0xe5208c); this.winPill.drawRoundedRect(-182, -28, 364, 88, 44); this.winPill.endFill();

      this.winAmountText.text = LF.money(0);
      this.winLayer.visible = true;
      this.winLayer.alpha = 0;
      this.winLayer.scale.set(0.7);
      if (LF.sound) LF.sound.win(level);
      await Promise.all([
        LF.tween.to(this.winLayer, { alpha: 1 }, 200, LF.ease.outQuad),
        LF.tween.to(this.winLayer.scale, { x: 1, y: 1 }, 280, LF.ease.outBack),
      ]);
      // hochzählen
      const dur = 1100 + level * 350, steps = 48;
      for (let i = 1; i <= steps; i++) {
        const p = LF.ease.outQuad(i / steps);
        this.winAmountText.text = LF.money(totalWin * p);
        await LF.delay(dur / steps);
      }
      this.winAmountText.text = LF.money(totalWin);
      await LF.delay(750);
      await LF.tween.to(this.winLayer, { alpha: 0 }, 280, LF.ease.inQuad);
      this.winLayer.visible = false;
    }

    /* =================== PUBLIC API (vom Engine genutzt) =================== */
    setBalance(v) { if (this.balanceText) this.balanceText.text = v.toFixed(2); }
    setBet(v) { if (this.betText) this.betText.text = v.toFixed(2); }

    setWin(v) {
      // Gewinn in der Mitte der Control-Bar (Design hat keine separate WIN-Anzeige).
      if (this.statusText2) this.statusText2.text = v > 0 ? "WIN  " + v.toFixed(2) : "START AND WIN";
      if (this.winTopText) this.winTopText.text = (v > 0 ? v : 0).toFixed(2);
      if (this.winBanner) this.winBanner.visible = false;
    }

    setSpinning(on) {
      this._spinning = on;
      // Rechter Cluster: Idle-Bild (Pfeile) <-> Stop-Bild (Quadrat) tauschen.
      if (this.spinClusterImg) {
        const T = LF.uiTextures || {};
        this._setUITex(this.spinClusterImg, on ? T.clusterStop : T.clusterIdle);
      }
    }

    setAutoplay(on) {
      this._autoplay = on;
      // Auto-Zone ist Teil des Cluster-Bildes; dezenter Tint als Aktiv-Hinweis.
      if (this.spinClusterImg) this.spinClusterImg.tint = on ? 0xc8e6a0 : 0xffffff;
    }

    setFSMultiplier(m) { this.multBoxText.text = "x" + m; }

    showFreeSpins(total) {
      this.fsLayer.visible = true;
      this.fsCountText.text = "0 / " + total;
      this.multBoxText.text = "x1";
    }
    updateFreeSpins(spin, total) {
      this.fsCountText.text = spin + " / " + total;
    }
    hideFreeSpins() { this.fsLayer.visible = false; this.multPop.alpha = 0; }

    // Neuen Multi kurz groß mittig zeigen, dann hoch in die Box fliegen lassen,
    // dort sticky setzen + kurzer Box-Bump. -> Promise
    flashMultiplier(value) {
      const txt = "x" + value;
      this.multPopText.text = txt;
      this.multPopGlow.text = txt;
      LF.tween.killOf(this.multPop);
      LF.tween.killOf(this.multPop.scale);
      LF.tween.killOf(this.multPop.position);
      this.multPop.position.set(C.DESIGN_W / 2, C.DESIGN_H / 2 - 24);
      this.multPop.alpha = 0;
      this.multPop.scale.set(0.4);
      return (async () => {
        // 1) groß in der Mitte aufploppen
        await Promise.all([
          LF.tween.to(this.multPop, { alpha: 1 }, 130, LF.ease.outQuad),
          LF.tween.to(this.multPop.scale, { x: 1.18, y: 1.18 }, 180, LF.ease.outBack),
        ]);
        await LF.delay(150);
        // 2) hoch in die Box fliegen (schrumpfen + ausblenden)
        await Promise.all([
          LF.tween.to(this.multPop.position, { x: this._multBoxPos.x, y: this._multBoxPos.y }, 240, LF.ease.inQuad),
          LF.tween.to(this.multPop.scale, { x: 0.32, y: 0.32 }, 240, LF.ease.inQuad),
          LF.tween.to(this.multPop, { alpha: 0 }, 240, LF.ease.inQuad),
        ]);
        // 3) Box übernimmt den Wert (sticky) + Bump
        this.setFSMultiplier(value);
        LF.tween.killOf(this.multBox.scale);
        this.multBox.scale.set(1.3);
        await LF.tween.to(this.multBox.scale, { x: 1, y: 1 }, 170, LF.ease.outBack);
      })();
    }

    // FS-Spin-Ende: Betrag zeigen, "×m" fliegt aus der Box drauf, Betrag multipliziert sich. -> Promise
    multiplyWin(baseAmount, mult, finalAmount) {
      const cx = C.DESIGN_W / 2, cy = C.DESIGN_H / 2 + 8;
      this.spinWinText.text = LF.money(baseAmount);
      this.spinWinText.position.set(cx, cy);
      this.spinWinText.alpha = 0; this.spinWinText.scale.set(0.8); this.spinWinText.visible = true;
      this.multToken.text = "×" + mult;
      this.multToken.position.set(this._multBoxPos.x, this._multBoxPos.y);
      this.multToken.alpha = 0; this.multToken.scale.set(1); this.multToken.visible = true;
      LF.tween.killOf(this.spinWinText); LF.tween.killOf(this.spinWinText.scale);
      LF.tween.killOf(this.multToken); LF.tween.killOf(this.multToken.position); LF.tween.killOf(this.multToken.scale);
      return (async () => {
        await Promise.all([
          LF.tween.to(this.spinWinText, { alpha: 1 }, 150, LF.ease.outQuad),
          LF.tween.to(this.spinWinText.scale, { x: 1, y: 1 }, 200, LF.ease.outBack),
        ]);
        await LF.delay(160);
        // "×m" fliegt von der Box auf den Betrag
        this.multToken.alpha = 1;
        await Promise.all([
          LF.tween.to(this.multToken.position, { x: cx, y: cy }, 320, LF.ease.inQuad),
          LF.tween.to(this.multToken.scale, { x: 1.4, y: 1.4 }, 320, LF.ease.inQuad),
        ]);
        this.multToken.alpha = 0;
        if (LF.sound) LF.sound.win(2);
        // Betrag zählt hoch auf finalen Wert + Pop
        this.spinWinText.scale.set(1.32);
        LF.tween.to(this.spinWinText.scale, { x: 1, y: 1 }, 240, LF.ease.outBack);
        const steps = 22;
        for (let i = 1; i <= steps; i++) {
          this.spinWinText.text = LF.money(baseAmount + (finalAmount - baseAmount) * (i / steps));
          await LF.delay(14);
        }
        this.spinWinText.text = LF.money(finalAmount);
        await LF.delay(420);
        await LF.tween.to(this.spinWinText, { alpha: 0 }, 200, LF.ease.inQuad);
        this.spinWinText.visible = false; this.multToken.visible = false;
      })();
    }

    flashMessage(msg) {
      this.toast.text = msg;
      LF.tween.killOf(this.toast);
      this.toast.alpha = 1;
      this.toast.scale.set(0.8);
      LF.tween.to(this.toast.scale, { x: 1, y: 1 }, 200, LF.ease.outBack);
      LF.delay(900).then(() => LF.tween.to(this.toast, { alpha: 0 }, 400));
    }

    setBoostIndicator(on) { if (this.boostBadge) this.boostBadge.visible = !!on; }

    closeBuyMenu() {
      this.overlay.visible = false;
      this.overlay.removeChildren();
    }

    /* =================== SETTINGS-MENÜ (linkes Panel) =================== */
    closeSettings() {
      this.overlay.visible = false;
      this.overlay.removeChildren();
    }

    _setSpeed(level) {
      this._turboLevel = (this._turboLevel === level) ? 0 : level;
      LF.speed = this._turboLevel === 2 ? 0.3 : this._turboLevel === 1 ? 0.55 : 1;
    }

    _dim(o, onClose) {
      const d = new PIXI.Graphics();
      d.beginFill(0x05070a, 0.72); d.drawRect(0, 0, C.DESIGN_W, C.DESIGN_H); d.endFill();
      d.eventMode = "static"; d.on("pointertap", onClose); o.addChild(d);
    }

    // Voll-PNG-Overlay zentriert als Hintergrund + Mapper für fraktionale Positionen (0..1).
    // maxW/maxH = max. Anzeigegröße; Seitenverhältnis der PNG bleibt erhalten.
    _pngPanel(texKey, maxW, maxH, onClose) {
      const o = this.overlay; o.removeChildren(); o.visible = true;
      const W = C.DESIGN_W, H = C.DESIGN_H;
      this._dim(o, onClose || (() => this.closeSettings()));
      const tex = (LF.uiTextures || {})[texKey];
      let pw = maxW, ph = maxH;
      if (tex && tex.width && tex.height) {
        const ar = tex.width / tex.height;
        ph = maxH; pw = ph * ar; if (pw > maxW) { pw = maxW; ph = pw / ar; }
      }
      // hochauflösend & scharf: lineare Texturfilterung (gestochenes Downscale des großen PNG)
      if (tex && tex.baseTexture) tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      // ganze Pixel -> kein Sub-Pixel-Blur
      const px = Math.round((W - pw) / 2), py = Math.round((H - ph) / 2);
      const sp = new PIXI.Sprite(tex || PIXI.Texture.EMPTY); sp.width = pw; sp.height = ph; sp.position.set(px, py);
      sp.roundPixels = true;
      sp.eventMode = "static"; // Klick aufs Panel schließt das Dim NICHT
      o.addChild(sp);
      return { o, px, py, pw, ph, fx: (f) => px + f * pw, fy: (f) => py + f * ph, fw: (f) => f * pw, fh: (f) => f * ph };
    }

    // transparente Klickzone (über einem im PNG gebackenen Button)
    _hit(o, x, y, w, h, onTap) {
      const g = new PIXI.Graphics(); g.beginFill(0xffffff, 0.001); g.drawRect(x, y, w, h); g.endFill();
      g.eventMode = "static"; g.cursor = "pointer";
      g.on("pointertap", () => { if (LF.sound) { LF.sound.unlock(); LF.sound.click(); } onTap(); });
      o.addChild(g); return g;
    }

    // === SYSTEM SETTINGS (Sound/Music/Fullscreen) — öffnet über das Sound-Icon ===
    async openSettingsMenu() {
      // PNG-Panel (Titel/Labels/Beschreibungen gebacken) + funktionale Toggles drüber.
      await LF.ensureOverlay("ovSystem"); // lazy: Overlay garantiert geladen, bevor _pngPanel misst
      const P = this._pngPanel("ovSystem", 472, 472);
      const rows = [
        { get: () => !!(LF.sound && LF.sound.musicEnabled), set: (v) => LF.sound && LF.sound.setMusic(v) },
        { get: () => !!(LF.sound && LF.sound.enabled), set: (v) => LF.sound && LF.sound.setEnabled(v) },
        { get: () => !!document.fullscreenElement, set: () => this.toggleFullscreen() },
      ];
      const yfr = [0.335, 0.596, 0.858], tw = P.fw(0.18);
      rows.forEach((r, i) => {
        P.o.addChild(hRockerC(P.fx(0.828), P.fy(yfr[i]), tw, r.get(), (v) => { r.set(v); this._refreshUIIcons(); this._refreshTopIcons(); }));
      });
    }

    // === AUTOPLAY SETTINGS (Turbo/Quick/Skip Rocker + Anzahl-Slider + START AUTOPLAY) ===
    async openAutoplayMenu() {
      // PNG-Panel (Titel + Toggle-Labels + "NUMBER OF AUTOSPINS" gebacken) + Controls drüber.
      await LF.ensureOverlay("ovAutoplay");
      const P = this._pngPanel("ovAutoplay", 662, 470);
      const groups = [
        { set: () => this._setSpeed(2), get: () => (this._turboLevel || 0) === 2 },
        { set: () => this._setSpeed(1), get: () => (this._turboLevel || 0) === 1 },
        { set: () => { this._skipScreens = !this._skipScreens; }, get: () => !!this._skipScreens },
      ];
      const txf = [0.115, 0.43, 0.74], tw = P.fw(0.105);
      groups.forEach((g, i) => { P.o.addChild(hRockerC(P.fx(txf[i]), P.fy(0.30), tw, g.get(), () => { g.set(); this.openAutoplayMenu(); })); });
      const val = this._autospins || 20;
      const slX = P.fx(0.05), slR = P.fx(0.95), slW = slR - slX, slY = P.fy(0.653), slH = P.fh(0.085), frac = val / 100;
      const tb = new PIXI.Graphics(); tb.beginFill(0x070708); tb.drawRoundedRect(slX, slY - slH / 2, slW, slH, slH / 2); tb.endFill(); tb.lineStyle(1.5, 0x000000, 1); tb.drawRoundedRect(slX + 0.75, slY - slH / 2 + 0.75, slW - 1.5, slH - 1.5, slH / 2); P.o.addChild(tb);
      const ln = new PIXI.Graphics(); ln.lineStyle(2, 0xffffff, 0.5); ln.moveTo(slX + 16, slY); ln.lineTo(slR - 16, slY); P.o.addChild(ln);
      const kx = slX + 16 + (slW - 32) * frac;
      const kb = new PIXI.Graphics(); kb.beginFill(0x2a2a2e); kb.drawRoundedRect(kx - 26, slY - 15, 52, 30, 15); kb.endFill(); kb.lineStyle(1, 0xffffff, 0.16); kb.drawRoundedRect(kx - 25.5, slY - 14.5, 51, 29, 15); P.o.addChild(kb);
      const vt = pTxtM(String(val), 15, 0xffffff, { weight: "800", align: "center" }); vt.anchor.set(0.5); vt.position.set(kx, slY); P.o.addChild(vt);
      const hit = new PIXI.Graphics(); hit.beginFill(0xffffff, 0.001); hit.drawRect(slX, slY - slH, slW, slH * 2); hit.endFill(); hit.eventMode = "static"; hit.cursor = "pointer";
      hit.on("pointertap", (ev) => { const lp = ev.getLocalPosition(P.o); let fr = (lp.x - (slX + 16)) / (slW - 32); fr = Math.max(0, Math.min(1, fr)); this._autospins = Math.max(5, Math.round(fr * 100 / 5) * 5); this.openAutoplayMenu(); }); P.o.addChild(hit);
      // START-Button bleibt der gebackene PNG-Button -> nur transparente Klickzone darüber.
      this._hit(P.o, P.fx(0.266), P.fy(0.767), P.fw(0.469), P.fh(0.146), () => { this.closeSettings(); this.onAutoplay(); });
    }

    // === BET (BET / COIN VALUE / TOTAL BET — Stepper + Coin + BET MAX) ===
    async openBetMenu() {
      // PNG-Panel (Titel + BET/COIN VALUE/TOTAL BET Labels gebacken) + Stepper/Werte drüber.
      await LF.ensureOverlay("ovBet");
      const P = this._pngPanel("ovBet", 360, 552);
      const betStr = this.betText ? this.betText.text : C.BET_LEVELS[C.DEFAULT_BET_INDEX].toFixed(2);
      const rows = [
        { val: betStr, coin: false, y: 0.324 },
        { val: betStr, coin: true, y: 0.526 },
        { val: betStr, coin: true, y: 0.728 },
      ];
      const sw = P.fw(0.205), sh = P.fh(0.072);
      rows.forEach((r) => {
        const ry = P.fy(r.y);
        // Stepper bleiben die gebackenen PNG-Buttons -> nur Klickzonen.
        this._hit(P.o, P.fx(0.07), ry - sh / 2, sw, sh, () => { this.onBet(-1); this.openBetMenu(); });
        this._hit(P.o, P.fx(0.93) - sw, ry - sh / 2, sw, sh, () => { this.onBet(1); this.openBetMenu(); });
        // Echten Wert über die gebackene Zahl legen (kleiner Patch in Box-Farbe + Wert).
        const numX = r.coin ? P.fx(0.555) : P.fx(0.5), pw2 = P.fw(0.16), ph2 = sh * 0.62;
        const patch = new PIXI.Graphics(); patch.beginFill(0x070708); patch.drawRect(numX - pw2 / 2, ry - ph2 / 2, pw2, ph2); patch.endFill(); P.o.addChild(patch);
        const v = pTxtM(r.val, 19, 0xeaeaea, { weight: "800", align: "center" }); v.anchor.set(0.5); v.position.set(numX, ry); P.o.addChild(v);
      });
      // BET MAX bleibt der gebackene PNG-Button -> nur Klickzone.
      this._hit(P.o, P.fx(0.08), P.fy(0.92) - P.fh(0.045), P.fw(0.84), P.fh(0.09), () => { this.onBetMax(); this.openBetMenu(); });
    }

    // Buy-Menü mit 3 Cards (3 Scatter / 4 Scatter / Boost)
    openBuyMenu(state) {
      this._buyState = state;
      this._renderBuyMenu();
    }

    _renderBuyMenu() {
      const s = this._buyState; if (!s) return;
      const o = this.overlay;
      o.removeChildren(); o.visible = true;
      const W = C.DESIGN_W, H = C.DESIGN_H, cx = W / 2;
      this._dim(o, () => this.closeBuyMenu());

      const title = hTxt("BONUS BUY", 24, HUD.textHi, { italic: true, ls: 3, align: "center" });
      title.anchor.set(0.5); title.position.set(cx, 52); o.addChild(title);
      o.addChild(hClose(W - 48, 50, () => this.closeBuyMenu()));

      // BET-Stepper (dunkel)
      const sbW = 232, sbH = 62, sbX = cx - sbW / 2, sbY = 86;
      o.addChild(Object.assign(hPanel(sbW, sbH, 12), { x: sbX, y: sbY }));
      const elbl = hTxt("BET", 11, HUD.textLo, { ls: 1, align: "center" }); elbl.anchor.set(0.5); elbl.position.set(cx, sbY + 17); o.addChild(elbl);
      const eVal = hTxt(LF.money(s.bet).replace("$", ""), 20, HUD.textHi, { align: "center" }); eVal.anchor.set(0.5); eVal.position.set(cx, sbY + 40); o.addChild(eVal);
      o.addChild(hStep(sbX + 30, sbY + 31, false, () => this.onBuyBetChange(-1)));
      o.addChild(hStep(sbX + sbW - 30, sbY + 31, true, () => this.onBuyBetChange(1)));

      // 3 dunkle Cards
      const cardW = 280, cardH = 358, gap = 28, totalW = cardW * 3 + gap * 2, startX = cx - totalW / 2, top = 174;
      const cN = [0, 1, 2].map((i) => startX + cardW / 2 + i * (cardW + gap));
      const f3 = s.features[3], f4 = s.features[4];
      const sp3 = C.FREESPINS.trigger[3] || 10, sp4 = C.FREESPINS.trigger[4] || 12;
      this._buyCard(cN[0], top, cardW, cardH, { accent: 0xff7a2f, title: "3 SCATTER", desc: sp3 + " Free Spins\nStandard feature", icon: "SC", badge: "3", vola: "Volatility: High", price: LF.money(f3.cost * s.bet), btn: "BUY", onTap: () => this._confirmBuy(3, f3.cost * s.bet) });
      this._buyCard(cN[1], top, cardW, cardH, { accent: 0xffc02e, title: "4 SCATTER", desc: sp4 + " Free Spins\nMore spins", icon: "SC", badge: "4", vola: "Volatility: Very high", price: LF.money(f4.cost * s.bet), btn: "BUY", onTap: () => this._confirmBuy(4, f4.cost * s.bet) });
      this._buyCard(cN[2], top, cardW, cardH, { accent: 0xe5208c, title: "BONUS BOOST", desc: "3× scatter chance\nBet ×3 per spin", iconText: "×3", vola: "Boost mode", price: s.boostActive ? "ACTIVE" : "ON / OFF", btn: s.boostActive ? "ACTIVE ✓" : "ACTIVATE", onTap: () => this._confirmBoost() });
    }

    _buyCard(cx, top, w, h, opt) {
      const o = this.overlay, x = cx - w / 2;
      const card = new PIXI.Graphics();
      card.beginFill(0xffffff, 0.07); card.drawRoundedRect(x, top, w, h, 14); card.endFill();
      card.lineStyle(1.5, 0xffffff, 0.14); card.drawRoundedRect(x, top, w, h, 14);
      card.beginFill(opt.accent, 0.92); card.drawRoundedRect(x, top, w, 5, 0); card.endFill();
      o.addChild(card);

      const t = hTxt(opt.title, 18, HUD.textHi, { italic: true, align: "center" }); t.anchor.set(0.5); t.position.set(cx, top + 30); o.addChild(t);
      const d = hTxt(opt.desc, 12, HUD.textMid, { weight: "400", align: "center", lh: 16 }); d.anchor.set(0.5); d.position.set(cx, top + 64); o.addChild(d);

      const iconY = top + 148;
      if (opt.icon && LF.textures && LF.textures[opt.icon]) {
        const sp = new PIXI.Sprite(LF.textures[opt.icon]); sp.anchor.set(0.5); sp.width = sp.height = 90; sp.position.set(cx, iconY); o.addChild(sp);
        if (opt.badge) {
          const bg = new PIXI.Graphics(); bg.lineStyle(2, 0xffffff, 1); bg.beginFill(opt.accent); bg.drawCircle(cx + 36, iconY - 34, 15); bg.endFill(); o.addChild(bg);
          const bt = hTxt(opt.badge, 15, 0x2a1500); bt.anchor.set(0.5); bt.position.set(cx + 36, iconY - 34); o.addChild(bt);
        }
      } else {
        const ic = new PIXI.Graphics(); ic.lineStyle(3, opt.accent, 1); ic.beginFill(0xffffff, 0.06); ic.drawRoundedRect(cx - 44, iconY - 44, 88, 88, 16); ic.endFill(); o.addChild(ic);
        const it = hTxt(opt.iconText || "", 34, opt.accent); it.anchor.set(0.5); it.position.set(cx, iconY); o.addChild(it);
      }

      const vola = hTxt(opt.vola, 11, HUD.textLo, { weight: "400", align: "center" }); vola.anchor.set(0.5); vola.position.set(cx, top + 228); o.addChild(vola);
      const price = hTxt(opt.price, 22, HUD.textHi, { align: "center" }); price.anchor.set(0.5); price.position.set(cx, top + 258); o.addChild(price);

      const bw = w - 36, bh = 48, bx = cx - bw / 2, by = top + h - 28 - bh;
      o.addChild(hGreen(bx, by, bw, bh, opt.btn, opt.onTap));
    }

    // --- Bonus-Bestätigungs-Dialog (BACK / OK) — Figma activate/buy-second-step ---
    _confirmBuy(scatters, cost) {
      this._confirmDialog("BONUS BUY", LF.money(cost) + "\nwill be deducted from your balance", () => this.onBuyFeature(scatters));
    }
    _confirmBoost() {
      if (this._buyState && this._buyState.boostActive) { this.onToggleBoost(); return; }
      this._confirmDialog("BONUS BOOST FEATURESPINS™", "When this feature is activated, each spin uses special game rules that may improve bonus potential. The feature remains active until it is manually disabled.", () => this.onToggleBoost());
    }
    _confirmDialog(title, body, onOk) {
      const o = this.overlay, W = C.DESIGN_W, H = C.DESIGN_H, cx = W / 2, cy = H / 2;
      const layer = new PIXI.Container(); o.addChild(layer);
      const dim = new PIXI.Graphics(); dim.beginFill(0x000000, 0.55); dim.drawRect(0, 0, W, H); dim.endFill(); dim.eventMode = "static"; layer.addChild(dim);
      const pw = 300, ph = 282, px = cx - pw / 2, py = cy - ph / 2;
      const card = new PIXI.Graphics();
      card.beginFill(0xffffff, 0.10); card.drawRoundedRect(px, py, pw, ph, 14); card.endFill();
      card.lineStyle(1.5, 0xffffff, 0.20); card.drawRoundedRect(px, py, pw, ph, 14);
      card.eventMode = "static"; layer.addChild(card);
      const t = hTxt(title, 16, HUD.textHi, { italic: true, align: "center", wrap: pw - 36 }); t.anchor.set(0.5, 0); t.position.set(cx, py + 26); layer.addChild(t);
      const b = hTxt(body, 13, HUD.textMid, { weight: "400", align: "center", lh: 18, wrap: pw - 44 }); b.anchor.set(0.5, 0); b.position.set(cx, py + 74); layer.addChild(b);
      const bw = (pw - 36 - 12) / 2, bh = 46, by = py + ph - 22 - bh;
      layer.addChild(hDark(px + 18, by, bw, bh, "BACK", () => layer.destroy({ children: true })));
      layer.addChild(hGreen(px + 18 + bw + 12, by, bw, bh, "OK", () => { layer.destroy({ children: true }); onOk(); }));
    }

    // Feature-Ende-Screen -> Promise (löst nach Tap/Timeout)
    showFreeSpinsEnd(total) {
      return new Promise((resolve) => {
        const o = this.overlay;
        o.removeChildren();
        o.visible = true;

        const dim = new PIXI.Graphics();
        dim.beginFill(0x000000, 0.65); dim.drawRect(0, 0, C.DESIGN_W, C.DESIGN_H); dim.endFill();
        dim.eventMode = "static"; dim.cursor = "pointer";
        o.addChild(dim);

        const t1 = new PIXI.Text("FREE SPINS VORBEI", {
          fontFamily: "Arial Black, Arial", fontSize: 30, fontWeight: "900", fill: 0xffe27a,
        });
        t1.anchor.set(0.5); t1.position.set(C.DESIGN_W / 2, C.DESIGN_H / 2 - 40);
        o.addChild(t1);

        const t2 = new PIXI.Text("GESAMTGEWINN\n" + LF.money(total), {
          fontFamily: "Arial Black, Arial", fontSize: 34, fontWeight: "900",
          fill: 0xffffff, align: "center", lineHeight: 40, stroke: 0x402a00, strokeThickness: 5,
        });
        t2.anchor.set(0.5); t2.position.set(C.DESIGN_W / 2, C.DESIGN_H / 2 + 36);
        o.addChild(t2);

        const close = () => { o.visible = false; o.removeChildren(); resolve(); };
        dim.on("pointertap", close);
        LF.delay(3500).then(() => { if (o.visible) close(); });
      });
    }

    // Free-Games-Intro mit START-Button -> Promise (löst bei START)
    showFreeSpinsIntro(award) {
      return new Promise((resolve) => {
        const o = this.overlay;
        o.removeChildren(); o.visible = true;
        const cx = C.DESIGN_W / 2, cy = C.DESIGN_H / 2;

        const dim = new PIXI.Graphics();
        dim.beginFill(0x000000, 0.80); dim.drawRect(0, 0, C.DESIGN_W, C.DESIGN_H); dim.endFill();
        dim.eventMode = "static";
        o.addChild(dim);
        const scrim = this._radialScrim(720, 440, 0.5); scrim.position.set(cx, cy - 16); o.addChild(scrim);

        const t1 = new PIXI.Text("FREE SPINS", {
          fontFamily: "Arial Black, Arial", fontSize: 54, fontWeight: "900", fill: 0xffd54f, stroke: 0x2a0f1a, strokeThickness: 8,
        });
        t1.anchor.set(0.5); t1.position.set(cx, cy - 92); o.addChild(t1);

        const t2 = new PIXI.Text(award + " FREISPIELE", {
          fontFamily: "Arial Black, Arial", fontSize: 30, fontWeight: "900", fill: 0xffffff,
        });
        t2.anchor.set(0.5); t2.position.set(cx, cy - 32); o.addChild(t2);

        const bw = 248, bh = 68;
        const btn = rectButton(cx - bw / 2, cy + 28, bw, bh, () => {
          if (LF.sound) { LF.sound.unlock(); LF.sound.win(2); }
          o.visible = false; o.removeChildren(); resolve();
        });
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.25); bg.drawRoundedRect(-3, 5, bw + 6, bh, 16); bg.endFill();
        bg.beginFill(0x2e9e4a); bg.drawRoundedRect(0, 0, bw, bh, 16); bg.endFill();
        btn.addChild(bg);
        const bt = new PIXI.Text("START", {
          fontFamily: "Arial Black, Arial", fontSize: 26, fontWeight: "900", fill: 0xffffff, letterSpacing: 3,
        });
        bt.anchor.set(0.5); bt.position.set(bw / 2, bh / 2); btn.addChild(bt);
        btn.cursor = "pointer";
        btn.on("pointerover", () => (bg.alpha = 0.9)); btn.on("pointerout", () => (bg.alpha = 1));
        o.addChild(btn);
      });
    }

    /* =================== TICKER (Spin-Icon-Rotation) =================== */
    update(dt) {
      if (this._spinning) {
        this._spinIconRot += dt * 0.012;
        this.spinIcon.rotation = this._spinIconRot;
      }
      // Autoplay-Icon dreht dezent, wenn aktiv
    }

    // Grid soll ZWISCHEN Rahmen und Bar liegen -> Anker zurückgeben
    get frameLayer() { return this._frameUnder; }
  }

  LF.UI = UI;
})();
