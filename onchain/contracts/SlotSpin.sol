// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ISlotVault } from "./ISlotVault.sol";

/// @title SlotSpin
/// @notice Commit/reveal slot spin contract. The game engine lives off-chain
///         (or in a verifier contract); this contract handles bets, seeds,
///         settlement and payouts. The contract is engine-agnostic: it trusts
///         a signed result from `oracle` (or, if you wire one in, an
///         on-chain verifier). Payout is capped at MAX_WIN_MULTIPLIER * bet.
contract SlotSpin {
    uint256 public constant MAX_WIN_MULTIPLIER = 10_000; // 10.000x hard cap

    enum Mode {
        BASE,           // normal spin
        FEATURE_BET,    // 3x bet, boosted scatter chance
        BUY_FENTANYL,   // bonus buy: Fentanyl Spins
        BUY_OVERDOSE    // bonus buy: Overdose Spins
    }

    enum Status { NONE, COMMITTED, PLACED, SETTLED, REFUNDED }

    struct Bet {
        address player;
        uint128 amount;        // bet amount in wei (or token base units)
        uint128 payout;        // payout in same unit, filled on settle
        uint64  placedAt;      // block.timestamp
        uint64  serverSeedId;  // links to commitment
        uint32  clientSeed;    // player-supplied entropy
        Mode    mode;
        Status  status;
    }

    struct ServerSeed {
        bytes32 commitment;    // keccak256(serverSeed)
        bytes32 revealed;      // set on reveal
        uint64  createdAt;
        uint64  revealedAt;
        bool    used;
    }

    address public owner;
    address public oracle;     // signs spin results, or address(0) if verifier-only
    ISlotVault public vault;

    uint64  public nextServerSeedId = 1;
    uint64  public nextBetId = 1;
    uint256 public revealTimeout = 1 hours; // refund window if oracle never reveals

    mapping(uint64 => ServerSeed) public serverSeeds;
    mapping(uint64 => Bet)        public bets;

    event ServerSeedCommitted(uint64 indexed id, bytes32 commitment);
    event ServerSeedRevealed (uint64 indexed id, bytes32 seed);
    event BetPlaced  (uint64 indexed betId, address indexed player, uint128 amount, Mode mode, uint64 serverSeedId, uint32 clientSeed);
    event BetSettled (uint64 indexed betId, uint128 payout, bytes32 resultHash);
    event BetRefunded(uint64 indexed betId, uint128 amount);

    modifier onlyOwner()  { require(msg.sender == owner,  "not owner");  _; }
    modifier onlyOracle() { require(msg.sender == oracle, "not oracle"); _; }

    constructor(address _oracle, ISlotVault _vault) {
        owner  = msg.sender;
        oracle = _oracle;
        vault  = _vault;
    }

    // -------- admin --------

    function setOracle(address a) external onlyOwner { oracle = a; }
    function setVault(ISlotVault v) external onlyOwner { vault = v; }
    function setRevealTimeout(uint256 t) external onlyOwner { revealTimeout = t; }
    function transferOwnership(address a) external onlyOwner { owner = a; }

    // -------- commit / reveal --------

    /// @notice Oracle pre-commits to a server seed. Many seeds can be queued.
    function commitServerSeed(bytes32 commitment) external onlyOracle returns (uint64 id) {
        id = nextServerSeedId++;
        serverSeeds[id] = ServerSeed({
            commitment: commitment,
            revealed:   bytes32(0),
            createdAt:  uint64(block.timestamp),
            revealedAt: 0,
            used:       false
        });
        emit ServerSeedCommitted(id, commitment);
    }

    // -------- player flow --------

    /// @notice Player places a bet against a committed server seed.
    ///         Funds are pulled from the player and held by this contract
    ///         until settlement or refund.
    function placeBet(uint64 serverSeedId, uint32 clientSeed, Mode mode)
        external
        payable
        returns (uint64 betId)
    {
        ServerSeed storage s = serverSeeds[serverSeedId];
        require(s.commitment != bytes32(0), "unknown seed");
        require(s.revealed   == bytes32(0), "seed already revealed");
        require(!s.used,                    "seed already used");
        require(msg.value > 0,              "no bet");

        s.used = true;

        betId = nextBetId++;
        bets[betId] = Bet({
            player:       msg.sender,
            amount:       uint128(msg.value),
            payout:       0,
            placedAt:     uint64(block.timestamp),
            serverSeedId: serverSeedId,
            clientSeed:   clientSeed,
            mode:         mode,
            status:       Status.PLACED
        });

        emit BetPlaced(betId, msg.sender, uint128(msg.value), mode, serverSeedId, clientSeed);
    }

    /// @notice Oracle reveals the server seed and settles the bet with the
    ///         engine-computed payout. The contract verifies the commitment
    ///         and enforces the 10.000x cap; correctness of `payout` vs the
    ///         engine output is anchored by `resultHash` for off-chain proof.
    function settle(uint64 betId, bytes32 serverSeed, uint128 payout, bytes32 resultHash)
        external
        onlyOracle
    {
        Bet storage b = bets[betId];
        require(b.status == Status.PLACED, "bad status");

        ServerSeed storage s = serverSeeds[b.serverSeedId];
        require(keccak256(abi.encodePacked(serverSeed)) == s.commitment, "bad reveal");

        if (s.revealed == bytes32(0)) {
            s.revealed   = serverSeed;
            s.revealedAt = uint64(block.timestamp);
            emit ServerSeedRevealed(b.serverSeedId, serverSeed);
        }

        uint256 cap = uint256(b.amount) * MAX_WIN_MULTIPLIER;
        require(uint256(payout) <= cap, "payout > cap");

        b.payout = payout;
        b.status = Status.SETTLED;

        if (payout > 0) {
            // vault tops up if contract balance is short
            uint256 bal = address(this).balance;
            if (bal < payout) vault.fund(payout - bal);
            (bool ok, ) = b.player.call{ value: payout }("");
            require(ok, "payout failed");
        }
        // House edge: any leftover bet stays in this contract and is
        // periodically swept to the vault via `sweepToVault`.

        emit BetSettled(betId, payout, resultHash);
    }

    /// @notice If the oracle never reveals within `revealTimeout`, the
    ///         player can reclaim their full stake.
    function refund(uint64 betId) external {
        Bet storage b = bets[betId];
        require(b.status == Status.PLACED, "bad status");
        require(block.timestamp >= b.placedAt + revealTimeout, "too early");

        b.status = Status.REFUNDED;
        (bool ok, ) = b.player.call{ value: b.amount }("");
        require(ok, "refund failed");
        emit BetRefunded(betId, b.amount);
    }

    // -------- vault sweep --------

    function sweepToVault(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "insufficient");
        vault.deposit{ value: amount }();
    }

    receive() external payable {}
}
