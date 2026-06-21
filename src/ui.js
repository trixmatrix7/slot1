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
    cont.on("pointertap", onTap);
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

      this._spinIconRot = 0;
      this._spinning = false;

      this._buildFrame();
      // Logo-Platzhalter entfernt (kommt mit deinem echten Logo)
      this._buildTopBar();
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

    /* =================== TOP-BAR (Uhr + Titel + Provider-Logo) =================== */
    _buildTopBar() {
      // links: Uhr + Titel-Platzhalter
      this.clock = new PIXI.Text("00:00", {
        fontFamily: "Arial", fontSize: 16, fontWeight: "700", fill: 0xffffff,
      });
      this.clock.position.set(12, 8);
      this.root.addChild(this.clock);

      const title = new PIXI.Text("DEIN SPIEL", {
        fontFamily: "Arial", fontSize: 14, fontWeight: "600", fill: 0xdfeefa,
      });
      title.position.set(64, 9);
      this.root.addChild(title);

      const tick = () => {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        this.clock.text = hh + ":" + mm;
      };
      tick();
      setInterval(tick, 10000);

      // rechts oben: Provider-Logo-Platzhalter (neutral)
      const badge = new PIXI.Container();
      badge.position.set(C.DESIGN_W - 38, 26);
      const bg = new PIXI.Graphics();
      bg.beginFill(0x10171d, 0.9);
      bg.drawRoundedRect(-22, -18, 44, 36, 8);
      bg.endFill();
      badge.addChild(bg);
      const bt = new PIXI.Text("▣", {
        fontFamily: "Arial", fontSize: 22, fontWeight: "900", fill: 0xffffff,
      });
      bt.anchor.set(0.5);
      badge.addChild(bt);
      this.root.addChild(badge);
    }

    /* =================== BOTTOM CONTROL-BAR (1:1 nachgebaut) =================== */
    _buildBottomBar() {
      const W = C.DESIGN_W, H = C.DESIGN_H;
      const bar = new PIXI.Container();
      this.root.addChild(bar);

      // --- Maße (am Original ausgemessen, 1200x675-Raum) ---
      const BAR_H = 90;          // Höhe der dunklen Leiste
      const yMid = H - 53;       // vertikale Mitte der Controls (~622)
      const X = {
        buy: 203, burger: 300, balance: 330,
        bet: 676, betArrows: 788, spin: 851, auto: 917,
      };

      // --- Control-Bar: definierte schwarze Box (leicht transparent) ---
      // kurzer Verlauf als weicher oberer Übergang ...
      const fade = this._vGradientSprite(W, 22, [
        [0.0, "rgba(0,0,0,0.0)"],
        [1.0, "rgba(0,0,0,0.55)"],
      ]);
      fade.position.set(0, H - BAR_H);
      bar.addChild(fade);
      // ... darunter die eigentliche schwarze Box
      const box = new PIXI.Graphics();
      box.beginFill(0x000000, 0.55);
      box.drawRect(0, H - BAR_H + 20, W, BAR_H - 20);
      box.endFill();
      // dünne hellere Oberkante
      box.beginFill(0xffffff, 0.06);
      box.drawRect(0, H - BAR_H + 20, W, 2);
      box.endFill();
      bar.addChild(box);

      /* --- Bonus-Kauf (goldener Münz-Button) --- */
      const buy = roundButton(
        X.buy, yMid, 40,
        (g) => {
          g.beginFill(0x000000, 0.28); g.drawEllipse(0, 8, 40, 14); g.endFill(); // Schatten
          g.beginFill(0x6e3f00); g.drawCircle(0, 4, 40); g.endFill();            // dunkle Kante
          g.beginFill(0xb9850c); g.drawCircle(0, 0, 40); g.endFill();            // Gold-Ring
          g.beginFill(0xf4c42a); g.drawCircle(0, 0, 34); g.endFill();            // Gold-Fläche
          g.beginFill(0xffe27a, 0.55); g.drawEllipse(0, -13, 24, 12); g.endFill(); // Glanz
        },
        () => this.onBuy()
      );
      const buyT = new PIXI.Text("BONUS\nKAUFEN", {
        fontFamily: "Arial Black, Arial", fontSize: 13, fontWeight: "900",
        fill: 0x5a3200, align: "center", lineHeight: 14, letterSpacing: 0.3,
      });
      buyT.anchor.set(0.5);
      buy.addChild(buyT);
      bar.addChild(buy);

      /* --- Hamburger-Menü --- */
      const burger = roundButton(
        X.burger, yMid, 22,
        (g) => {
          g.lineStyle({ width: 4.5, color: 0xe8edf0, alpha: 0.96, cap: "round" });
          for (let i = -1; i <= 1; i++) { g.moveTo(-15, i * 9); g.lineTo(15, i * 9); }
        },
        () => this.onMenu()
      );
      bar.addChild(burger);

      /* --- GUTHABEN --- */
      const balLabel = new PIXI.Text("GUTHABEN", {
        fontFamily: "Arial", fontSize: 13, fontWeight: "700", fill: COL.sub, letterSpacing: 1.2,
      });
      balLabel.position.set(X.balance, yMid - 21);
      bar.addChild(balLabel);

      this.balanceText = new PIXI.Text("0,00$", {
        fontFamily: "Arial Black, Arial", fontSize: 27, fontWeight: "900", fill: 0xffffff,
      });
      this.balanceText.position.set(X.balance, yMid - 4);
      bar.addChild(this.balanceText);

      /* --- EINSATZ --- */
      const betLabel = new PIXI.Text("EINSATZ", {
        fontFamily: "Arial", fontSize: 13, fontWeight: "700", fill: COL.sub, letterSpacing: 1.2,
      });
      betLabel.position.set(X.bet, yMid - 21);
      bar.addChild(betLabel);

      // Boost-Anzeige (sichtbar wenn 3×-Boost aktiv)
      this.boostBadge = new PIXI.Container();
      const bbg = new PIXI.Graphics();
      bbg.beginFill(0xe5208c); bbg.drawRoundedRect(0, 0, 64, 16, 8); bbg.endFill();
      this.boostBadge.addChild(bbg);
      const bbt = new PIXI.Text("3× BOOST", {
        fontFamily: "Arial Black, Arial", fontSize: 10, fontWeight: "900", fill: 0xffffff,
      });
      bbt.anchor.set(0.5); bbt.position.set(32, 8);
      this.boostBadge.addChild(bbt);
      this.boostBadge.position.set(X.bet + 68, yMid - 22);
      this.boostBadge.visible = false;
      bar.addChild(this.boostBadge);

      this.betText = new PIXI.Text("0,20$", {
        fontFamily: "Arial Black, Arial", fontSize: 27, fontWeight: "900", fill: 0xffffff,
      });
      this.betText.position.set(X.bet, yMid - 4);
      bar.addChild(this.betText);

      // schlanke Chevron-Pfeile (rauf/runter) rechts neben EINSATZ
      const chevron = (cy, up, onTap) =>
        roundButton(X.betArrows, cy, 16,
          (g) => {
            g.lineStyle({ width: 4, color: 0xffffff, alpha: 0.95, cap: "round", join: "round" });
            if (up) { g.moveTo(-9, 4); g.lineTo(0, -5); g.lineTo(9, 4); }
            else { g.moveTo(-9, -4); g.lineTo(0, 5); g.lineTo(9, -4); }
          }, onTap);
      bar.addChild(chevron(yMid - 13, true, () => this.onBet(+1)));
      bar.addChild(chevron(yMid + 13, false, () => this.onBet(-1)));

      /* --- SPIN (groß, weiß, grauer Ring, Doppelpfeil) --- */
      const spinR = 43;
      this.spinBtn = roundButton(
        X.spin, yMid, spinR,
        (g) => {
          g.beginFill(0x000000, 0.25); g.drawCircle(0, 6, spinR); g.endFill();   // Schatten
          g.beginFill(0x3c4248); g.drawCircle(0, 0, spinR); g.endFill();          // grauer Ring
          g.beginFill(0xffffff); g.drawCircle(0, 0, spinR - 6); g.endFill();      // weiße Fläche
        },
        () => { if (!this._spinning) this.onSpin(); }
      );
      this.spinIcon = new PIXI.Graphics();
      this._drawRefreshIcon(this.spinIcon, 21, 0x20262b, 4.2);
      this.spinBtn.addChild(this.spinIcon);
      bar.addChild(this.spinBtn);

      /* --- AUTOPLAY (kreisende Pfeile) --- */
      this.autoBtn = roundButton(
        X.auto, yMid, 21,
        (g) => {
          g.lineStyle(2.5, 0x3a4148, 1); g.beginFill(0x161c22, 0.9);
          g.drawCircle(0, 0, 21); g.endFill();
        },
        () => this.onAutoplay()
      );
      this.autoIcon = new PIXI.Graphics();
      this._drawRefreshIcon(this.autoIcon, 12, 0xeef3f6, 2.6);
      this.autoBtn.addChild(this.autoIcon);
      bar.addChild(this.autoBtn);
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
    }

    /* =================== PUBLIC API (vom Engine genutzt) =================== */
    setBalance(v) { this.balanceText.text = LF.money(v); }
    setBet(v) { this.betText.text = LF.money(v); }

    setWin(v) {
      if (v > 0) {
        this.winBanner.text = "GEWINN  " + LF.money(v);
        this.winBanner.visible = true;
      } else {
        this.winBanner.visible = false;
      }
    }

    setSpinning(on) {
      this._spinning = on;
      this.spinBtn.alpha = on ? 0.6 : 1;
    }

    setAutoplay(on) {
      this.autoBtn.children[0].tint = on ? 0x2e7d32 : 0xffffff;
      this.autoIcon.tint = on ? 0x9ccc4a : 0xffffff;
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

    // Buy-Menü mit 3 Cards (3 Scatter / 4 Scatter / Boost)
    openBuyMenu(state) {
      this._buyState = state;
      this._renderBuyMenu();
    }

    _renderBuyMenu() {
      const s = this._buyState; if (!s) return;
      const o = this.overlay;
      o.removeChildren(); o.visible = true;
      const W = C.DESIGN_W, H = C.DESIGN_H, cx = W / 2, cy = H / 2;

      const dim = new PIXI.Graphics();
      dim.beginFill(0x000000, 0.72); dim.drawRect(0, 0, W, H); dim.endFill();
      dim.eventMode = "static";
      o.addChild(dim);

      const pw = 880, ph = 410;
      const panel = new PIXI.Graphics();
      panel.lineStyle(3, 0xffffff, 0.12);
      panel.beginFill(0x12181e, 0.98);
      panel.drawRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 20);
      panel.endFill();
      o.addChild(panel);

      const title = new PIXI.Text("FEATURE KAUFEN", {
        fontFamily: "Arial Black, Arial", fontSize: 26, fontWeight: "900", fill: 0xffffff,
      });
      title.anchor.set(0.5); title.position.set(cx, cy - ph / 2 + 34); o.addChild(title);

      const close = roundButton(cx + pw / 2 - 26, cy - ph / 2 + 26, 18,
        (g) => {
          g.beginFill(0x2a3138); g.drawCircle(0, 0, 18); g.endFill();
          g.lineStyle({ width: 3, color: 0xffffff, cap: "round" });
          g.moveTo(-6, -6); g.lineTo(6, 6); g.moveTo(6, -6); g.lineTo(-6, 6);
        },
        () => this.closeBuyMenu());
      o.addChild(close);

      // labeled rect button
      const mkBtn = (bx, by, bw, bh, label, color, onTap) => {
        const c = rectButton(bx - bw / 2, by - bh / 2, bw, bh, onTap);
        const g = new PIXI.Graphics();
        g.beginFill(color); g.drawRoundedRect(0, 0, bw, bh, 10); g.endFill();
        c.addChild(g);
        const t = new PIXI.Text(label, {
          fontFamily: "Arial Black, Arial", fontSize: 15, fontWeight: "900", fill: 0xffffff,
          align: "center", lineHeight: 17,
        });
        t.anchor.set(0.5); t.position.set(bw / 2, bh / 2); c.addChild(t);
        c.cursor = "pointer";
        c.on("pointerover", () => (g.alpha = 0.85));
        c.on("pointerout", () => (g.alpha = 1));
        return c;
      };

      const cardW = 250, cardH = 290, gap = 20;
      const totalW = cardW * 3 + gap * 2;
      const startX = cx - totalW / 2;
      const cardTop = cy - ph / 2 + 64;
      const centers = [0, 1, 2].map((i) => startX + cardW / 2 + i * (cardW + gap));

      const drawCard = (cxc, accent) => {
        const card = new PIXI.Graphics();
        card.lineStyle(2.5, accent, 0.9);
        card.beginFill(0x1b2530, 1);
        card.drawRoundedRect(cxc - cardW / 2, cardTop, cardW, cardH, 14);
        card.endFill();
        o.addChild(card);
      };

      const f3 = s.features[3], f4 = s.features[4];
      const spins3 = C.FREESPINS.trigger[3] || 10, spins4 = C.FREESPINS.trigger[4] || 15;

      drawCard(centers[0], 0xff7a2f);
      this._cardContent(centers[0], cardTop, cardH, "3 SCATTER", spins3 + " FREISPIELE", "Standard-Feature", 0xff7a2f);
      o.addChild(mkBtn(centers[0], cardTop + cardH - 34, cardW - 40, 44, "KAUFEN\n" + LF.money(f3.cost * s.bet), 0x2e9e4a, () => this.onBuyFeature(3)));

      drawCard(centers[1], 0xffd54f);
      this._cardContent(centers[1], cardTop, cardH, "4 SCATTER", spins4 + " FREISPIELE", "Mehr Spins", 0xffd54f);
      o.addChild(mkBtn(centers[1], cardTop + cardH - 34, cardW - 40, 44, "KAUFEN\n" + LF.money(f4.cost * s.bet), 0x2e9e4a, () => this.onBuyFeature(4)));

      drawCard(centers[2], 0xe5208c);
      this._cardContent(centers[2], cardTop, cardH, "BOOST", "3× SCATTER-CHANCE", "Einsatz ×3 pro Spin", 0xe5208c);
      o.addChild(mkBtn(centers[2], cardTop + cardH - 34, cardW - 40, 44, s.boostActive ? "AKTIV ✓" : "AKTIVIEREN", s.boostActive ? 0xe5208c : 0x3a4148, () => this.onToggleBoost()));
    }

    _cardContent(cxc, top, h, title, big, sub, accent) {
      const o = this.overlay;
      const t = new PIXI.Text(title, { fontFamily: "Arial Black, Arial", fontSize: 20, fontWeight: "900", fill: accent });
      t.anchor.set(0.5); t.position.set(cxc, top + 36); o.addChild(t);
      const b = new PIXI.Text(big, { fontFamily: "Arial Black, Arial", fontSize: 18, fontWeight: "900", fill: 0xffffff, align: "center" });
      b.anchor.set(0.5); b.position.set(cxc, top + h / 2 - 14); o.addChild(b);
      const sb = new PIXI.Text(sub, { fontFamily: "Arial", fontSize: 13, fill: 0xbcd0c2, align: "center" });
      sb.anchor.set(0.5); sb.position.set(cxc, top + h / 2 + 16); o.addChild(sb);
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
