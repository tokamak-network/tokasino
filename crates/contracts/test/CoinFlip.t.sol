// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/CoinFlip.sol";

contract CoinFlipTest is Test {
    CoinFlip public game;
    address public player = address(0xBEEF);

    function setUp() public {
        game = new CoinFlip();
        game.fundHouse{value: 100 ether}();
        vm.deal(player, 10 ether);
    }

    function test_flipHeads() public {
        vm.prevrandao(bytes32(uint256(42)));
        vm.prank(player);
        // Determine expected result
        bytes32 seed = keccak256(abi.encodePacked(bytes32(uint256(42)), block.number, player, uint256(0)));
        bool expectedHeads = uint256(seed) % 2 == 0;

        (uint256 gameId, bool resultHeads, bool won,) = game.flip{value: 0.01 ether}(expectedHeads);
        assertEq(gameId, 0);
        assertEq(resultHeads, expectedHeads);
        assertTrue(won);
    }

    function test_flipPayout() public {
        vm.prevrandao(bytes32(uint256(42)));
        bytes32 seed = keccak256(abi.encodePacked(bytes32(uint256(42)), block.number, player, uint256(0)));
        bool expectedHeads = uint256(seed) % 2 == 0;

        uint256 balBefore = player.balance;
        vm.prank(player);
        (, , bool won, uint256 payout) = game.flip{value: 0.1 ether}(expectedHeads);
        assertTrue(won);
        // 0.1 * 195 / 100 = 0.195 ETH payout
        assertEq(payout, 0.195 ether);
        assertEq(player.balance, balBefore - 0.1 ether + payout);
    }

    function test_revertBetTooSmall() public {
        vm.prank(player);
        vm.expectRevert(CoinFlip.BetTooSmall.selector);
        game.flip{value: 0.0001 ether}(true);
    }

    function test_revertBetTooLarge() public {
        vm.prank(player);
        vm.expectRevert(CoinFlip.BetTooLarge.selector);
        game.flip{value: 2 ether}(true);
    }

    function test_stats() public {
        vm.prevrandao(bytes32(uint256(42)));
        vm.prank(player);
        game.flip{value: 0.01 ether}(true);

        assertEq(game.totalGamesPlayed(), 1);
        assertEq(game.totalWagered(), 0.01 ether);
        assertEq(game.totalGames(), 1);

        uint256[] memory ids = game.getPlayerGames(player);
        assertEq(ids.length, 1);
        assertEq(ids[0], 0);
    }

    function test_houseBalance() public {
        assertEq(game.houseBalance(), 100 ether);
    }

    function testFuzz_flipDoesNotRevert(bool choice, uint256 randao) public {
        vm.prevrandao(bytes32(randao));
        vm.prank(player);
        game.flip{value: 0.01 ether}(choice);
    }
}
