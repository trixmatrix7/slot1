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
    // "Bounce/Settle" am Ende eines Falls
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  /* ---------- Promise-Delay (Browser-Timer, kein Date nötig) ---------- */
  LF.delay = (ms) => new Promise((res) => setTimeout(res, ms));

  /* ============================================================
     TWEEN — minimaler, Promise-basierter Tween über Pixi-Ticker.
     LF.tween.to(target, {x,y,alpha,...}, dauerMs, easeFn) -> Promise
     ============================================================ */
  LF.tween = {
    _items: [],
    to(target, props, duration, easeFn) {
      easeFn = easeFn || LF.ease.outQuad;
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
        for (const k in it.props) {
          it.target[k] = LF.lerp(it.from[k], it.props[k], e);
        }
        if (p >= 1) {
          this._items.splice(i, 1);
          it.resolve();
        }
      }
    },
    // Bricht laufende Tweens auf einem Target ab (ohne resolve-Sprung)
    killOf(target) {
      this._items = this._items.filter((it) => it.target !== target);
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
                const cv = LF.keyOutBackground(img);
                LF.textures[s.id] = PIXI.Texture.from(cv);
                resolve();
              } catch (e) { reject(e); }
            };
            img.onerror = () => reject(new Error("load fail: " + s.tex));
            img.src = C.ASSET_PATH + s.tex + ".png";
          })
      )
    );
    return LF.textures;
  };
})();
