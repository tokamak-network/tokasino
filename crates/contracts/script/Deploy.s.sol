// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/InstantDice.sol";
import "../src/CoinFlip.sol";
import "../src/Roulette.sol";
import "../src/Lottery.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        InstantDice dice = new InstantDice();
        CoinFlip coinFlip = new CoinFlip();
        Roulette roulette = new Roulette();
        Lottery lottery = new Lottery();

        // Fund house bankrolls (10 ETH each for instant games)
        dice.fundHouse{value: 10 ether}();
        coinFlip.fundHouse{value: 10 ether}();
        roulette.fundHouse{value: 10 ether}();

        console.log("InstantDice:", address(dice));
        console.log("CoinFlip:   ", address(coinFlip));
        console.log("Roulette:   ", address(roulette));
        console.log("Lottery:    ", address(lottery));

        vm.stopBroadcast();
    }
}
