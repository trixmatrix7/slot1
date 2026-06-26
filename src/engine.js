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

    setBetMax() {
      if (this.busy) return;
      this.betIndex = C.BET_LEVELS.length - 1;
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

      try {
        // Guaranteed-Bonus-Spin: genau N Scatter droppen (mit Sweat) ...
        if (LF.sound) LF.sound.spin();
        await this.grid.spawnGuaranteed(scatters, true);
        await this.grid.scatterTension();   // Moment der Wahrheit (Orbits laufen)
        await this.grid.scatterWinBurst();  // Scatter-Win-Animation (Kauf -> immer Trigger)
        await LF.delay(300);
        await this.grid.playFSTransition(); // Grid dreht sich in sich ein
        await this.ui.showFreeSpinsIntro(award); // Intro öffnet sich
        await this.grid.restoreFromTransition(); // Grid zurücksetzen
        await this._runFreeSpins(award);

        await this._settleWin();
      } catch (e) {
        console.error("buyFeature error:", e);
      } finally {
        // busy/Spinning IMMER zurücksetzen -> kein Soft-Lock bei einem Anim-/Render-Fehler.
        this.ui.setSpinning(false);
        this.busy = false;
      }
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
      if (LF.sound) LF.sound.spin();

      this.stake = cost;
      this.balance -= cost;
      this.ui.setBalance(this.balance);

      this._runningX = 0;
      let ok = true;
      try {
        await this.grid.spawnAll(); // Sirene/Anticipation passiert in spawnAll bei 2+ Scatter
        await this.grid.scatterTension(); // ab 2 Scatter: Landing-Glow-Tension nach dem Landen

        const base = await this._resolveBoard(false);

        const award = LF.Math.triggerAward(base.scatters);
        if (award > 0) {
          await this.grid.scatterWinBurst();        // Scatter-Win-Animation (stoppt Orbits) + Win-Sound
          await LF.delay(300);
          await this.grid.playFSTransition();       // Grid dreht sich in sich ein
          await this.ui.showFreeSpinsIntro(award);  // Intro öffnet sich (START)
          await this.grid.restoreFromTransition();  // Grid für die Free Spins zurücksetzen
          await this._runFreeSpins(award);
        } else {
          this.grid.stopAllOrbits();                // kein Trigger -> Orbits ausblenden
        }

        await this._settleWin();
      } catch (e) {
        ok = false;
        console.error("spin error:", e);
      } finally {
        // busy/Spinning IMMER zurücksetzen -> kein Soft-Lock bei einem Anim-/Render-Fehler.
        this.ui.setSpinning(false);
        this.busy = false;
      }

      if (ok && this.autoplay) {
        await LF.delay(250);
        this.spin();
      }
    }

    // Gesamtgewinn deckeln + gutschreiben (× this.stake) + Win-Celebration
    async _settleWin() {
      const totalX = Math.min(this._runningX, C.MAX_WIN_X);
      const win = totalX * this.stake;
      this.balance += win;
      this.ui.setBalance(this.balance);
      this.ui.setWin(win > 0 ? win : 0);
      // Win-Celebration ab 15× Einsatz (Superb / Sensational / Epic)
      if (totalX >= 15) await this.ui.showWinCelebration(win, totalX);
    }

    /* ---------- WAYS-Auflösung eines Boards (Animation) ---------- */
    // Einmalige Ways-Auswertung (KEIN Tumble): Gewinn-Zellen aufleuchten, Basis-Win
    // sammeln (OHNE Multiplikator — der kommt in FS am Spin-Ende). Liefert {winX, scatters}.
    async _resolveBoard() {
      const res = LF.Math.evaluate(this.grid.toIdGrid());
      if (res.totalX > 0) {
        this._runningX += res.totalX;
        if (LF.sound) LF.sound.connect(1); // ein Connection-Klick pro Gewinn-Spin
        this.ui.setWin(this._runningX * this.stake);
        await this.grid.highlightWins(res.winCells);
      }
      return { winX: res.totalX, scatters: res.scatters };
    }

    /* ---------- Free-Spins-Feature (progressiver Multiplikator) ---------- */
    // Identisch zu math.js M.runFreeSpins (damit der Sim-RTP 1:1 gilt):
    //   - jeder FS-Spin: Basis-Ways-Win × aktueller Multiplikator
    //   - Multiplikator steigt mit JEDEM Freispiel um +perSpin (bleibt das ganze Feature)
    //   - Retrigger nach Config-Schedule (2 Scatter -> +5, 3+ -> +10)
    async _runFreeSpins(award) {
      const mc = C.FREESPINS.multiplier;
      let total = award, done = 0;
      let m = mc.start || 1;
      const startX = this._runningX;

      this.grid.allowScatterRefill = !!C.FREESPINS.scatterInFreeSpins;
      this.ui.showFreeSpins(total);
      this.ui.setFSMultiplier(m);
      await LF.delay(800);

      while (done < total && done < C.FREESPINS.maxSpins) {
        done++;
        this.ui.updateFreeSpins(done, total);
        this.ui.setFSMultiplier(m);                 // Multiplikator dieses Spins

        await this.grid.spawnAll();
        const spinStartX = this._runningX;
        const r = await this._resolveBoard();       // Basis-Ways-Win des Spins
        const spinBaseX = this._runningX - spinStartX;

        // Aktueller Multiplikator fliegt auf den Spin-Betrag.
        if (spinBaseX > 0 && m > 1) {
          const finalX = spinBaseX * m;
          await this.ui.multiplyWin(spinBaseX * this.stake, m, finalX * this.stake);
          this._runningX += (finalX - spinBaseX);
          this.ui.setWin(this._runningX * this.stake);
        }

        // Multiplikator steigt mit JEDEM Freispiel (nicht nur bei Gewinn).
        m = Math.min(mc.max || 100, m + (mc.perSpin || 1));
        this.ui.setFSMultiplier(m);

        // Retrigger nach Config-Schedule (2+ Scatter).
        const ex = LF.Math.retriggerSpins(r.scatters);
        if (ex > 0) {
          total += ex;
          this.ui.flashMessage("+" + ex + " FREE SPINS");
          this.ui.updateFreeSpins(done, total);
          if (this.grid.scatterWinBurst) await this.grid.scatterWinBurst();
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
