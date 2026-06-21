# slot1 — Tumble Slot (Pixi.js)

Ein 6×5 **Tumble / Scatter-Pays** Slot mit Free-Spins-Feature, gebaut in
**Pixi.js**. Reines Frontend (HTML/JS/CSS) — bereit für statisches Hosting
(Vercel) und für späteren **On-Chain-Betrieb auf BASE** (austauschbare RNG).

## Features

- **6×5 Raster, Tumble/Cascade:** Gewinn-Symbole verschwinden, neue fallen nach, erneut werten.
- **Scatter-Pays:** ein Symbol zahlt nach Anzahl im Raster (Position egal), Wild zählt mit.
- **Free Spins:** 3 Scatter → 10 Spins, 4 Scatter → 15 Spins. Multiplikator **+1 pro Connection**, bleibt das ganze Feature bestehen, oben mittig sichtbar.
- **Scatter im Feature:** droppen auch beim Nachrutschen rein → **2 Scatter +2 Spins, 3 Scatter +4 Spins**.
- **Bonus-Kauf-Menü (3 Cards):** 3-Scatter-Feature (100×), 4-Scatter-Feature (200×), Boost „3× Scatter-Chance" (Einsatz ×3/Spin).
- **RTP ~96%**, Max-Win-Cap 10.000× — komplett **config-getrieben** und per Simulator nachprüfbar.
- Natives Pixel-Rendering (gestochen scharf), responsives 16:9-Layout.

## Lokal starten

```bash
node server.js        # -> http://localhost:8080
```
oder unter Windows einfach `start.bat` doppelklicken (öffnet Browser + Server).

> Über einen Server laufen lassen, nicht per `file://` öffnen — die Symbol-Bilder
> werden zur Laufzeit geladen und freigestellt (Canvas), das braucht http(s).

## Deployment (Vercel)

Statische Seite ohne Build-Schritt. Auf Vercel:
1. **Add New → Project → Import** dieses GitHub-Repo.
2. Framework **Other**, kein Build Command, Output Directory **`./`**.
3. **Deploy** — fertig. Jeder Push deployt automatisch neu.

## Projektstruktur

```
index.html         Einstieg (16:9-Bühne) + Script-Einbindung
styles.css         Layout + #bg (Hintergrundbild)
vendor/pixi.min.js Pixi.js v7 (lokal, kein CDN nötig)
assets/            background.jpg + symbols/*.png (eigene Artworks)
src/
  config.js        ALLE Parameter (Raster, Symbole, Paytable, Free Spins, Buy, RTP)
  core.js          Utils, Tween, RNG (austauschbar für On-Chain), Asset-Loader
  math.js          Reine Spiellogik (Browser + Node) — identisch zum Simulator
  grid.js          Symbol-Sprites + Tumble-Logik
  engine.js        Spielablauf-Statemachine + Animation
  ui.js            Rahmen, Control-Bar, Buy-Menü, Free-Spins-HUD, Overlays
  main.js          Bootstrap + Verdrahtung + Resize
```

## RTP / Math-Tools (Node)

Spiel und Simulator nutzen **dieselbe** Logik (`src/math.js`), der gemessene RTP
gilt also 1:1 fürs Spiel.

```bash
node simfast.js 25000000 0.18    # schneller Integer-Sim: RTP @ PAY_SCALE
node sim.js 1000000              # ausführliche Statistik (Hit-Rate, Verteilung)
```

Alle Stellschrauben in `src/config.js`: `SYMBOLS[].pays`, `FREESPINS`, `BUY`,
`PAY_SCALE` (RTP-Feinregler), `MAX_WIN_X`.

## On-Chain / BASE — Fahrplan

Das Rendering (Pixi) läuft im Frontend, die Spiellogik ist deterministisch aus
der RNG ableitbar. Für provably-fair Betrieb:

- **`src/core.js → RNG`** ist die einzige Zufallsquelle → ersetzen durch
  commit-reveal-Seed aus einem Solidity-Contract auf BASE oder Chainlink VRF.
- Resultat (Seed + Ausgang) on-chain festschreiben, Auszahlung via Smart-Contract,
  Frontend zeigt nur die Animation.
