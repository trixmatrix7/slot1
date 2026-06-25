# slot-onchain

**Nur On-Chain.** Keine Engine, keine Paylines, keine UI. Dieses Paket
verbindet einen externen (oder on-chain) Slot mit echten Transaktionen,
echtem Bankroll und echten Auszahlungen.

## Inhalt

```
contracts/
  SlotSpin.sol      Commit/Reveal Spin-Contract (Bets, Settle, Refund, 10.000x Cap)
  SlotVault.sol     House-Bankroll mit LP-Shares
  ISlotVault.sol    Interface
abi/
  SlotSpin.ts       ABI für Frontend / Oracle
  SlotVault.ts
src/
  types.ts          Mapping zu Solidity-Structs (SpinMode, Bet, ServerSeed, …)
  provableRng.ts    keccak256-basierte deterministische RNG (commit/reveal)
  hash.ts           Canonical resultHash für Off-Chain-Proofs
  spinClient.ts     EIP-1193 Client (commit, placeBet, settle, refund)
  index.ts
scripts/deploy.ts   Deploy-Reihenfolge
```

## Flow

```text
Oracle                          Player                       Contracts
  | --- commitServerSeed(H) ----------------------------> SlotSpin
  |                              | --- placeBet{value}() -> SlotSpin
  |                              |                         (Bet PLACED)
  | <-- listen BetPlaced --------|
  |
  |  computeSpin(serverSeed, clientSeed, betId, mode)
  |    -> { payout, resultHash }   // dein externes Engine
  |
  | --- settle(betId, seed, payout, resultHash) --------> SlotSpin
  |                                                       verify commit
  |                                                       enforce <= 10.000x
  |                                                       vault.fund() falls leer
  |                                                       transfer payout -> Player
  |                                                       emit BetSettled
```

Wenn der Oracle nicht innerhalb von `revealTimeout` (default 1h) settled,
kann der Spieler `refund(betId)` aufrufen und bekommt den vollen Einsatz
zurück.

## Mapping

`SpinMode` ↔ `Mode` Enum:

| TS                  | Solidity        |
|---------------------|-----------------|
| `BASE`              | `0`             |
| `FEATURE_BET`       | `1` (3x Bet)    |
| `BUY_FENTANYL`      | `2` (Bonus Buy) |
| `BUY_OVERDOSE`      | `3` (Bonus Buy) |

Der Contract kennt die Engine nicht — er prüft nur:
- Commitment stimmt (`keccak256(serverSeed) == commitment`)
- `payout <= bet * MAX_WIN_MULTIPLIER` (10.000x Hard-Cap)
- Status-Übergänge sauber

Korrektheit der `payout`-Berechnung wird über `resultHash` + veröffentlichten
`serverSeed` off-chain reproduzierbar gemacht (provably fair).

## Engine-Anbindung

Dein bestehender Slot ruft einfach:

```ts
import { SpinClient, SpinMode, deriveSeed, hashResult } from "slot-onchain";

// 1) Oracle backend
const seed = crypto.getRandomValues(new Uint8Array(32));
await client.commitServerSeed(hashServerSeed(seed));

// 2) Player UI
const tx = await client.placeBet({
  serverSeedId, clientSeed: Math.floor(Math.random() * 2**32),
  mode: SpinMode.BASE, valueWei: 10n ** 16n,
});

// 3) Oracle backend on BetPlaced:
const rng = deriveSeed(seed, clientSeed, betId);
const engineOut = mySlot.spin(rng, mode);            // <-- deine Engine
const resultHash = hashResult(engineOut);
await client.settle({ betId, serverSeed: "0x"+hex(seed),
  result: { betId, payout: engineOut.payoutWei, resultHash } });
```

## `encodeCall`

`spinClient.ts` enthält einen Platzhalter `encodeCall`. Verkable ihn mit
`viem.encodeFunctionData({ abi: SLOT_SPIN_ABI, ... })` oder
`ethers.Interface.encodeFunctionData(...)` — bewusst kein hard dependency,
damit du deinen eigenen Web3-Stack mitbringen kannst.
