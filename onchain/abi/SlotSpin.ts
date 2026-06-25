export const SLOT_SPIN_ABI = [
  { type: "function", name: "MAX_WIN_MULTIPLIER", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "commitServerSeed",   stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [{ name: "id", type: "uint64" }] },
  { type: "function", name: "placeBet",           stateMutability: "payable",
    inputs: [
      { name: "serverSeedId", type: "uint64" },
      { name: "clientSeed",   type: "uint32" },
      { name: "mode",         type: "uint8"  },
    ],
    outputs: [{ name: "betId", type: "uint64" }] },
  { type: "function", name: "settle",             stateMutability: "nonpayable",
    inputs: [
      { name: "betId",      type: "uint64"  },
      { name: "serverSeed", type: "bytes32" },
      { name: "payout",     type: "uint128" },
      { name: "resultHash", type: "bytes32" },
    ], outputs: [] },
  { type: "function", name: "refund", stateMutability: "nonpayable",
    inputs: [{ name: "betId", type: "uint64" }], outputs: [] },

  { type: "event", name: "ServerSeedCommitted", inputs: [
    { name: "id", type: "uint64", indexed: true },
    { name: "commitment", type: "bytes32" }] },
  { type: "event", name: "ServerSeedRevealed", inputs: [
    { name: "id", type: "uint64", indexed: true },
    { name: "seed", type: "bytes32" }] },
  { type: "event", name: "BetPlaced", inputs: [
    { name: "betId", type: "uint64", indexed: true },
    { name: "player", type: "address", indexed: true },
    { name: "amount", type: "uint128" },
    { name: "mode", type: "uint8" },
    { name: "serverSeedId", type: "uint64" },
    { name: "clientSeed", type: "uint32" }] },
  { type: "event", name: "BetSettled", inputs: [
    { name: "betId", type: "uint64", indexed: true },
    { name: "payout", type: "uint128" },
    { name: "resultHash", type: "bytes32" }] },
  { type: "event", name: "BetRefunded", inputs: [
    { name: "betId", type: "uint64", indexed: true },
    { name: "amount", type: "uint128" }] },
] as const;
