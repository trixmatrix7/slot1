// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISlotVault {
    function fund(uint256 amount) external;
    function deposit() external payable;
}
