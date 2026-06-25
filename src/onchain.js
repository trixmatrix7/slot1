/* ============================================================
   onchain.js — Browser-Bridge zur On-Chain-Schicht (LF.onchain).

   WICHTIG: Rein ADDITIV und standardmäßig AUS. Diese Datei verändert das
   Spiel nicht — sie definiert nur LF.onchain.* und greift NICHT in Engine,
   Math, Grid oder UI ein. Solange `LF.onchain.config.enabled === false`
   (Default) läuft der Slot exakt wie bisher (LF.rng = Math.random).

   Sie spiegelt die TypeScript-SDK in onchain/src byteweise, damit Browser
   (Spieler-Anzeige) und Off-Chain-Oracle (Node) für dieselben Seeds das
   IDENTISCHE Board berechnen -> provably fair.

   Go-Live (später, wenn die Contracts deployed sind) ist EIN Schritt:
   pro Spin LF.rng durch LF.onchain.makeRNG(serverSeed, clientSeed, betId)
   ersetzen und den SpinClient um spin()/settle() legen. Siehe onchain/INTEGRATION.md.
   ============================================================ */
(function () {
  const root = typeof window !== "undefined" ? window : globalThis;
  const LF = (root.LF = root.LF || {});

  // keccak256 (vendor/keccak256.js) — Node: nachladen.
  let keccak256 = LF.keccak256, keccak256hex = LF.keccak256hex;
  if (!keccak256 && typeof require !== "undefined") {
    try { const k = require("../vendor/keccak256.js"); keccak256 = k.keccak256; keccak256hex = k.keccak256hex; } catch (e) {}
  }

  const O = {};

  /* ---------------- Konfiguration (Default: AUS, nichts deployed) ---------------- */
  O.config = {
    enabled: false,            // Master-Schalter. false -> Spiel unverändert, kein On-Chain.
    chainId: 8453,             // BASE Mainnet (Testnet BASE Sepolia: 84532)
    decimals: 18,              // native Token-Dezimalstellen (ETH auf BASE)
    spinAddress: null,         // SlotSpin-Contract — nach Deploy hier eintragen
    vaultAddress: null,        // SlotVault-Contract
    oracleAddress: null,       // Oracle (signiert/settled Spins)
    revealTimeoutSec: 3600,    // muss SlotSpin.revealTimeout entsprechen (Refund-Fenster)
    maxWinMultiplier: 10000n,  // Hard-Cap im Contract (== unser C.MAX_WIN_X)
  };

  /* ---------------- Mode-Mapping: UNSERE Slot-Modi -> generische Contract-Slots ----
     Der Contract (SlotSpin.Mode) ist engine-agnostisch — die 4 Enum-Werte sind nur
     IDs. Die Labels (FEATURE_BET/BUY_FENTANYL/BUY_OVERDOSE) stammen aus einer alten
     Slot und binden uns NICHT. Wir bilden unsere echten Modi 1:1 darauf ab: */
  O.MODE = {
    BASE: 0,   // normaler Spin
    BOOST: 1,  // Boost-Spin (Einsatz ×3, Scatter ×3)  -> Contract-Slot 1
    BUY3: 2,   // Bonus-Kauf 3 Scatter (100×)          -> Contract-Slot 2
    BUY4: 3,   // Bonus-Kauf 4 Scatter (200×)          -> Contract-Slot 3
  };
  // Aus Engine-Zustand den Mode ableiten (verändert die Engine NICHT).
  O.modeFor = function (opts) {
    opts = opts || {};
    if (opts.buyScatters === 4) return O.MODE.BUY4;
    if (opts.buyScatters === 3) return O.MODE.BUY3;
    if (opts.boostActive) return O.MODE.BOOST;
    return O.MODE.BASE;
  };

  /* ---------------- Beträge <-> Wei (fixed-point, keine Float-Drift) ----------------
     Spiel rechnet in Währungseinheiten (z.B. 0.20). On-Chain in Wei (10^decimals).
     8 Nachkommastellen Präzision reichen für alle Bet-Level/Wins. */
  O.toWei = function (amount, decimals) {
    decimals = decimals == null ? O.config.decimals : decimals;
    const scaled = BigInt(Math.round(Number(amount) * 1e8));        // 8 Dezimalstellen
    const factor = 10n ** BigInt(Math.max(0, decimals - 8));
    return scaled * factor;
  };
  O.fromWei = function (wei, decimals) {
    decimals = decimals == null ? O.config.decimals : decimals;
    const factor = 10n ** BigInt(decimals);
    const w = BigInt(wei);
    const whole = w / factor, frac = w % factor;
    return Number(whole) + Number(frac) / Number(factor);
  };

  /* ====================== PROVABLY-FAIR (Spiegel von onchain/src) ====================== */

  // keccak256(serverSeed) -> Commitment-Hex (== hashServerSeed in der SDK)
  O.hashServerSeed = function (serverSeed) { return keccak256hex(serverSeed); };

  // deriveSeed(serverSeed, clientSeed, nonce) — Byte-Layout EXAKT wie src/provableRng.ts:
  // serverSeed || uint32-BE(clientSeed) || uint64-BE(nonce), dann keccak256.
  O.deriveSeed = function (serverSeed, clientSeed, nonce) {
    const ss = serverSeed instanceof Uint8Array ? serverSeed : keccak256(serverSeed); // erlaubt Bytes
    const buf = new Uint8Array(ss.length + 4 + 8);
    buf.set(ss, 0);
    const dv = new DataView(buf.buffer);
    dv.setUint32(ss.length, clientSeed >>> 0);          // big-endian (Default), wie SDK
    dv.setBigUint64(ss.length + 4, BigInt(nonce));       // big-endian (Default), wie SDK
    return keccak256(buf);
  };

  // rngStream(seed) -> () => uint32  (keccak-Verkettung, EXAKT wie src/provableRng.ts)
  O.rngStream = function (seed) {
    let state = seed, offset = 32;
    return function () {
      if (offset >= 32) { state = keccak256(state); offset = 0; }
      const v =
        (state[offset] << 24) |
        (state[offset + 1] << 16) |
        (state[offset + 2] << 8) |
        (state[offset + 3]);
      offset += 4;
      return v >>> 0;
    };
  };

  // hashResult(payload) — canonical resultHash (== src/hash.ts): JSON mit bigint->string.
  O.hashResult = function (payload) {
    const json = JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    return keccak256hex(json);
  };

  /* ---------------- ProvableRNG: DROP-IN für LF.RNG ----------------
     Überschreibt NUR random() (zieht aus dem keccak-Stream). int()/weightedPick()
     werden von LF.RNG geerbt -> die Engine verhält sich identisch, nur die
     Entropie-Quelle ist deterministisch (commit/reveal) statt Math.random.
     Wird NUR im On-Chain-Modus per makeRNG() erzeugt; der Default-Slot nutzt
     weiterhin new LF.RNG() (Math.random) -> Spins unverändert. */
  const Base = LF.RNG || function () {};
  function ProvableRNG(serverSeed, clientSeed, nonce) {
    // Stream aus dem abgeleiteten Seed
    this._next = O.rngStream(O.deriveSeed(serverSeed, clientSeed, nonce));
  }
  ProvableRNG.prototype = Object.create(Base.prototype || Object.prototype);
  ProvableRNG.prototype.constructor = ProvableRNG;
  ProvableRNG.prototype.random = function () { return this._next() / 4294967296; }; // [0,1)
  // Falls LF.RNG (noch) nicht geladen ist: int/weightedPick als Fallback definieren,
  // identisch zur core.js-Implementierung (damit Replay auch standalone stimmt).
  if (!Base.prototype || typeof Base.prototype.int !== "function") {
    ProvableRNG.prototype.int = function (n) { return Math.floor(this.random() * n); };
    ProvableRNG.prototype.weightedPick = function (items) {
      let total = 0; for (const it of items) total += it.weight;
      let r = this.random() * total;
      for (const it of items) { r -= it.weight; if (r < 0) return it; }
      return items[items.length - 1];
    };
  }
  O.ProvableRNG = ProvableRNG;
  O.makeRNG = function (serverSeed, clientSeed, nonce) { return new ProvableRNG(serverSeed, clientSeed, nonce); };

  /* ====================== ABI-ENCODING + EIP-1193-CLIENT ====================== */

  const encUint = (v) => { const b = BigInt(v); if (b < 0n) throw new Error("uint<0"); return b.toString(16).padStart(64, "0"); };
  const encBytes32 = (v) => { const h = (String(v).startsWith("0x") ? String(v).slice(2) : String(v)).toLowerCase(); if (h.length !== 64) throw new Error("bytes32 len"); return h; };
  const encAddress = (v) => { const h = String(v).slice(2).toLowerCase(); if (h.length !== 40) throw new Error("address len"); return h.padStart(64, "0"); };

  // selector(sig) = keccak256(sig)[0..4]
  O.selector = function (sig) { return "0x" + keccak256hex(sig).slice(2, 10); };

  // encodeCall("fn(types...)", [{t,v}...]) -> calldata-Hex. Alle Args sind statisch.
  O.encodeCall = function (sig, parts) {
    let data = keccak256hex(sig).slice(2, 10);
    for (const p of parts || []) {
      if (p.t === "bytes32") data += encBytes32(p.v);
      else if (p.t === "address") data += encAddress(p.v);
      else data += encUint(p.v); // uint8/uint32/uint64/uint128/uint256
    }
    return "0x" + data;
  };

  // SpinClient — analog onchain/src/spinClient.ts, aber mit echtem Encoder.
  function SpinClient(opts) {
    this.provider = opts.provider;                         // EIP-1193 (window.ethereum)
    this.spin = opts.spinAddress || O.config.spinAddress;
    this.vault = opts.vaultAddress || O.config.vaultAddress;
    this.account = opts.account;
  }
  SpinClient.prototype._send = async function (to, data, valueWei) {
    return this.provider.request({
      method: "eth_sendTransaction",
      params: [{ from: this.account, to, data, value: "0x" + (valueWei || 0n).toString(16) }],
    });
  };
  // Oracle: Server-Seed committen
  SpinClient.prototype.commitServerSeed = function (commitmentHex) {
    return this._send(this.spin, O.encodeCall("commitServerSeed(bytes32)", [{ t: "bytes32", v: commitmentHex }]), 0n);
  };
  // Spieler: Einsatz platzieren (value = Einsatz in Wei)
  SpinClient.prototype.placeBet = function (serverSeedId, clientSeed, mode, valueWei) {
    return this._send(this.spin, O.encodeCall("placeBet(uint64,uint32,uint8)", [
      { t: "uint64", v: serverSeedId }, { t: "uint32", v: clientSeed >>> 0 }, { t: "uint8", v: mode },
    ]), valueWei);
  };
  // Oracle: reveal + settle (payout in Wei, resultHash aus hashResult)
  SpinClient.prototype.settle = function (betId, serverSeedHex, payoutWei, resultHashHex) {
    return this._send(this.spin, O.encodeCall("settle(uint64,bytes32,uint128,bytes32)", [
      { t: "uint64", v: betId }, { t: "bytes32", v: serverSeedHex }, { t: "uint128", v: payoutWei }, { t: "bytes32", v: resultHashHex },
    ]), 0n);
  };
  // Spieler: Refund falls Oracle nicht settled
  SpinClient.prototype.refund = function (betId) {
    return this._send(this.spin, O.encodeCall("refund(uint64)", [{ t: "uint64", v: betId }]), 0n);
  };
  O.SpinClient = SpinClient;

  // betId aus BetPlaced-Log ziehen (topic0 = keccak der Event-Signatur, betId = topic1).
  O.BET_PLACED_TOPIC = keccak256hex("BetPlaced(uint64,address,uint128,uint8,uint64,uint32)");
  O.parseBetId = function (receiptLogs) {
    for (const log of receiptLogs || []) {
      if (log.topics && log.topics[0] && log.topics[0].toLowerCase() === O.BET_PLACED_TOPIC) {
        return BigInt(log.topics[1]);
      }
    }
    return null;
  };

  LF.onchain = O;
  if (typeof module !== "undefined" && module.exports) module.exports = O;
})();
