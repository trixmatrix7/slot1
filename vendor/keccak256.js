/* ============================================================
   keccak256.js — eigenständiges Keccak-256 (Ethereum-Variante, 0x01-Padding).
   Kein NPM/Bundler nötig. Dual-Env: Browser (window.LF.keccak256) + Node (module.exports).

   Entspricht @noble/hashes `keccak_256` (das die TS-SDK on der Oracle-Seite nutzt) ->
   damit Browser-Anzeige und Off-Chain-Replay byteweise identisch hashen (provably fair).

   API:
     LF.keccak256(input)    -> Uint8Array(32)   input: Uint8Array | "0x..."-Hex | UTF-8-String
     LF.keccak256hex(input) -> "0x...".          (64 Hex-Zeichen)
   ============================================================ */
(function () {
  const root = typeof window !== "undefined" ? window : globalThis;
  const LF = (root.LF = root.LF || {});

  const MASK = (1n << 64n) - 1n;

  // Runden-Konstanten (ι) als 64-bit BigInts
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808An, 0x8000000080008000n,
    0x000000000000808Bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008An, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000An,
    0x000000008000808Bn, 0x800000000000008Bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800An, 0x800000008000000An,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];

  // Rotations-Offsets ρ, indexiert [x][y]
  const ROT = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
  ];

  const idx = (x, y) => x + 5 * y;
  const rotl = (v, n) => (n === 0 ? v : (((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK));

  function keccakF(A) {
    for (let round = 0; round < 24; round++) {
      // θ
      const C = new Array(5);
      for (let x = 0; x < 5; x++) {
        C[x] = A[idx(x, 0)] ^ A[idx(x, 1)] ^ A[idx(x, 2)] ^ A[idx(x, 3)] ^ A[idx(x, 4)];
      }
      const D = new Array(5);
      for (let x = 0; x < 5; x++) {
        D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) A[idx(x, y)] ^= D[x];
      }

      // ρ + π
      const B = new Array(25).fill(0n);
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          B[idx(y, (2 * x + 3 * y) % 5)] = rotl(A[idx(x, y)], ROT[x][y]);
        }
      }

      // χ
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          A[idx(x, y)] = B[idx(x, y)] ^ ((~B[idx((x + 1) % 5, y)] & MASK) & B[idx((x + 2) % 5, y)]);
        }
      }

      // ι
      A[0] ^= RC[round];
    }
    return A;
  }

  // ---- Eingabe-Normalisierung -> Uint8Array ----
  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof input === "string") {
      if (/^0x[0-9a-fA-F]*$/.test(input)) {
        const hex = input.slice(2);
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        return out;
      }
      // UTF-8
      if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(input);
      return Uint8Array.from(Buffer.from(input, "utf8"));
    }
    if (input && input.buffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error("keccak256: unsupported input");
  }

  function keccak256(input) {
    const msg = toBytes(input);
    const rate = 136; // keccak256: rate 1088 bit = 136 Byte (capacity 512)
    const len = msg.length;
    const padLen = rate - (len % rate); // 1..rate
    const padded = new Uint8Array(len + padLen);
    padded.set(msg, 0);
    padded[len] ^= 0x01;                 // Keccak-Domain (Start)
    padded[padded.length - 1] ^= 0x80;   // Ende (kombiniert zu 0x81 falls gleiches Byte)

    let A = new Array(25).fill(0n);
    for (let off = 0; off < padded.length; off += rate) {
      for (let i = 0; i < rate / 8; i++) { // 17 Lanes pro Block
        let lane = 0n;
        for (let b = 0; b < 8; b++) lane |= BigInt(padded[off + i * 8 + b]) << (8n * BigInt(b));
        A[i] ^= lane;
      }
      A = keccakF(A);
    }

    const out = new Uint8Array(32); // 4 Lanes = 32 Byte (little-endian)
    for (let i = 0; i < 4; i++) {
      let lane = A[i];
      for (let b = 0; b < 8; b++) out[i * 8 + b] = Number((lane >> (8n * BigInt(b))) & 0xffn);
    }
    return out;
  }

  function keccak256hex(input) {
    const b = keccak256(input);
    let s = "0x";
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }

  LF.keccak256 = keccak256;
  LF.keccak256hex = keccak256hex;

  if (typeof module !== "undefined" && module.exports) module.exports = { keccak256, keccak256hex };
})();
