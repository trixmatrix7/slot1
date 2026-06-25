// On-chain mapping types — match SlotSpin.sol exactly.

export enum SpinMode {
  BASE          = 0,
  FEATURE_BET   = 1,
  BUY_FENTANYL  = 2,
  BUY_OVERDOSE  = 3,
}

export enum SpinStatus {
  NONE      = 0,
  COMMITTED = 1,
  PLACED    = 2,
  SETTLED   = 3,
  REFUNDED  = 4,
}

export interface Bet {
  player: `0x${string}`;
  amount: bigint;
  payout: bigint;
  placedAt: bigint;
  serverSeedId: bigint;
  clientSeed: number;
  mode: SpinMode;
  status: SpinStatus;
}

export interface ServerSeed {
  commitment: `0x${string}`;
  revealed:   `0x${string}`;
  createdAt:  bigint;
  revealedAt: bigint;
  used: boolean;
}

/** Output the off-chain engine produces and the oracle signs / submits. */
export interface SpinResult {
  betId: bigint;
  payout: bigint;          // in wei / base units
  resultHash: `0x${string}`; // keccak256 of canonical engine output
}

export const MAX_WIN_MULTIPLIER = 10_000n;
