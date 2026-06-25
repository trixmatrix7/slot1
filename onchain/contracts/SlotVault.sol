// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ISlotVault } from "./ISlotVault.sol";

/// @title SlotVault
/// @notice House bankroll. LPs deposit native token and receive shares.
///         Only the configured SlotSpin contract can pull funds via `fund`.
contract SlotVault is ISlotVault {
    address public owner;
    address public spin;

    uint256 public totalShares;
    mapping(address => uint256) public shares;

    event Deposit (address indexed lp, uint256 amount, uint256 shares);
    event Withdraw(address indexed lp, uint256 amount, uint256 shares);
    event Funded  (uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlySpin () { require(msg.sender == spin,  "not spin");  _; }

    constructor() { owner = msg.sender; }

    function setSpin(address s) external onlyOwner { spin = s; }
    function transferOwnership(address a) external onlyOwner { owner = a; }

    // -------- LP --------

    function depositLP() external payable returns (uint256 minted) {
        require(msg.value > 0, "no value");
        uint256 supply = totalShares;
        uint256 bal    = address(this).balance - msg.value;
        minted = (supply == 0 || bal == 0) ? msg.value : (msg.value * supply) / bal;
        shares[msg.sender] += minted;
        totalShares        += minted;
        emit Deposit(msg.sender, msg.value, minted);
    }

    function withdrawLP(uint256 sharesAmount) external returns (uint256 amount) {
        require(sharesAmount > 0 && sharesAmount <= shares[msg.sender], "bad shares");
        amount = (sharesAmount * address(this).balance) / totalShares;
        shares[msg.sender] -= sharesAmount;
        totalShares        -= sharesAmount;
        (bool ok, ) = msg.sender.call{ value: amount }("");
        require(ok, "withdraw failed");
        emit Withdraw(msg.sender, amount, sharesAmount);
    }

    // -------- Spin contract --------

    function fund(uint256 amount) external onlySpin {
        require(amount <= address(this).balance, "insufficient");
        (bool ok, ) = spin.call{ value: amount }("");
        require(ok, "fund failed");
        emit Funded(amount);
    }

    function deposit() external payable {}

    receive() external payable {}
}
