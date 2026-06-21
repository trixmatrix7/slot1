/* ============================================================
   INTRO — Loading-Screen (Provider + Ladebalken) -> Splash
   (Feature-Cards + "Klicken zum Fortfahren") -> Klick -> Ingame.
   Deine finalen Intro-Artworks ersetzen hier die Platzhalter.
   ============================================================ */
(function () {
  const LF = (window.LF = window.LF || {});
  const C = LF.CONFIG;

  const PROVIDER = "CHAIN GAMES";
  const GAME_TITLE = "DEIN SLOT-LOGO";

  class Intro {
    constructor(app) {
      this.app = app;
      this.layer = new PIXI.Container();
      app.stage.addChild(this.layer);
      this._buildLoading();
      this._buildSplash();
    }

    _fullBg(parent) {
      const g = new PIXI.Graphics();
      g.beginFill(0x0a0d12, 1); g.drawRect(0, 0, C.DESIGN_W, C.DESIGN_H); g.endFill();
      g.beginFill(0x14304a, 0.35); g.drawEllipse(C.DESIGN_W / 2, C.DESIGN_H / 2, 520, 300); g.endFill();
      g.eventMode = "static";
      parent.addChild(g);
      return g;
    }

    _buildLoading() {
      this.loading = new PIXI.Container();
      this.layer.addChild(this.loading);
      this._fullBg(this.loading);

      const prov = new PIXI.Text(PROVIDER, {
        fontFamily: "Arial Black, Arial", fontSize: 40, fontWeight: "900", fill: 0xffffff, letterSpacing: 6,
      });
      prov.anchor.set(0.5); prov.position.set(C.DESIGN_W / 2, 250); this.loading.addChild(prov);

      const title = new PIXI.Text(GAME_TITLE, {
        fontFamily: "Arial Black, Arial", fontSize: 20, fontWeight: "900", fill: 0x7fa8d0, letterSpacing: 3,
      });
      title.anchor.set(0.5); title.position.set(C.DESIGN_W / 2, 312); this.loading.addChild(title);

      const bw = 520, bh = 16, bx = C.DESIGN_W / 2 - bw / 2, by = 420;
      const track = new PIXI.Graphics();
      track.beginFill(0x1d2530); track.drawRoundedRect(bx, by, bw, bh, 8); track.endFill();
      track.lineStyle(1, 0xffffff, 0.12); track.drawRoundedRect(bx, by, bw, bh, 8);
      this.loading.addChild(track);

      this._barX = bx + 2; this._barY = by + 2; this._barW = bw - 4; this._barH = bh - 4;
      this.barFill = new PIXI.Graphics();
      this.loading.addChild(this.barFill);
      this._drawBar(0);

      const lbl = new PIXI.Text("LÄDT …", {
        fontFamily: "Arial", fontSize: 14, fontWeight: "700", fill: 0x8fa0ad, letterSpacing: 2,
      });
      lbl.anchor.set(0.5); lbl.position.set(C.DESIGN_W / 2, 458); this.loading.addChild(lbl);
    }

    _drawBar(p) {
      this.barFill.clear();
      this.barFill.beginFill(0xf4c430);
      this.barFill.drawRoundedRect(this._barX, this._barY, Math.max(0, this._barW * p), this._barH, 6);
      this.barFill.endFill();
    }

    // Ladebalken smooth füllen (mind. ~1.6s "Lade-Feel")
    async playLoading() {
      const holder = { p: 0 };
      this.app.ticker.add(this._barTick = () => this._drawBar(holder.p));
      await LF.tween.to(holder, { p: 1 }, 1600, LF.ease.outQuad);
      this._drawBar(1);
      this.app.ticker.remove(this._barTick);
    }

    _buildSplash() {
      this.splash = new PIXI.Container();
      this.splash.visible = false;
      this.layer.addChild(this.splash);
      this._fullBg(this.splash);

      const title = new PIXI.Text(PROVIDER, {
        fontFamily: "Arial Black, Arial", fontSize: 38, fontWeight: "900", fill: 0xffffff, letterSpacing: 5,
      });
      title.anchor.set(0.5); title.position.set(C.DESIGN_W / 2, 96); this.splash.addChild(title);

      const vola = new PIXI.Text("VOLATILITÄT  ★ ★ ★ ★ ★", {
        fontFamily: "Arial", fontSize: 15, fontWeight: "700", fill: 0xff6a6a, letterSpacing: 2,
      });
      vola.anchor.set(0.5); vola.position.set(C.DESIGN_W / 2, 142); this.splash.addChild(vola);

      // 3 Feature-Cards (Platzhalter)
      const cards = [
        { t: "TUMBLE", d: "Gewinne fallen,\nneue Symbole rutschen nach.", a: 0x2bb3c0 },
        { t: "FREE SPINS", d: "3 / 4 Scatter →\nFreispiele mit\nwachsendem Multiplikator.", a: 0xff7a2f },
        { t: "MAX WIN", d: "Bis zu\n10.000× Einsatz.", a: 0xf4c430 },
      ];
      const cw = 280, ch = 230, gap = 26, top = 190;
      const totalW = cw * 3 + gap * 2, sx = C.DESIGN_W / 2 - totalW / 2;
      cards.forEach((card, i) => {
        const cxc = sx + cw / 2 + i * (cw + gap);
        const g = new PIXI.Graphics();
        g.beginFill(0x121a22, 0.92); g.drawRoundedRect(cxc - cw / 2, top, cw, ch, 14); g.endFill();
        g.lineStyle(2, card.a, 0.8); g.drawRoundedRect(cxc - cw / 2, top, cw, ch, 14);
        this.splash.addChild(g);
        const ic = new PIXI.Graphics();
        ic.lineStyle(3, card.a, 1); ic.beginFill(card.a, 0.16); ic.drawRoundedRect(cxc - 34, top + 22, 68, 68, 12); ic.endFill();
        this.splash.addChild(ic);
        const t = new PIXI.Text(card.t, { fontFamily: "Arial Black, Arial", fontSize: 22, fontWeight: "900", fill: card.a });
        t.anchor.set(0.5); t.position.set(cxc, top + 118); this.splash.addChild(t);
        const d = new PIXI.Text(card.d, { fontFamily: "Arial", fontSize: 13, fill: 0xc2cdd6, align: "center", lineHeight: 18 });
        d.anchor.set(0.5); d.position.set(cxc, top + 168); this.splash.addChild(d);
      });

      this.clickHint = new PIXI.Text("KLICKEN SIE, UM FORTZUFAHREN", {
        fontFamily: "Arial Black, Arial", fontSize: 22, fontWeight: "900", fill: 0xffffff, letterSpacing: 2,
      });
      this.clickHint.anchor.set(0.5); this.clickHint.position.set(C.DESIGN_W / 2, 560);
      this.splash.addChild(this.clickHint);
    }

    showSplash() {
      this.loading.visible = false;
      this.splash.visible = true;
      // pulsierender Hinweis
      const pulse = () => {
        LF.tween.to(this.clickHint, { alpha: 0.4 }, 600, LF.ease.outQuad)
          .then(() => LF.tween.to(this.clickHint, { alpha: 1 }, 600, LF.ease.outQuad).then(() => { if (this.splash.visible) pulse(); }));
      };
      pulse();
      return new Promise((resolve) => {
        this.splash.eventMode = "static";
        this.splash.cursor = "pointer";
        this.splash.once("pointertap", () => { if (LF.sound) LF.sound.unlock(); resolve(); });
      });
    }

    async finish() {
      await LF.tween.to(this.layer, { alpha: 0 }, 350, LF.ease.inQuad);
      if (this.layer.parent) this.layer.parent.removeChild(this.layer);
      this.layer.destroy({ children: true });
    }

    showError(msg) {
      this.loading.visible = true; this.splash.visible = false;
      const t = new PIXI.Text(msg, { fontFamily: "Arial", fontSize: 16, fill: 0xff7a7a, align: "center" });
      t.anchor.set(0.5); t.position.set(C.DESIGN_W / 2, 500); this.loading.addChild(t);
    }
  }

  LF.Intro = Intro;
})();
