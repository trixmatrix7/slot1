/* ============================================================
   SOUND — cleane, synthetisierte UI-Sounds (Web Audio API).
   Keine Asset-Dateien nötig; alles prozedural -> "clean modern".
   AudioContext startet erst nach erster User-Geste (unlock()).
   Später durch echte Sound-Dateien ersetzbar (play(name)).
   ============================================================ */
(function () {
  const LF = (window.LF = window.LF || {});

  class SoundManager {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;      // SFX
      this.musicEnabled = true; // Musik (Loop, optional)
      this._sirenNode = null;
    }

    unlock() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    }

    setEnabled(on) { this.enabled = !!on; }
    setMusic(on) { this.musicEnabled = !!on; }

    _tone({ freq = 440, dur = 0.12, type = "sine", gain = 0.2, attack = 0.005, slideTo = null, when = 0 }) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.02);
    }

    _noise({ dur = 0.2, gain = 0.12, freq = 1200, sweepTo = null, type = "bandpass" }) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const buf = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur);
    }

    /* ---------- konkrete Sounds ---------- */
    click() { this._tone({ freq: 680, dur: 0.05, type: "triangle", gain: 0.12 }); }
    toggle() { this._tone({ freq: 520, dur: 0.06, type: "square", gain: 0.08 }); }

    spin() {
      this._noise({ dur: 0.28, gain: 0.07, freq: 500, sweepTo: 2600 });
      this._tone({ freq: 180, dur: 0.22, type: "sine", gain: 0.06, slideTo: 420 });
    }

    // Reel-Drop / Aufprall pro Walze: tiefer "Thud" (Body + Klick-Transient).
    drop(col) {
      if (!this.enabled || !this.ctx) return;
      const base = 165 - (col || 0) * 8;
      this._tone({ freq: base, dur: 0.16, type: "sine", gain: 0.18, slideTo: base * 0.62 });      // Body
      this._tone({ freq: base * 1.5, dur: 0.10, type: "triangle", gain: 0.07, slideTo: base }); // etwas Wärme
      this._noise({ dur: 0.06, gain: 0.09, freq: 2200, sweepTo: 500, type: "lowpass" });          // Klick/Impact
    }
    land(col) { this.drop(col); }

    // Connection (Symbol verbindet sich): metallischer "Klick-Klack" wie Handschellen.
    // step erhöht die Tonhöhe leicht pro Cascade-Schritt.
    connect(step) {
      if (!this.enabled || !this.ctx) return;
      const s = Math.min(step || 1, 12);
      const f = 1500 + s * 110;
      this._tone({ freq: f, dur: 0.045, type: "square", gain: 0.08 });
      this._noise({ dur: 0.035, gain: 0.05, freq: 4200, sweepTo: 2200, type: "bandpass" });
      this._tone({ freq: f * 1.18, dur: 0.05, type: "square", gain: 0.075, when: 0.06 });
      this._tone({ freq: f * 0.88, dur: 0.04, type: "triangle", gain: 0.04, when: 0.06 });
    }

    tumble(step) {
      const f = 480 + Math.min(step || 0, 10) * 55;
      this._tone({ freq: f, dur: 0.09, type: "triangle", gain: 0.12 });
      this._tone({ freq: f * 1.5, dur: 0.07, type: "sine", gain: 0.06 });
    }

    // level 0..4 -> längere/höhere Arpeggios
    win(level) {
      if (!this.enabled || !this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
      const n = Math.min(notes.length, 3 + (level || 0));
      for (let i = 0; i < n; i++) {
        this._tone({ freq: notes[i], dur: 0.2, type: "sine", gain: 0.16, when: i * 0.075 });
      }
    }

    scatter() {
      this._tone({ freq: 1318.5, dur: 0.22, type: "sine", gain: 0.18 });
      this._tone({ freq: 1760, dur: 0.22, type: "sine", gain: 0.10, when: 0.02 });
    }

    // steigende Spannung pro Walze (bei 2+ Scatter)
    tension(step) {
      const f = 280 + (step || 0) * 55;
      this._tone({ freq: f, dur: 0.34, type: "sawtooth", gain: 0.07, slideTo: f * 1.25 });
    }

    // Polizei-Sirene ("Yelp" — schnelle Aufsweeps, zwei verstimmte Oszillatoren)
    siren(dur = 1.4) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const out = this.ctx.createGain(); out.gain.value = 0.0001; out.connect(this.master);
      const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1250; bp.Q.value = 5; bp.connect(out);
      const o1 = this.ctx.createOscillator(); o1.type = "sawtooth"; o1.connect(bp);
      const o2 = this.ctx.createOscillator(); o2.type = "sawtooth"; o2.detune.value = 10; o2.connect(bp);
      const lo = 660, hi = 1180, period = 0.30;
      for (let tt = 0; tt < dur; tt += period) {
        const end = Math.min(dur, tt + period);
        o1.frequency.setValueAtTime(lo, t + tt); o1.frequency.exponentialRampToValueAtTime(hi, t + end);
        o2.frequency.setValueAtTime(lo, t + tt); o2.frequency.exponentialRampToValueAtTime(hi, t + end);
      }
      out.gain.linearRampToValueAtTime(0.12, t + 0.05);
      out.gain.setValueAtTime(0.12, t + dur - 0.14);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o1.start(t); o2.start(t); o1.stop(t + dur); o2.stop(t + dur);
    }
  }

  LF.sound = new SoundManager();
})();
