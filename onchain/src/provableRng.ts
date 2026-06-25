import { keccak_256 } from "@noble/hashes/sha3";

/** Deterministic commit/reveal RNG: keccak256(serverSeed || clientSeed || nonce). */
export function hashServerSeed(serverSeed: Uint8Array): `0x${string}` {
  return ("0x" + Buffer.from(keccak_256(serverSeed)).toString("hex")) as `0x${string}`;
}

export function deriveSeed(
  serverSeed: Uint8Array,
  clientSeed: number,
  nonce: bigint,
): Uint8Array {
  const buf = new Uint8Array(serverSeed.length + 4 + 8);
  buf.set(serverSeed, 0);
  new DataView(buf.buffer).setUint32(serverSeed.length, clientSeed >>> 0);
  new DataView(buf.buffer).setBigUint64(serverSeed.length + 4, nonce);
  return keccak_256(buf);
}

/** Stream of 32-bit words from a seed via keccak256 chaining. */
export function rngStream(seed: Uint8Array): () => number {
  let state = seed;
  let offset = 32;
  return () => {
    if (offset >= 32) { state = keccak_256(state); offset = 0; }
    const v =
      (state[offset] << 24) |
      (state[offset+1] << 16) |
      (state[offset+2] << 8)  |
      (state[offset+3]);
    offset += 4;
    return v >>> 0;
  };
}
