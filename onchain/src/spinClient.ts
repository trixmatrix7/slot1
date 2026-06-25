/**
 * SpinClient — EIP-1193 client for the SlotSpin contract.
 *
 * The slot engine is your existing project's responsibility. This client
 * only handles the on-chain side: committing seeds, placing bets, listening
 * for settlement and triggering refunds.
 */
import { SpinMode, type SpinResult } from "./types";
import { SLOT_SPIN_ABI } from "../abi/SlotSpin";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface SpinClientOpts {
  provider: Eip1193Provider;
  spinAddress: `0x${string}`;
  account: `0x${string}`;
}

export class SpinClient {
  constructor(private readonly o: SpinClientOpts) {}

  /** Oracle-side: pre-commit a server seed. */
  async commitServerSeed(commitment: `0x${string}`): Promise<`0x${string}`> {
    return this.send("commitServerSeed", [commitment], 0n);
  }

  /** Player-side: place a bet. Returns tx hash; parse logs for betId. */
  async placeBet(args: {
    serverSeedId: bigint;
    clientSeed: number;
    mode: SpinMode;
    valueWei: bigint;
  }): Promise<`0x${string}`> {
    return this.send(
      "placeBet",
      [args.serverSeedId, args.clientSeed, args.mode],
      args.valueWei,
    );
  }

  /** Oracle-side: reveal + settle. Pulls payout from vault if needed. */
  async settle(args: {
    betId: bigint;
    serverSeed: `0x${string}`;
    result: SpinResult;
  }): Promise<`0x${string}`> {
    return this.send(
      "settle",
      [args.betId, args.serverSeed, args.result.payout, args.result.resultHash],
      0n,
    );
  }

  /** Player-side fallback if oracle disappeared. */
  async refund(betId: bigint): Promise<`0x${string}`> {
    return this.send("refund", [betId], 0n);
  }

  // -------- low-level --------

  private async send(fn: string, args: unknown[], value: bigint) {
    const data = encodeCall(fn, args);
    return (await this.o.provider.request({
      method: "eth_sendTransaction",
      params: [{
        from:  this.o.account,
        to:    this.o.spinAddress,
        data,
        value: "0x" + value.toString(16),
      }],
    })) as `0x${string}`;
  }
}

// Minimal ABI encoder shim. In production import viem/ethers and use their
// encoder. We keep this dependency-free so the SDK ships without bundling
// a whole web3 lib; the ABI JSON is exported separately.
function encodeCall(_fn: string, _args: unknown[]): `0x${string}` {
  throw new Error(
    "encodeCall: wire viem `encodeFunctionData({ abi: SLOT_SPIN_ABI, functionName, args })` " +
    "or ethers `Interface.encodeFunctionData` here. ABI is exported from ./abi/SlotSpin."
  );
}

export { SLOT_SPIN_ABI };
