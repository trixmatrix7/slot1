# On-Chain-Integration — Mapping & Go-Live

Diese Datei beschreibt, wie die On-Chain-Schicht **hinter** unserem bestehenden
Slot sitzt. **Wichtig: An Engine, Mathe, Grid, UI oder Design wurde NICHTS
geändert.** RTP, Cluster-Tumble, Free Spins, Bet-Level — alles bleibt 1:1.
Die On-Chain-Schicht ist rein additiv und **standardmäßig AUS**
(`LF.onchain.config.enabled === false`). Es ist **nichts deployed**.

## Was liegt wo

```
onchain/                         (Deploy-/Oracle-Seite, TypeScript — Node/Hardhat)
  contracts/SlotSpin.sol         commit/reveal, Bets, Settle, Refund, 10.000× Cap
  contracts/SlotVault.sol        House-Bankroll mit LP-Shares
  contracts/ISlotVault.sol
  abi/*.ts                       ABIs für Frontend/Oracle
  src/*.ts                       SDK: provableRng, hash, spinClient, types
  scripts/deploy.ts              Deploy-Reihenfolge (noch NICHT ausgeführt)

vendor/keccak256.js              Standalone Keccak-256 (== @noble/hashes), Browser+Node
src/onchain.js                   Browser-Bridge LF.onchain (spiegelt onchain/src byteweise)
```

`src/onchain.js` ist die Browser-Variante der TS-SDK (kein Bundler im Spiel).
Beide erzeugen für dieselben Seeds **byteweise identische** Boards — das ist die
Grundlage von provably-fair (Spieler-Anzeige == Oracle-Replay == On-Chain-Beweis).

## Mode-Mapping: UNSERE Modi → generische Contract-Slots

Der Contract (`SlotSpin.Mode`) ist **engine-agnostisch** — die 4 Enum-Werte sind
nur IDs; ihre Labels (`FEATURE_BET`, `BUY_FENTANYL`, `BUY_OVERDOSE`) stammen aus
einer **alten** Slot und binden uns nicht. Unsere echten Modi werden 1:1 abgebildet
(`LF.onchain.MODE`):

| Unser Slot                          | `LF.onchain.MODE` | Contract-Slot |
|-------------------------------------|-------------------|---------------|
| Basis-Spin                          | `BASE`            | `0`           |
| Boost-Spin (Einsatz ×3, Scatter ×3) | `BOOST`           | `1`           |
| Bonus-Kauf 3 Scatter (100×)         | `BUY3`            | `2`           |
| Bonus-Kauf 4 Scatter (200×)         | `BUY4`            | `3`           |

`LF.onchain.modeFor({ boostActive, buyScatters })` leitet den Mode aus dem
Engine-Zustand ab — **ohne** die Engine zu verändern.

## Cap-Abgleich

`SlotSpin.MAX_WIN_MULTIPLIER = 10_000` entspricht exakt unserem
`CONFIG.MAX_WIN_X = 10000`. Unser `engine._settleWin()` deckelt `totalX` bereits
auf `MAX_WIN_X`, daher gilt immer `payout ≤ amount × 10_000` — der Contract-Cap
wird nie verletzt. Kein Eingriff nötig.

## Provably-fair-Flow MIT unserer Engine

Die Engine zieht jeden Zufall ausschließlich über `this.rng`
(`random()`/`int()`/`weightedPick()`). `LF.onchain.ProvableRNG` ist ein
**Drop-in für `LF.RNG`**: es überschreibt nur `random()` (zieht aus einem
keccak-Stream), erbt `int()`/`weightedPick()` unverändert → **identische
Verteilung, identische RTP**, nur die Entropie-Quelle ist deterministisch.

```text
Oracle                          Spieler                      Contracts
  commitServerSeed(keccak(S)) ----------------------------> SlotSpin
                                placeBet{value}(seedId, clientSeed, mode) -> SlotSpin
  <-- BetPlaced(betId) ---------|
  seed = deriveSeed(S, clientSeed, betId)
  rng  = ()=> rngStream(seed)()/2^32
  X    = LF.Math.playSpinX(rng)            // UNSERE Mathe, unverändert
  payoutWei = toWei(X * stake)
  resultHash = hashResult({ betId, payout, ... })
  settle(betId, S, payoutWei, resultHash) ----------------> SlotSpin
                                                            verify keccak(S)==commit
                                                            enforce payout<=10.000×
                                                            vault.fund() falls leer
                                                            payout -> Spieler
```

Bleibt das Settle aus (`revealTimeout`, default 1h), ruft der Spieler
`refund(betId)` und bekommt den vollen Einsatz zurück.

## Go-Live (später — aktuell „chillen", nichts deployed)

1. **Deployen** (siehe `scripts/deploy.ts`): SlotVault → SlotSpin(oracle, vault) →
   `vault.setSpin(spin)` → Bankroll via `vault.depositLP{value}` → Oracle startet
   `commitServerSeed`.
2. **`src/onchain.js` konfigurieren**: `config.enabled = true`,
   `spinAddress`/`vaultAddress`/`oracleAddress` eintragen, `chainId` (BASE 8453 /
   Sepolia 84532) prüfen.
3. **Browser** — pro Spin den RNG tauschen (der EINZIGE Eingriff, ein Zeile):
   ```js
   // statt: const engine = new LF.Engine({ ..., rng: LF.rng });
   // im On-Chain-Modus pro Spin:
   engine.rng = LF.onchain.makeRNG(serverSeedBytes, clientSeed, betId);
   ```
   und den `LF.onchain.SpinClient` um `engine.spin()` legen (placeBet vor dem
   Spin, Anzeige nach BetSettled). Standardmäßig bleibt `rng = LF.rng`
   (Math.random) → Spiel unverändert.
4. **Oracle-Backend** (Node): nutzt `onchain/src` (viem/ethers + @noble) für
   `commit`/`settle`. Wegen byte-identischem keccak/deriveSeed produziert es
   exakt das Board, das der Spieler gesehen hat.

## Verifiziert (Node)

- `vendor/keccak256.js` == bekannte Keccak-Vektoren **und** == `@noble/hashes`
  auf 480 Eingaben (inkl. Multi-Block > 136 B).
- `LF.onchain.deriveSeed`/`rngStream` == TS-SDK byteweise.
- `ProvableRNG` deterministisch, `instanceof LF.RNG`, erbt `int`/`weightedPick`.
- ABI-Selektor korrekt (`transfer(address,uint256)` == `0xa9059cbb`).
- **RTP identisch**: `LF.Math.playSpinX` mit Math.random vs. provably-fair-Stream
  ergibt dieselbe Verteilung (Stream ist gleichverteilt, χ²-Test bestanden).
