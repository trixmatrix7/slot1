/* ============================================================
   CORE — Utilities, Tween-Engine, RNG (austauschbar für On-Chain).
   ============================================================ */
(function () {
  const LF = (window.LF = window.LF || {});

  /* ---------- Geld-Format (deutsch, $ hinten): 0.2 -> "0,20$") ---------- */
  LF.money = (v) => v.toFixed(2).replace(".", ",") + "$";

  /* ---------- Mathe ---------- */
  LF.lerp = (a, b, t) => a + (b - a) * t;
  LF.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Easing
  LF.ease = {
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inQuad: (t) => t * t,
    // weich rein UND raus -> startet sanft (kein "Schnappen" nach einem Halt), endet sanft
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    // "Bounce/Settle" am Ende eines Falls
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  /* ---------- Promise-Delay (Browser-Timer, kein Date nötig) ---------- */
  // Globaler Tempo-Faktor (Turbo): 1 = normal, <1 = schneller.
  LF.speed = 1;
  LF.delay = (ms) => new Promise((res) => setTimeout(res, ms * (LF.speed || 1)));

  /* ============================================================
     TWEEN — minimaler, Promise-basierter Tween über Pixi-Ticker.
     LF.tween.to(target, {x,y,alpha,...}, dauerMs, easeFn) -> Promise
     ============================================================ */
  LF.tween = {
    _items: [],
    to(target, props, duration, easeFn) {
      easeFn = easeFn || LF.ease.outQuad;
      duration = duration * (LF.speed || 1); // Turbo skaliert auch Tweens
      return new Promise((resolve) => {
        const from = {};
        for (const k in props) from[k] = target[k];
        this._items.push({ target, props, from, duration, t: 0, easeFn, resolve });
      });
    },
    // dt in ms
    update(dt) {
      for (let i = this._items.length - 1; i >= 0; i--) {
        const it = this._items[i];
        it.t += dt;
        let p = it.duration > 0 ? Math.min(1, it.t / it.duration) : 1;
        const e = it.easeFn(p);
        // BULLETPROOF: ein zerstörtes Ziel (PIXI null nach destroy) darf NIE die
        // Update-Schleife abbrechen — sonst stoppt PIXI den Ticker (kein next rAF).
        try {
          for (const k in it.props) it.target[k] = LF.lerp(it.from[k], it.props[k], e);
        } catch (err) { p = 1; } // Ziel kaputt -> Tween hier beenden
        if (p >= 1) {
          this._items.splice(i, 1);
          it.resolve();
        }
      }
    },
    // Bricht laufende Tweens auf einem Target ab. WICHTIG: das zugehörige Promise
    // wird trotzdem resolved — sonst hängt ein `await`eter Tween, der gekillt wird,
    // für immer (Deadlock). Der Tween springt nur nicht auf den Endwert.
    killOf(target) {
      const keep = [];
      for (const it of this._items) {
        if (it.target === target) { try { it.resolve(); } catch (e) {} }
        else keep.push(it);
      }
      this._items = keep;
    },
  };

  /* ============================================================
     RNG — zentrale Zufallsquelle. JETZT: Math.random().
     SPÄTER (On-Chain BASE): hier durch provably-fair Quelle ersetzen,
     z.B. Seed aus Smart-Contract (commit-reveal) oder Chainlink VRF.
     Die gesamte Engine zieht NUR über dieses Objekt -> ein Tausch genügt.
     ============================================================ */
  class RNG {
    constructor(seed) {
      this._seed = seed; // für deterministische On-Chain-Replays vorgesehen
    }
    // [0,1)
    random() {
      return Math.random();
    }
    // ganze Zahl [0, n)
    int(n) {
      return Math.floor(this.random() * n);
    }
    // gewichtete Auswahl aus [{weight, ...}]
    weightedPick(items) {
      let total = 0;
      for (const it of items) total += it.weight;
      let r = this.random() * total;
      for (const it of items) {
        r -= it.weight;
        if (r < 0) return it;
      }
      return items[items.length - 1];
    }
  }
  LF.RNG = RNG;
  LF.rng = new RNG();

  /* ============================================================
     ASSET-LOADER — lädt alle Symbol-Texturen vor dem Start.
     Befüllt LF.textures[id] = PIXI.Texture.
     (Bilder müssen über http:// geladen werden -> lokalen Server nutzen.)
     ============================================================ */
  LF.textures = {};

  // Hintergrund eines Symbols wegkeyen (Flood-Fill von den Rändern):
  // die einfarbige Hintergrundfläche wird transparent, das Symbol inkl.
  // schwarzer Outline bleibt erhalten. Liefert ein <canvas> zurück.
  LF.keyOutBackground = function (img, tol) {
    tol = tol || 55;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Hintergrundfarbe = Mittel der vier Ecken
    const cIdx = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
    let br = 0, bg = 0, bb = 0;
    for (const c of cIdx) { br += d[c]; bg += d[c + 1]; bb += d[c + 2]; }
    br /= 4; bg /= 4; bb /= 4;
    const tol2 = tol * tol;

    const N = w * h;
    const visited = new Uint8Array(N);
    const stack = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = y * w + x;
      if (visited[p]) return;
      visited[p] = 1; stack.push(p);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

    while (stack.length) {
      const p = stack.pop();
      const i = p * 4;
      const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb;
      if (dr * dr + dg * dg + db * db > tol2) continue; // gehört zum Symbol -> stehen lassen
      d[i + 3] = 0;                                     // Hintergrund -> transparent
      const x = p % w, y = (p - x) / w;
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    ctx.putImageData(imgData, 0, 0);
    return cv;
  };

  // Hat das Bild bereits einen transparenten Hintergrund? (Ecken alpha≈0)
  // -> dann NICHT keyen, sonst frisst der Flood-Fill (bg≈schwarz aus den
  // transparenten Ecken) die dunklen Outlines weg (Symbol wirkt weiß/ausgewaschen).
  LF.isTransparentBg = function (img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const pts = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]];
    let t = 0;
    for (const [x, y] of pts) if (ctx.getImageData(x, y, 1, 1).data[3] < 16) t++;
    return t >= 3;
  };

  LF.loadAssets = async function () {
    const C = LF.CONFIG;
    await Promise.all(
      C.SYMBOLS.map(
        (s) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              try {
                // Bereits transparente Exporte direkt nutzen; nur deckende Hintergründe keyen.
                const src = LF.isTransparentBg(img) ? img : LF.keyOutBackground(img);
                LF.textures[s.id] = PIXI.Texture.from(src);
                resolve();
              } catch (e) { reject(e); }
            };
            img.onerror = () => reject(new Error("load fail: " + s.tex));
            img.src = C.ASSET_PATH + s.tex + ".png";
          })
      )
    );
    await LF.loadSymbolAnims(); // Animations-Sheets (optional) nachladen
    await LF.loadUIAssets();    // Control-Bar-Bilder (aus dem Figma/HTML-Export)
    return LF.textures;
  };

  /* ============================================================
     UI-BILDER (Control-Bar) — echte PNGs aus dem Design-Export.
     LF.uiTextures[name] = PIXI.Texture. Fehlt eins -> still übersprungen.
     ============================================================ */
  LF.uiTextures = {};
  // Bild -> Textur laden (still scheitern -> resolve).
  function loadImgTexture(k, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { try { LF.uiTextures[k] = PIXI.Texture.from(img); } catch (e) {} resolve(LF.uiTextures[k] || null); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Menü-Overlay-Panels (volle Design-PNGs). NUR die tatsächlich verwendeten 6 — Buy/Info/
  // Paytable/Confirm-Dialoge rendern generierte Panels (hPanel), deren PNGs wurden nie genutzt
  // (4.26MB unnötiger Startup-Download -> entfernt). Diese 6 werden LAZY geladen (nicht blockierend):
  // Hintergrund-Prefetch im Splash-Gap + ensureOverlay() garantiert beim Menü-Öffnen.
  const OVERLAY_FILES = {
    ovSystem: "system", ovAutoplay: "autoplay", ovBet: "bet",
    ovRngOverview: "rng_overview", ovRngSeeds: "rng_seeds", ovRngVerify: "rng_verify",
  };
  LF._ovPromise = {};
  LF.ensureOverlay = function (key) {
    if (LF.uiTextures[key]) return Promise.resolve(LF.uiTextures[key]);
    if (LF._ovPromise[key]) return LF._ovPromise[key];
    const file = OVERLAY_FILES[key];
    if (!file) return Promise.resolve(null);
    LF._ovPromise[key] = loadImgTexture(key, "assets/ui/overlays/" + file + ".png");
    return LF._ovPromise[key];
  };
  // Nicht-blockierender Hintergrund-Warmup aller Menü-Overlays (nach dem Start aufrufen).
  LF.prefetchOverlays = function () { Object.keys(OVERLAY_FILES).forEach((k) => LF.ensureOverlay(k)); };

  LF.loadUIAssets = async function () {
    const files = {
      coin: "coin", sndOn: "snd_on", sndOff: "snd_off", help: "help", dice: "dice",
      clusterIdle: "cluster_idle", clusterStop: "cluster_stop",
    };
    // Icons + die 6 GENUTZTEN Menü-Overlays direkt beim Start laden (längerer Ladebalken,
    // dafür sofort scharf & bereit, keine Lazy-Verzögerung). Die 5 ungenutzten bleiben außen vor.
    await Promise.all([
      ...Object.keys(files).map((k) => loadImgTexture(k, "assets/ui/" + files[k] + ".png")),
      ...Object.keys(OVERLAY_FILES).map((k) => LF.ensureOverlay(k)),
    ]);
    return LF.uiTextures;
  };

  /* ============================================================
     SYMBOL-ANIMATIONEN — lädt die (transparenten) Spritesheets aus
     CONFIG.SYMBOL_ANIM und schneidet sie in Frame-Texturen.
     LF.symbolAnims[id] = { landing:[Texture...]|null, win:[Texture...]|null }
     Fehlt ein Sheet -> still null (Symbol bleibt statisch).
     ============================================================ */
  LF.symbolAnims = {};
  LF.loadSymbolAnims = async function () {
    const C = LF.CONFIG;
    const defs = (C && C.SYMBOL_ANIM) || {};
    const sliceSheet = (img, d) => {
      const base = PIXI.BaseTexture.from(img);
      const fw = img.naturalWidth / d.cols;
      const fh = img.naturalHeight / d.rows;
      const frames = [];
      for (let i = 0; i < d.frames; i++) {
        const cx = (i % d.cols) * fw;
        const cy = Math.floor(i / d.cols) * fh;
        frames.push(new PIXI.Texture(base, new PIXI.Rectangle(cx, cy, fw, fh)));
      }
      return frames;
    };
    const loadSheet = (url, d) =>
      new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { try { resolve(sliceSheet(img, d)); } catch (e) { resolve(null); } };
        img.onerror = () => resolve(null); // fehlendes Sheet -> Symbol bleibt statisch
        img.src = url;
      });

    await Promise.all(
      Object.keys(defs).map(async (id) => {
        const d = defs[id];
        const [landing, win] = await Promise.all([loadSheet(d.landing, d), loadSheet(d.win, d)]);
        LF.symbolAnims[id] = { landing, win };
      })
    );
    return LF.symbolAnims;
  };
})();
