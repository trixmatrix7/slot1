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
      this.addChild(this.sprite);

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
    }

    setSymbol(def) {
      this.def = def;
      const s = C.CELL;
      const tex = (LF.textures && LF.textures[def.id]) || null;
      if (tex) {
        this.sprite.texture = tex;
        this.sprite.visible = true;
        this.sprite.width = s;
        this.sprite.height = s;
        this.label.visible = false;
      } else {
        // Textur fehlt -> Platzhalter-Text (z.B. wenn über file:// geöffnet)
        this.sprite.visible = false;
        this.label.visible = true;
        this.label.text = def.label;
      }
    }

    // Gewinn-Hervorhebung: Puls + kurzes Aufleuchten
    async playWin() {
      const dur = C.TIMING.winHighlight;
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

      // Maske, damit reinfallende Symbole oberhalb nicht sichtbar sind
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRoundedRect(-GAPpad(), -GAPpad(), C.GRID_W + GAPpad() * 2, C.GRID_H + GAPpad() * 2, 14);
      mask.endFill();
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
      this.addChild(sp);
      return sp;
    }

    // Komplett neu befüllen mit Reinfall-Animation (für jeden Spin-Start).
    async spawnAll() {
      // alte entfernen
      for (let c = 0; c < C.COLS; c++) {
        for (let r = 0; r < C.ROWS; r++) {
          if (this.cells[c][r]) {
            this.cells[c][r].destroy();
            this.cells[c][r] = null;
          }
        }
      }
      const colTweens = [];
      for (let c = 0; c < C.COLS; c++) {
        const colPromise = (async () => {
          await LF.delay(c * C.TIMING.dropStagger);
          for (let r = 0; r < C.ROWS; r++) {
            const def = this._randDef();
            const sp = this._makeSprite(def, c, r);
            const { x, y } = this._xy(c, r);
            sp.position.set(x, y - (C.GRID_H + C.CELL)); // startet oberhalb
            this.cells[c][r] = sp;
          }
          // pro Spalte von unten nach oben fallen lassen (gestaffelt)
          const drops = [];
          for (let r = C.ROWS - 1; r >= 0; r--) {
            const sp = this.cells[c][r];
            const { y } = this._xy(c, r);
            drops.push(
              (async () => {
                await LF.delay((C.ROWS - 1 - r) * 30);
                await LF.tween.to(sp.position, { y }, C.TIMING.dropDuration, LF.ease.outBack);
              })()
            );
          }
          await Promise.all(drops);
        })();
        colTweens.push(colPromise);
      }
      await Promise.all(colTweens);
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
          const def = this.allowScatterRefill ? this._randDef() : this._randDefNoScatter();
          const sp = this._makeSprite(def, c, rr);
          const { x, y } = this._xy(c, rr);
          sp.position.set(x, y - spawnAbove * (C.CELL + C.GAP) - C.GRID_H);
          newCol[rr] = sp;
          drops.push(
            (async () => {
              await LF.delay((row - rr) * 25);
              await LF.tween.to(sp.position, { y }, C.TIMING.tumbleDrop, LF.ease.outBack);
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
