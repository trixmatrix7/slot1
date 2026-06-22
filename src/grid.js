/* ============================================================
   GRID — SymbolSprite (Platzhalter-Kachel) + Grid (6×5, Tumble-Logik).
   ============================================================ */
(function () {
  const LF = (window.LF = window.LF || {});
  const C = LF.CONFIG;

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
      // Symbol-Bild (füllt die Kachel; Texturen sind quadratisch).
      this.sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
      this.sprite.anchor.set(0.5);
      this.sprite.position.set(s / 2, s / 2);
      this.sprite.width = s;
      this.sprite.height = s;
      this.sprite.roundPixels = true;     // ganzzahlige Geräte-Pixel -> kein Subpixel-Flimmern
      this.addChild(this.sprite);

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

    // Landing-Animation beim Landen (fire-and-forget; no-op ohne Sheet).
    // Scatter wird hier NICHT animiert -> der Scatter-Spezial-Flow steuert ihn (Tension-Glow).
    playLanding() {
      if (this.def.kind === "scatter") return;
      const an = this._anims();
      if (!an || !an.landing) return;
      this._playFrames(an.landing, C.TIMING.landingDur || 520, this._baseScale());
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
      if (this._loopDriver) { LF.tween.killOf(this._loopDriver); this._loopDriver = null; }
      if (this._animDriver) { LF.tween.killOf(this._animDriver); this._animDriver = null; }
      LF.tween.killOf(this.anim);
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
        this.label.visible = false;
      } else {
        // Textur fehlt -> Platzhalter-Text (z.B. wenn über file:// geöffnet)
        this.sprite.visible = false;
        this.label.visible = true;
        this.label.text = def.label;
      }
    }

    // Gewinn-Hervorhebung: Win-Spritesheet (falls vorhanden) ODER Puls-Fallback.
    async playWin() {
      const dur = C.TIMING.winHighlight;
      const an = this._anims();
      if (an && an.win) {
        // Win-Burst über die Highlight-Dauer. Non-Scatter an die Grundgröße gekoppelt
        // (bleibt in der Zelle, kein Pop); nur der Scatter darf über den Rand (1.5).
        // 80 ms Crossfade verdeckt den Wechsel.
        await this._playFrames(an.win, dur, this.def.kind === "scatter" ? 1.5 : this._baseScale(), 80);
        return;
      }
      const flash = new PIXI.Graphics();
      flash.beginFill(0xffffff, 0.0);
      flash.drawRoundedRect(2, 2, C.CELL - 4, C.CELL - 4, 12);
      flash.endFill();
      this.addChild(flash);

      // pulsieren über Pivot-Trick: skaliere children-Container? Einfacher: scale auf sich.
      this.pivot.set(this._cx, this._cy);
      this.position.x += this._cx;
      this.position.y += this._cy;

      await Promise.all([
        LF.tween.to(this.scale, { x: 1.12, y: 1.12 }, dur * 0.4, LF.ease.outQuad),
        LF.tween.to(flash, { alpha: 0.6 }, dur * 0.4, LF.ease.outQuad),
      ]);
      await Promise.all([
        LF.tween.to(this.scale, { x: 1.0, y: 1.0 }, dur * 0.6, LF.ease.outQuad),
        LF.tween.to(flash, { alpha: 0.0 }, dur * 0.6, LF.ease.outQuad),
      ]);
      this.removeChild(flash);
      flash.destroy();
      // Pivot zurück
      this.position.x -= this._cx;
      this.position.y -= this._cy;
      this.pivot.set(0, 0);
    }

    async fadeOut() {
      this.pivot.set(this._cx, this._cy);
      this.position.x += this._cx;
      this.position.y += this._cy;
      await Promise.all([
        LF.tween.to(this, { alpha: 0 }, 180, LF.ease.inQuad),
        LF.tween.to(this.scale, { x: 0.3, y: 0.3 }, 180, LF.ease.inQuad),
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
      if (!an || !an.landing) return;
      // Voller Tension-Hold nur wenn ein Trigger möglich ist (3+). Bei genau 2 (häufig,
      // kein Trigger) nur ein kurzer Glow -> kein totes ~1,3s-Warten auf jedem 2-Scatter-Spin
      // (die eigentliche "kommt die 3.?"-Spannung lief schon im langsamen Anticipation-Drop).
      const hold = sc.length >= 3 ? (C.TIMING.scatterTension || 1300) : (C.TIMING.scatterTensionShort || 350);
      for (const sp of sc) sp.startAnimLoop(an.landing, C.TIMING.scatterLoop || 600, 1.34);
      if (LF.sound) LF.sound.tension(0);
      await LF.delay(hold);
      for (const sp of sc) sp.stopAnimLoop(true);
    }

    // SCATTER-WIN-BURST: beim Free-Spins-Trigger einmalig auf allen Scattern (parallel).
    async scatterWinBurst() {
      const sc = this._scatterSprites();
      if (!sc.length) return;
      const an = LF.symbolAnims && LF.symbolAnims.SC;
      if (!an || !an.win) return;
      await Promise.all(sc.map((sp) => sp.playScatterWin()));
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
          drops.push(LF.tween.to(sp.position, { y }, C.TIMING.tumbleDrop, LF.ease.outBack));
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
              await LF.delay((row - rr) * 25);
              await LF.tween.to(sp.position, { y }, C.TIMING.tumbleDrop, LF.ease.outBack);
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
