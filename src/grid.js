/* ============================================================
   GRID — SymbolSprite (Platzhalter-Kachel) + Grid (6×5, Tumble-Logik).
   ============================================================ */
(function () {
  const LF = (window.LF = window.LF || {});
  const C = LF.CONFIG;

  /* ---- gecachte Win-Texturen (warmes Glow-Flare + Schockwellen-Ring) ---- */
  let _glowTex = null, _ringTex = null;
  function glowTex() {
    if (_glowTex) return _glowTex;
    const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,208,112,0.92)");
    g.addColorStop(0.4, "rgba(255,168,66,0.46)");
    g.addColorStop(0.75, "rgba(238,134,44,0.14)");
    g.addColorStop(1, "rgba(238,134,44,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    _glowTex = PIXI.Texture.from(cv); return _glowTex;
  }
  function ringTex() {
    if (_ringTex) return _ringTex;
    const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.30, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, "rgba(255,240,200,0)");
    g.addColorStop(0.55, "rgba(255,236,186,0.95)");
    g.addColorStop(1, "rgba(255,236,186,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    _ringTex = PIXI.Texture.from(cv); return _ringTex;
  }
  // dunkler Spotlight-Backdrop: dimmt den hellen Reel-Hintergrund hinter dem Gewinn,
  // damit Symbol + warmes Glow "abheben" (additives Glow allein verschwindet auf Weiß).
  let _backTex = null;
  function backdropTex() {
    if (_backTex) return _backTex;
    const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(6,5,10,0.92)");
    g.addColorStop(0.55, "rgba(6,5,10,0.62)");
    g.addColorStop(1, "rgba(6,5,10,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    _backTex = PIXI.Texture.from(cv); return _backTex;
  }

  /* ------------------------------------------------------------
     SymbolSprite — eine Kachel.
     >>> HIER deine echten Sprites einsetzen <<<
     Aktuell: gerundetes Rechteck + Label (rein prozedural, lädt 0 Assets).
     Zum Ersetzen: in _draw() ein PIXI.Sprite(texture) statt Graphics nutzen.
  ------------------------------------------------------------ */
  class SymbolSprite extends PIXI.Container {
    constructor(def) {
      super();
      this.def = def;
      this._build();
      this.setSymbol(def);
    }

    _build() {
      const s = C.CELL;
      // Dunkler Spotlight-Backdrop GANZ HINTEN (dimmt den hellen Reel beim Win).
      this.backdrop = new PIXI.Sprite(backdropTex());
      this.backdrop.anchor.set(0.5);
      this.backdrop.position.set(s / 2, s / 2);
      this.backdrop.width = this.backdrop.height = s * 1.55;
      this.backdrop.alpha = 0;
      this.addChild(this.backdrop);

      // Glow-Flare HINTER dem Symbol (Win/Scatter-Tension). Additiv, normal unsichtbar.
      this.glow = new PIXI.Sprite(glowTex());
      this.glow.anchor.set(0.5);
      this.glow.position.set(s / 2, s / 2);
      this.glow.blendMode = PIXI.BLEND_MODES.ADD;
      this.glow.width = this.glow.height = s * 1.75;
      this.glow.alpha = 0;
      this.addChild(this.glow);

      // Symbol-Bild (füllt die Kachel; Texturen sind quadratisch).
      this.sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
      this.sprite.anchor.set(0.5);
      this.sprite.position.set(s / 2, s / 2);
      this.sprite.width = s;
      this.sprite.height = s;
      this.sprite.roundPixels = true;     // ganzzahlige Geräte-Pixel -> kein Subpixel-Flimmern
      this.addChild(this.sprite);

      // Flash ÜBER dem Symbol (leuchtet beim Win additiv auf). Gleiche Textur wie sprite.
      this.flash = new PIXI.Sprite(PIXI.Texture.EMPTY);
      this.flash.anchor.set(0.5);
      this.flash.position.set(s / 2, s / 2);
      this.flash.blendMode = PIXI.BLEND_MODES.ADD;
      this.flash.alpha = 0;
      this.addChild(this.flash);

      // Overlay-Sprite für Animationen (Landing/Win). Liegt über dem statischen
      // Symbol; während eine Anim läuft, wird das statische Symbol ausgeblendet.
      this.anim = new PIXI.Sprite(PIXI.Texture.EMPTY);
      this.anim.anchor.set(0.5);
      this.anim.position.set(s / 2, s / 2);
      this.anim.visible = false;
      this.anim.roundPixels = true;       // dito für die Animation (verhindert Shimmer/Shake)
      this.addChild(this.anim);

      // Fallback-Label, falls eine Textur (noch) fehlt.
      this.label = new PIXI.Text("", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 18, fontWeight: "900", fill: 0xffffff,
        stroke: 0x1a1a1a, strokeThickness: 4, align: "center",
      });
      this.label.anchor.set(0.5);
      this.label.position.set(s / 2, s / 2);
      this.label.visible = false;
      this.addChild(this.label);

      this._cx = s / 2;
      this._cy = s / 2;
      this._dead = false;
      this._animDriver = null;
    }

    // Eigene Anim-Defs dieses Symbols (oder null).
    _anims() { return (LF.symbolAnims && LF.symbolAnims[this.def.id]) || null; }

    // Grundgröße (× Zelle) dieses Symbols: Scatter 1.34, sonst per Art-Skala.
    _baseScale() {
      if (this.def.kind === "scatter") return 1.34;
      return (C.SYMBOL_SCALE && C.SYMBOL_SCALE[this.def.kind]) || 1;
    }

    // Spielt eine Frame-Sequenz auf dem Overlay ab (statisches Symbol solange aus).
    // duration ms, sizeMul skaliert relativ zur Zelle, fade = ms Crossfade-In (0 = harter Cut).
    // Frame-Index läuft in GLEICHMÄSSIGEN Floor-Buckets über den Fortschritt -> keine
    // ungleichmäßigen Frame-Haltezeiten (das war die Haupt-Ursache fürs "shaky").
    _playFrames(frames, duration, sizeMul, fade) {
      if (!frames || !frames.length || this._dead) return Promise.resolve();
      if (this._animDriver) { LF.tween.killOf(this._animDriver); this._animDriver = null; }
      LF.tween.killOf(this.anim);          // evtl. laufende Fades stoppen
      const a = this.anim;
      const s = Math.round(C.CELL * (sizeMul || 1)); // ganzzahlig -> stabileres Sampling
      a.texture = frames[0];
      a.width = s; a.height = s;            // alle Frames gleich groß -> Scale bleibt konstant
      a.visible = true;
      const self = this;
      // Crossfade-In: statisches Symbol bleibt kurz sichtbar, Anim blendet sanft auf
      // (verdeckt den Posen-/Skalen-Sprung zwischen statischem Bild und erstem Anim-Frame).
      if (fade) {
        a.alpha = 0;
        LF.tween.to(a, { alpha: 1 }, fade, LF.ease.outQuad).then(() => { if (!self._dead) self.sprite.visible = false; });
      } else {
        a.alpha = 1;
        this.sprite.visible = false;
      }
      const total = frames.length;
      let _p = 0, cur = -1;
      const driver = {};
      Object.defineProperty(driver, "p", {
        configurable: true,
        get() { return _p; },
        set(v) {
          _p = v;
          if (self._dead) return;
          const idx = Math.min(total - 1, Math.floor(v * total)); // gleichmäßige Zeit-Buckets
          if (idx !== cur) { cur = idx; a.texture = frames[idx]; }
        },
      });
      this._animDriver = driver;
      return LF.tween.to(driver, { p: 1 }, duration, (t) => t).then(() => {
        if (self._animDriver === driver) {
          self._animDriver = null;
          if (self._dead) return;
          a.texture = frames[total - 1];   // letztes Frame garantiert zeigen
          a.alpha = 1;
          a.visible = false;
          self.sprite.visible = true;
        }
      });
    }

    // Landing-Animation beim Landen (fire-and-forget). Sheet -> Spritesheet,
    // sonst prozedurales Squash-&-Stretch (Aufprall-Impuls).
    playLanding() {
      if (this._dead) return;
      const an = this._anims();
      if (an && an.landing && this.def.kind !== "scatter") {
        this._playFrames(an.landing, C.TIMING.landingDur || 520, this._baseScale()); return;
      }
      this._squashLand();
    }

    // Squash beim Aufprall: kurz breit/flach -> Gegenschwung schmal/hoch -> Settle mit Overshoot.
    // Leichtes y-Dip verkauft den "auf den Boden geknallt"-Impuls.
    async _squashLand() {
      const b = this._spBase || 1, sp = this.sprite, s = C.CELL, sz = s * this._baseScale();
      LF.tween.killOf(sp.scale); LF.tween.killOf(sp.position);
      await Promise.all([
        LF.tween.to(sp.scale, { x: b * 1.18, y: b * 0.82 }, 70, LF.ease.outQuad),
        LF.tween.to(sp.position, { y: s / 2 + sz * 0.05 }, 70, LF.ease.outQuad),
      ]);
      if (this._dead) return;
      await Promise.all([
        LF.tween.to(sp.scale, { x: b * 0.92, y: b * 1.10 }, 95, LF.ease.outQuad),
        LF.tween.to(sp.position, { y: s / 2 - sz * 0.015 }, 95, LF.ease.outQuad),
      ]);
      if (this._dead) return;
      await Promise.all([
        LF.tween.to(sp.scale, { x: b, y: b }, 160, LF.ease.outBack),
        LF.tween.to(sp.position, { y: s / 2 }, 160, LF.ease.outBack),
      ]);
    }

    /* ---- Scatter-Spezial-Flow: Landing-Glow als Dauerschleife + Win-Burst ---- */
    // Loopt eine Frame-Sequenz bis stopAnimLoop() (für die Scatter-Tension).
    startAnimLoop(frames, cycleMs, sizeMul) {
      if (!frames || !frames.length || this._dead) return;
      this.stopAnimLoop(false);
      this._loopOn = true;
      const a = this.anim;
      const s = Math.round(C.CELL * (sizeMul || 1));
      a.texture = frames[0]; a.width = s; a.height = s; a.alpha = 1; a.visible = true;
      this.sprite.visible = false;
      const total = frames.length, self = this;
      let _p = 0;
      const driver = {};
      Object.defineProperty(driver, "p", {
        configurable: true,
        get() { return _p; },
        set(v) { _p = v; if (self._dead) return; a.texture = frames[Math.min(total - 1, Math.floor((v % 1) * total))]; },
      });
      this._loopDriver = driver;
      const cycle = () => {
        if (!self._loopOn || self._dead) return;
        _p = 0;
        LF.tween.to(driver, { p: 1 }, cycleMs, (t) => t).then(() => { if (self._loopOn && !self._dead) cycle(); });
      };
      cycle();
    }
    stopAnimLoop(restoreStatic = true) {
      this._loopOn = false;
      if (this._loopDriver) { LF.tween.killOf(this._loopDriver); this._loopDriver = null; }
      if (restoreStatic && !this._dead) { this.anim.visible = false; this.sprite.visible = true; }
    }
    // Scatter-Win-Burst (einmalig). Beendet einen evtl. laufenden Glow-Loop.
    async playScatterWin() {
      this.stopAnimLoop(false);
      const an = this._anims();
      if (an && an.win) await this._playFrames(an.win, C.TIMING.winHighlight, 1.5);
      else { this.anim.visible = false; this.sprite.visible = true; }
    }

    destroy(opts) {
      this._dead = true;
      this._loopOn = false;
      this._pulseOn = false;
      if (this._loopDriver) { LF.tween.killOf(this._loopDriver); this._loopDriver = null; }
      if (this._animDriver) { LF.tween.killOf(this._animDriver); this._animDriver = null; }
      LF.tween.killOf(this.anim);
      LF.tween.killOf(this.sprite); LF.tween.killOf(this.sprite.scale); LF.tween.killOf(this.sprite.position);
      LF.tween.killOf(this.glow); LF.tween.killOf(this.flash); LF.tween.killOf(this.flash.scale); LF.tween.killOf(this.backdrop);
      super.destroy(opts);
    }

    setSymbol(def) {
      this.def = def;
      const s = C.CELL;
      const tex = (LF.textures && LF.textures[def.id]) || null;
      if (tex) {
        this.sprite.texture = tex;
        this.sprite.visible = true;
        // Grundgröße je Art: Non-Premium (royals) kleiner, Scatter größer (überlappt).
        const size = s * this._baseScale();
        this.sprite.width = size;
        this.sprite.height = size;
        this.sprite.rotation = 0;
        this.sprite.position.set(s / 2, s / 2);
        this._spBase = this.sprite.scale.x; // Basis-Skalierung für Squash/Pop merken
        this.label.visible = false;
      } else {
        // Textur fehlt -> Platzhalter-Text (z.B. wenn über file:// geöffnet)
        this.sprite.visible = false;
        this.label.visible = true;
        this.label.text = def.label;
      }
    }

    // Gewinn-Hervorhebung: Win-Spritesheet (falls vorhanden) ODER prozedurale Juice.
    async playWin() {
      if (this._dead) return;
      const an = this._anims();
      if (an && an.win) {
        await this._playFrames(an.win, C.TIMING.winHighlight, this.def.kind === "scatter" ? 1.5 : this._baseScale(), 80);
        return;
      }
      await this._juiceWin();
    }

    // Prozedurale Win-Juice: Anticipations-Dip -> Pop (Overshoot) + Glow-Flare +
    // Schockwellen-Ring + additiver Flash + leichter Rotations-Wobble. Premiums knalliger.
    async _juiceWin() {
      if (this._dead) return;
      const b = this._spBase || 1, sp = this.sprite, s = C.CELL, k = this.def.kind;
      // Pop-Stärke (Win-Intensität ~30% reduziert: Aufschlag über 1.0 × 0.7).
      const pop = k === "scatter" ? 1.32 : k === "wild" ? 1.29 : k === "high" ? 1.28 : k === "mid" ? 1.24 : 1.18;
      LF.tween.killOf(sp.scale); LF.tween.killOf(sp); LF.tween.killOf(this.flash); LF.tween.killOf(this.flash.scale); LF.tween.killOf(this.glow); LF.tween.killOf(this.backdrop);

      // Flash = gleiche Textur, additiv, warm getönt — "Symbol leuchtet auf".
      this.flash.texture = sp.texture; this.flash.tint = 0xfff0cf; this.flash.scale.set(b); this.flash.rotation = 0; this.flash.alpha = 0;
      this.glow.alpha = 0; this.backdrop.alpha = 0;
      // Schockwellen-Ring (expandiert + fadet) — vor das Glow legen.
      const ring = new PIXI.Sprite(ringTex());
      ring.anchor.set(0.5); ring.position.set(s / 2, s / 2); ring.blendMode = PIXI.BLEND_MODES.ADD;
      ring.width = ring.height = s * 0.85; ring.alpha = 0.66;
      this.addChildAt(ring, 0);

      // 1) Anticipations-Dip
      await LF.tween.to(sp.scale, { x: b * 0.88, y: b * 0.88 }, 85, LF.ease.outQuad);
      if (this._dead) { if (ring.parent) ring.parent.removeChild(ring); ring.destroy(); return; }

      // 2) Pop + Flare + Ring + Wobble (Intensität ~30% reduziert)
      const wob = LF.tween.to(sp, { rotation: 0.05 }, 110, LF.ease.outQuad)
        .then(() => this._dead || LF.tween.to(sp, { rotation: -0.03 }, 95, LF.ease.outQuad))
        .then(() => this._dead || LF.tween.to(sp, { rotation: 0 }, 80, LF.ease.outQuad));
      await Promise.all([
        LF.tween.to(sp.scale, { x: b * pop, y: b * pop }, 210, LF.ease.outBack),
        LF.tween.to(this.flash.scale, { x: b * pop, y: b * pop }, 210, LF.ease.outBack),
        LF.tween.to(this.backdrop, { alpha: 0.57 }, 130, LF.ease.outQuad),
        LF.tween.to(this.glow, { alpha: 0.5 }, 150, LF.ease.outQuad),
        LF.tween.to(this.flash, { alpha: 0.49 }, 90, LF.ease.outQuad),
        LF.tween.to(ring.scale, { x: 1.95, y: 1.95 }, 330, LF.ease.outQuad),
        LF.tween.to(ring, { alpha: 0 }, 330, LF.ease.outQuad),
        wob,
      ]);
      if (ring.parent) ring.parent.removeChild(ring); ring.destroy();
      if (this._dead) return;

      // 3) Settle leicht vergrößert + glühend (das Removal burstet danach weiter)
      await Promise.all([
        LF.tween.to(sp.scale, { x: b * 1.08, y: b * 1.08 }, 120, LF.ease.outQuad),
        LF.tween.to(this.flash, { alpha: 0 }, 150, LF.ease.outQuad),
        LF.tween.to(this.glow, { alpha: 0.29 }, 120, LF.ease.outQuad),
        LF.tween.to(this.backdrop, { alpha: 0.43 }, 120, LF.ease.outQuad),
      ]);
    }

    // Scatter-Burst (Scatter bleibt liegen) -> Juice + danach zurück auf normal.
    async scatterBurst() {
      await this._juiceWin();
      if (this._dead) return;
      const b = this._spBase || 1;
      await Promise.all([
        LF.tween.to(this.sprite.scale, { x: b, y: b }, 220, LF.ease.outQuad),
        LF.tween.to(this.glow, { alpha: 0 }, 220, LF.ease.outQuad),
        LF.tween.to(this.backdrop, { alpha: 0 }, 220, LF.ease.outQuad),
      ]);
    }

    // Sanfter Dauer-Puls + Glow (Scatter-Tension, wenn 2+ Scatter gelandet sind).
    startGlowPulse() {
      if (this._dead || this._pulseOn) return;
      this._pulseOn = true;
      this._doPulse();
    }
    _doPulse() {
      if (!this._pulseOn || this._dead) return;
      const b = this._spBase || 1, sp = this.sprite;
      Promise.all([
        LF.tween.to(sp.scale, { x: b * 1.12, y: b * 1.12 }, 340, LF.ease.outQuad),
        LF.tween.to(this.glow, { alpha: 0.85 }, 340, LF.ease.outQuad),
        LF.tween.to(this.backdrop, { alpha: 0.5 }, 340, LF.ease.outQuad),
      ]).then(() => {
        if (!this._pulseOn || this._dead) return null;
        return Promise.all([
          LF.tween.to(sp.scale, { x: b, y: b }, 340, LF.ease.outQuad),
          LF.tween.to(this.glow, { alpha: 0.34 }, 340, LF.ease.outQuad),
          LF.tween.to(this.backdrop, { alpha: 0.25 }, 340, LF.ease.outQuad),
        ]);
      }).then(() => { if (this._pulseOn && !this._dead) this._doPulse(); });
    }
    stopGlowPulse() {
      this._pulseOn = false;
      if (this._dead) return;
      const b = this._spBase || 1;
      LF.tween.killOf(this.sprite.scale); LF.tween.killOf(this.glow); LF.tween.killOf(this.backdrop);
      LF.tween.to(this.sprite.scale, { x: b, y: b }, 200, LF.ease.outQuad);
      LF.tween.to(this.glow, { alpha: 0 }, 200, LF.ease.outQuad);
      LF.tween.to(this.backdrop, { alpha: 0 }, 200, LF.ease.outQuad);
    }

    // Removal-Burst: kurz größer "knallen", dann mit Drall implodieren + ausfaden.
    async fadeOut() {
      if (this._dead) return;
      const b = this._spBase || 1, sp = this.sprite;
      LF.tween.killOf(sp.scale); LF.tween.killOf(sp);
      this.glow.alpha = Math.max(this.glow.alpha, 0.35);
      LF.tween.to(this.glow, { alpha: 0 }, 230, LF.ease.outQuad);
      LF.tween.to(this.backdrop, { alpha: 0 }, 200, LF.ease.outQuad);
      await LF.tween.to(sp.scale, { x: b * 1.32, y: b * 1.32 }, 90, LF.ease.outQuad);
      if (this._dead) return;
      await Promise.all([
        LF.tween.to(this, { alpha: 0 }, 165, LF.ease.inQuad),
        LF.tween.to(sp.scale, { x: b * 0.14, y: b * 0.14 }, 165, LF.ease.inQuad),
        LF.tween.to(sp, { rotation: sp.rotation + 0.6 }, 165, LF.ease.inQuad),
      ]);
    }
  }
  LF.SymbolSprite = SymbolSprite;

  /* ------------------------------------------------------------
     Grid — 6×5 Matrix aus SymbolSprite, plus Tumble.
     cells[col][row]  (row 0 = oben)
  ------------------------------------------------------------ */
  class Grid extends PIXI.Container {
    constructor(rng) {
      super();
      this.rng = rng;
      this.cells = [];
      // Nachschub-Pool OHNE Scatter (Scatter nur beim initialen Drop).
      this._paySymbols = C.SYMBOLS.filter((s) => s.kind !== "scatter");
      // Initial-Drop-Pool (Scatter-Gewicht ggf. per Boost erhöht).
      this.fillSymbols = C.SYMBOLS;
      // In FS dürfen Scatter auch beim Nachrutschen reindroppen (Engine setzt true).
      this.allowScatterRefill = false;
      for (let c = 0; c < C.COLS; c++) this.cells.push(new Array(C.ROWS).fill(null));
      this.position.set(C.GRID_X, C.GRID_Y);

      // Z-Sortierung: Scatter liegt vor den anderen Symbolen (leichtes Überlappen ok).
      this.sortableChildren = true;

      // Maske, damit reinfallende Symbole oberhalb nicht sichtbar sind
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRoundedRect(-GAPpad(), -GAPpad(), C.GRID_W + GAPpad() * 2, C.GRID_H + GAPpad() * 2, 14);
      mask.endFill();
      mask.zIndex = -10;
      this.addChild(mask);
      this.mask = mask;
    }

    _xy(col, row) {
      return {
        x: col * (C.CELL + C.GAP),
        y: row * (C.CELL + C.GAP),
      };
    }

    _randDef() {
      return this.rng.weightedPick(this.fillSymbols);
    }

    // Nachschub beim Tumble: ohne Scatter (siehe math.js, gleiche Regel).
    _randDefNoScatter() {
      return this.rng.weightedPick(this._paySymbols);
    }

    // Scatter-Boost: Scatter-Gewicht ×mult fürs initiale Befüllen (Boost-Mode).
    setScatterBoost(mult) {
      this.fillSymbols = C.SYMBOLS.map((s) =>
        s.kind === "scatter" ? Object.assign({}, s, { weight: s.weight * mult }) : s
      );
    }

    _makeSprite(def, col, row) {
      const sp = new LF.SymbolSprite(def);
      const { x, y } = this._xy(col, row);
      sp.position.set(x, y);
      sp.zIndex = def.kind === "scatter" ? 5 : 0; // Scatter vor anderen Symbolen
      this.addChild(sp);
      return sp;
    }

    _clear() {
      for (let c = 0; c < C.COLS; c++) {
        for (let r = 0; r < C.ROWS; r++) {
          if (this.cells[c][r]) { this.cells[c][r].destroy(); this.cells[c][r] = null; }
        }
      }
    }
    _placeAbove(def, c, r) {
      const sp = this._makeSprite(def, c, r);
      const { x, y } = this._xy(c, r);
      sp.position.set(x, y - (C.GRID_H + C.CELL));
      this.cells[c][r] = sp;
      return sp;
    }

    // Normaler Spin-Start: zufällig befüllen + animiert fallen lassen.
    async spawnAll(anticipate = true) {
      this._clear();
      const cap = C.MAX_SCATTERS || 4;
      let sc = 0;
      for (let c = 0; c < C.COLS; c++)
        for (let r = 0; r < C.ROWS; r++) {
          let def = this._randDef();
          if (def.kind === "scatter") { if (sc >= cap) def = this._randDefNoScatter(); else sc++; }
          this._placeAbove(def, c, r);
        }
      await this._animateDrop(anticipate);
    }

    // Guaranteed-Bonus-Spin (Kauf): genau scatterCount Scatter, mit Sweat.
    async spawnGuaranteed(scatterCount, anticipate = true) {
      this._clear();
      // alles mit NICHT-Scatter füllen
      for (let c = 0; c < C.COLS; c++)
        for (let r = 0; r < C.ROWS; r++) this._placeAbove(this.rng.weightedPick(this._paySymbols), c, r);
      // genau scatterCount Scatter setzen (2 früh -> Sweat, Rest gespreizt für Reveals)
      const cols = [0, 1];
      const pool = [3, 5, 4, 2];
      for (let i = 0; cols.length < scatterCount && i < pool.length; i++) cols.push(pool[i]);
      const SC = LF.SYMBOL_BY_ID["SC"];
      for (const col of cols.slice(0, scatterCount)) {
        const row = this.rng.int(C.ROWS);
        if (this.cells[col][row]) this.cells[col][row].destroy();
        this._placeAbove(SC, col, row);
      }
      await this._animateDrop(anticipate);
    }

    // Spalten fallen lassen; ab 2 Scatter: restliche langsam + Polizei-Lichter + Sirene.
    async _animateDrop(anticipate) {
      const scatInCol = (c) => {
        let n = 0; for (let r = 0; r < C.ROWS; r++) if (this.cells[c][r].def.kind === "scatter") n++; return n;
      };
      let cum = 0, antStart = C.COLS;
      for (let c = 0; c < C.COLS; c++) { if (cum >= 2) { antStart = c; break; } cum += scatInCol(c); }

      const normals = [];
      for (let c = 0; c < antStart; c++) normals.push(this._dropColumn(c, false, c));
      await Promise.all(normals);

      if (anticipate && antStart < C.COLS) {
        if (LF.sound) LF.sound.siren(1.2);
        const police = this._startPolice();
        for (let c = antStart; c < C.COLS; c++) {
          if (LF.sound) LF.sound.tension(c - antStart);
          await this._dropColumn(c, true, 0);
          await LF.delay(C.TIMING.sweatPause);
        }
        this._stopPolice(police);
      }
    }

    async _dropColumn(c, slow, staggerIdx) {
      await LF.delay((staggerIdx || 0) * C.TIMING.dropStagger);
      const dur = slow ? C.TIMING.dropDuration * (C.TIMING.sweatSlow || 1.7) : C.TIMING.dropDuration;
      const rowGap = slow ? 70 : 30;
      const drops = [];
      for (let r = C.ROWS - 1; r >= 0; r--) {
        const sp = this.cells[c][r];
        const { y } = this._xy(c, r);
        drops.push((async () => {
          await LF.delay((C.ROWS - 1 - r) * rowGap);
          // Zelle könnte zwischenzeitlich entfernt worden sein (z.B. neuer Spin/_clear
          // überlappt das Startboard-Drop) -> defensiv abbrechen statt auf null zugreifen.
          if (!sp || sp._dead) return;
          await LF.tween.to(sp.position, { y }, dur, LF.ease.outBack);
          if (!sp._dead) sp.playLanding(); // Landing-Anim beim Aufprall (fire-and-forget, no-op ohne Sheet)
        })());
      }
      // Drop-Sound exakt auf den Aufprall der Walze timen (~80% der Falldauer,
      // skaliert automatisch mit LF.speed/Turbo wie die Tweens).
      if (LF.sound) LF.delay(dur * 0.8).then(() => LF.sound.drop(c));
      await Promise.all(drops);
    }

    // --- Polizei-Lichter (rot/blau, alternierend) während der Anticipation ---
    _glowTexture(rgb) {
      const key = "_glow_" + rgb;
      if (this[key]) return this[key];
      const s = 256;
      const cv = document.createElement("canvas"); cv.width = s; cv.height = s;
      const ctx = cv.getContext("2d");
      const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, "rgba(" + rgb + ",0.95)");
      grad.addColorStop(0.5, "rgba(" + rgb + ",0.32)");
      grad.addColorStop(1, "rgba(" + rgb + ",0.0)");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
      this[key] = PIXI.Texture.from(cv);
      return this[key];
    }
    _startPolice() {
      const red = new PIXI.Sprite(this._glowTexture("255,48,48"));
      const blue = new PIXI.Sprite(this._glowTexture("64,118,255"));
      for (const sp of [red, blue]) {
        sp.anchor.set(0.5);
        sp.blendMode = PIXI.BLEND_MODES.ADD;
        sp.zIndex = 8;
        sp.width = C.GRID_W * 0.95;
        sp.height = C.GRID_H * 1.5;
        this.addChild(sp);
      }
      red.position.set(C.GRID_W * 0.16, C.GRID_H / 2);
      blue.position.set(C.GRID_W * 0.84, C.GRID_H / 2);
      red.alpha = 0.6; blue.alpha = 0.12;
      let on = true;
      const iv = setInterval(() => {
        on = !on;
        red.alpha = on ? 0.6 : 0.12;
        blue.alpha = on ? 0.12 : 0.6;
      }, 230);
      return { red, blue, iv };
    }
    _stopPolice(h) {
      if (!h) return;
      clearInterval(h.iv);
      LF.tween.to(h.red, { alpha: 0 }, 260);
      LF.tween.to(h.blue, { alpha: 0 }, 260).then(() => {
        for (const sp of [h.red, h.blue]) { if (sp.parent) sp.parent.removeChild(sp); sp.destroy(); }
      });
    }

    // Liefert flache Liste {col,row,sprite,def}
    all() {
      const out = [];
      for (let c = 0; c < C.COLS; c++)
        for (let r = 0; r < C.ROWS; r++)
          if (this.cells[c][r]) out.push({ col: c, row: r, sprite: this.cells[c][r], def: this.cells[c][r].def });
      return out;
    }

    countScatters() {
      let n = 0;
      for (const cell of this.all()) if (cell.def.kind === "scatter") n++;
      return n;
    }

    // Scatter-Sprites auf dem Board.
    _scatterSprites() {
      return this.all().filter((c) => c.def.kind === "scatter").map((c) => c.sprite);
    }

    // SCATTER-TENSION: ab 2 Scatter glüht nach dem Landen der Landing-Glow als Loop
    // (~"2 Sek nach dem letzten Drop"), danach zurück auf statisch. Win-Burst kommt
    // erst beim echten Trigger (siehe scatterWinBurst). No-op bei <2 oder ohne Sheet.
    async scatterTension() {
      const sc = this._scatterSprites();
      if (sc.length < 2) return;
      const an = LF.symbolAnims && LF.symbolAnims.SC;
      // Voller Tension-Hold nur wenn ein Trigger möglich ist (3+). Bei genau 2 (häufig,
      // kein Trigger) nur ein kurzer Glow -> kein totes ~1,3s-Warten auf jedem 2-Scatter-Spin
      // (die eigentliche "kommt die 3.?"-Spannung lief schon im langsamen Anticipation-Drop).
      const hold = sc.length >= 3 ? (C.TIMING.scatterTension || 1300) : (C.TIMING.scatterTensionShort || 350);
      const useSheet = an && an.landing;
      for (const sp of sc) useSheet ? sp.startAnimLoop(an.landing, C.TIMING.scatterLoop || 600, 1.34) : sp.startGlowPulse();
      if (LF.sound) LF.sound.tension(0);
      await LF.delay(hold);
      for (const sp of sc) useSheet ? sp.stopAnimLoop(true) : sp.stopGlowPulse();
    }

    // SCATTER-WIN-BURST: beim Free-Spins-Trigger einmalig auf allen Scattern (parallel).
    async scatterWinBurst() {
      const sc = this._scatterSprites();
      if (!sc.length) return;
      const an = LF.symbolAnims && LF.symbolAnims.SC;
      const useSheet = an && an.win;
      await Promise.all(sc.map((sp) => useSheet ? sp.playScatterWin() : sp.scatterBurst()));
    }

    // Raster als 2D-ID-Array [col][row] (id | null) für das Math-Modell.
    toIdGrid() {
      const g = [];
      for (let c = 0; c < C.COLS; c++) {
        g[c] = [];
        for (let r = 0; r < C.ROWS; r++) g[c][r] = this.cells[c][r] ? this.cells[c][r].def.id : null;
      }
      return g;
    }

    // Entfernt die Zellen in removeSet ("col,row") und lässt darüber nachrutschen,
    // füllt oben mit neuen Symbolen auf (Tumble).
    async applyTumble(removeSet) {
      // 1) Gewinner ausblenden
      const fades = [];
      removeSet.forEach((key) => {
        const [c, r] = key.split(",").map(Number);
        const sp = this.cells[c][r];
        if (sp) fades.push(sp.fadeOut().then(() => { sp.destroy(); this.cells[c][r] = null; }));
      });
      await Promise.all(fades);

      // Scatter-Budget fürs Nachrutschen (max MAX_SCATTERS auf dem Board)
      const scCap = C.MAX_SCATTERS || 4;
      let scCount = this.countScatters();

      // 2) pro Spalte: überlebende nach unten kompaktieren, oben neue spawnen
      const drops = [];
      for (let c = 0; c < C.COLS; c++) {
        const survivors = [];
        for (let r = C.ROWS - 1; r >= 0; r--) {
          if (this.cells[c][r]) survivors.push(this.cells[c][r]);
        }
        // survivors[0] soll nach ganz unten (row = ROWS-1)
        const newCol = new Array(C.ROWS).fill(null);
        let row = C.ROWS - 1;
        for (const sp of survivors) {
          newCol[row] = sp;
          const { x, y } = this._xy(c, row);
          if (sp && !sp._dead) drops.push(LF.tween.to(sp.position, { y }, C.TIMING.tumbleDrop, LF.ease.outBack));
          row--;
        }
        // restliche obere Zeilen neu befüllen (in FS mit Scatter, sonst ohne)
        let spawnAbove = 1;
        for (let rr = row; rr >= 0; rr--) {
          let def = this.allowScatterRefill ? this._randDef() : this._randDefNoScatter();
          if (def.kind === "scatter") { if (scCount >= scCap) def = this._randDefNoScatter(); else scCount++; }
          const sp = this._makeSprite(def, c, rr);
          const { x, y } = this._xy(c, rr);
          sp.position.set(x, y - spawnAbove * (C.CELL + C.GAP) - C.GRID_H);
          newCol[rr] = sp;
          drops.push(
            (async () => {
              try {
                await LF.delay((row - rr) * 25);
                // Symbol könnte zwischenzeitlich entfernt sein (z.B. neuer Spin/_clear) -> defensiv.
                if (!sp || sp._dead || sp._destroyed) return;
                await LF.tween.to(sp.position, { y }, C.TIMING.tumbleDrop, LF.ease.outBack);
              } catch (e) {}
              // KEIN Landing beim Nachdroppen (Tumble) -> Landing nur beim ersten Board-Drop.
            })()
          );
          spawnAbove++;
        }
        this.cells[c] = newCol;
      }
      await Promise.all(drops);
    }
  }

  function GAPpad() { return 8; }

  LF.Grid = Grid;
  const GAP = C.GAP; // local alias (used in mask calc above via closure-safe ref)
})();
