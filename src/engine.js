/* ============================================================
   ENGINE — Spielablauf-Statemachine + Animation.
   Gewinn-Logik kommt aus LF.Math (math.js) — identisch zum Simulator.
   Einsatz: this.stake = effektiver Einsatz des laufenden Spins.
     - Basisspin:        bet × (Boost? betMultiplier : 1)
     - Feature-Kauf:     bet (Käufe sind Boost-unabhängig)
   Gewinne werden in X (× Einsatz) geführt, auf MAX_WIN_X gedeckelt,
   dann mit this.stake in Währung umgerechnet.
   ============================================================ */
(function () {
  const LF = (window.LF = window.LF || {});
  const C = LF.CONFIG;

  class Engine {
    constructor({ app, grid, ui, rng }) {
      this.app = app;
      this.grid = grid;
      this.ui = ui;
      this.rng = rng;

      this.balance = C.START_BALANCE;
      this.betIndex = C.DEFAULT_BET_INDEX;
      this.busy = false;
      this.autoplay = false;
      this.boostActive = false;

      this.fsMultiplier = 1;
      this.fsStep = 1;
      this._runningX = 0;
      this.stake = this.bet;

      this.ui.setBalance(this.balance);
      this.ui.setBet(this.effectiveBet);
      this.ui.setBoostIndicator(false);
      this.ui.setWin(0);
    }

    get bet() { return C.BET_LEVELS[this.betIndex]; }
    get effectiveBet() { return this.bet * (this.boostActive ? C.BUY.boost.betMultiplier : 1); }

    changeBet(dir) {
      if (this.busy) return;
      this.betIndex = LF.clamp(this.betIndex + dir, 0, C.BET_LEVELS.length - 1);
      this.ui.setBet(this.effectiveBet);
    }

    toggleAutoplay() {
      this.autoplay = !this.autoplay;
      this.ui.setAutoplay(this.autoplay);
      if (this.autoplay && !this.busy) this.spin();
    }

    /* ---------- Boost-Toggle (3× Freispiel-Chance) ---------- */
    toggleBoost() {
      if (this.busy) return;
      this.boostActive = !this.boostActive;
      this.grid.setScatterBoost(this.boostActive ? C.BUY.boost.scatterWeightMultiplier : 1);
      this.ui.setBet(this.effectiveBet);
      this.ui.setBoostIndicator(this.boostActive);
      this.ui.openBuyMenu(this._buyState()); // Menü mit neuem Zustand neu rendern
    }

    _buyState() {
      return {
        bet: this.bet,
        boostActive: this.boostActive,
        features: C.BUY.feature,
        boost: C.BUY.boost,
      };
    }

    /* ---------- Buy-Menü öffnen ---------- */
    openBuyMenu() {
      if (this.busy) return;
      this.ui.openBuyMenu(this._buyState());
    }

    /* ---------- Feature kaufen (3 oder 4 Scatter) ---------- */
    async buyFeature(scatters) {
      if (this.busy) return;
      const f = C.BUY.feature[scatters];
      if (!f) return;
      const cost = f.cost * this.bet;
      if (this.balance < cost) { this.ui.flashMessage("Guthaben zu niedrig"); return; }

      this.ui.closeBuyMenu();
      this.busy = true;
      this.ui.setSpinning(true);
      this.ui.setWin(0);
      this.balance -= cost;
      this.ui.setBalance(this.balance);

      this.stake = this.bet;        // Käufe zum Grundeinsatz (Boost gilt nur für Basisspiele)
      this._runningX = 0;
      const award = C.FREESPINS.trigger[scatters] || 10;
      await this._runFreeSpins(award);

      this._settleWin();
      this.ui.setSpinning(false);
      this.busy = false;
    }

    /* ---------- Hauptspin ---------- */
    async spin() {
      if (this.busy) return;
      const cost = this.effectiveBet;
      if (this.balance < cost) {
        this.ui.flashMessage("Guthaben zu niedrig");
        this.autoplay = false; this.ui.setAutoplay(false);
        return;
      }
      this.busy = true;
      this.ui.setSpinning(true);
      this.ui.setWin(0);

      this.stake = cost;
      this.balance -= cost;
      this.ui.setBalance(this.balance);

      this._runningX = 0;
      await this.grid.spawnAll();

      const base = await this._resolveBoard(false);

      const award = LF.Math.triggerAward(base.scatters);
      if (award > 0) {
        await LF.delay(400);
        await this._runFreeSpins(award);
      }

      this._settleWin();
      this.ui.setSpinning(false);
      this.busy = false;

      if (this.autoplay) {
        await LF.delay(250);
        this.spin();
      }
    }

    // Gesamtgewinn deckeln + gutschreiben (× this.stake)
    _settleWin() {
      const totalX = Math.min(this._runningX, C.MAX_WIN_X);
      const win = totalX * this.stake;
      this.balance += win;
      this.ui.setBalance(this.balance);
      this.ui.setWin(win > 0 ? win : 0);
    }

    /* ---------- Tumble-Loop für ein Board (Animation) ---------- */
    async _resolveBoard(freeSpins) {
      let boardX = 0;
      for (;;) {
        const res = LF.Math.evaluate(this.grid.toIdGrid());
        if (res.totalX <= 0) break;

        const mult = freeSpins ? this.fsMultiplier : 1;
        boardX += res.totalX * mult;
        this._runningX += res.totalX * mult;

        const removeSet = new Set(res.remove.map(([c, r]) => c + "," + r));
        const highlights = [];
        removeSet.forEach((key) => {
          const [c, r] = key.split(",").map(Number);
          const sp = this.grid.cells[c][r];
          if (sp) highlights.push(sp.playWin());
        });
        await Promise.all(highlights);

        this.ui.setWin(this._runningX * this.stake);
        await this.grid.applyTumble(removeSet);

        if (freeSpins) {
          const mc = C.FREESPINS.multiplier;
          if (mc.factor && mc.factor > 1) {
            this.fsMultiplier = Math.min(mc.max, this.fsMultiplier * mc.factor);
          } else {
            this.fsMultiplier = Math.min(mc.max, this.fsMultiplier + this.fsStep);
            this.fsStep += mc.accel || 0;
          }
          const r = Math.round(this.fsMultiplier);
          // Bei Erhöhung: Multi mittig zeigen, hoch in die Box fliegen lassen (setzt dort den Wert).
          if (r > this._lastShownMult) {
            this._lastShownMult = r;
            await this.ui.flashMultiplier(r);
          } else {
            this.ui.setFSMultiplier(r);
          }
        }
      }
      return { winX: boardX, scatters: this.grid.countScatters() };
    }

    /* ---------- Free-Spins-Feature ---------- */
    async _runFreeSpins(award) {
      let total = award, done = 0;
      this.fsMultiplier = C.FREESPINS.multiplier.start;
      this.fsStep = C.FREESPINS.multiplier.step;
      this._lastShownMult = Math.round(this.fsMultiplier);
      const startX = this._runningX;

      // In FS dürfen Scatter beim Nachrutschen reindroppen.
      this.grid.allowScatterRefill = !!C.FREESPINS.scatterInFreeSpins;
      const rt = C.FREESPINS.retriggerByScatters || {};

      this.ui.showFreeSpins(total);
      await LF.delay(900);

      while (done < total && done < C.FREESPINS.maxSpins) {
        done++;
        this.ui.updateFreeSpins(done, total);

        await this.grid.spawnAll();
        const r = await this._resolveBoard(true);

        // Scatter-Retrigger: 2 Scatter -> +2, 3+ Scatter -> +4
        let extra = r.scatters >= 3 ? (rt[3] || 0) : r.scatters >= 2 ? (rt[2] || 0) : 0;
        if (extra > 0) {
          total += extra;
          this.ui.flashMessage("+" + extra + " FREE SPINS");
          this.ui.updateFreeSpins(done, total);
          await LF.delay(700);
        }
        await LF.delay(C.TIMING.betweenSpinsFS);
      }

      this.grid.allowScatterRefill = false;
      const fsWin = (this._runningX - startX) * this.stake;
      await this.ui.showFreeSpinsEnd(fsWin);
      this.ui.hideFreeSpins();
    }
  }

  LF.Engine = Engine;
})();
