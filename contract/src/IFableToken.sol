// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFableToken {
    function mintReward(address player, uint256 amount) external;
    function burnFrom(address player, uint256 amount) external;
}
