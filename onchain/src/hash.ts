import { keccak_256 } from "@noble/hashes/sha3";

export function hashResult(payload: unknown): `0x${string}` {
  const json = JSON.stringify(payload, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
  return ("0x" + Buffer.from(keccak_256(new TextEncoder().encode(json))).toString("hex")) as `0x${string}`;
}
