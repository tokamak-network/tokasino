// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Roulette.sol";

contract RouletteTest is Test {
    Roulette public game;
    address payable public player = payable(address(0xBEEF));

    function setUp() public {
        game = new Roulette();
        game.fundHouse{value: 100 ether}();
        vm.deal(player, 10 ether);
    }

    function test_spinNumberWin() public {
        // Find a prevrandao that gives a specific result
        bytes32 seed = keccak256(abi.encodePacked(bytes32(uint256(100)), block.number, player, uint256(0)));
        uint8 result = uint8(uint256(seed) % 37);

        vm.prevrandao(bytes32(uint256(100)));
        vm.prank(player);
        (uint256 spinId, uint8 actualResult, bool won, uint256 payout) =
            game.spin{value: 0.01 ether}(0, result); // BetType.Number = 0

        assertEq(spinId, 0);
        assertEq(actualResult, result);
        assertTrue(won);
        assertEq(payout, 0.01 ether * 36); // 36x payout
    }

    function test_spinNumberLoss() public {
        bytes32 seed = keccak256(abi.encodePacked(bytes32(uint256(100)), block.number, player, uint256(0)));
        uint8 result = uint8(uint256(seed) % 37);
        uint8 wrongNumber = (result + 1) % 37;

        vm.prevrandao(bytes32(uint256(100)));
        vm.prank(player);
        (, , bool won, uint256 payout) = game.spin{value: 0.01 ether}(0, wrongNumber);
        assertFalse(won);
        assertEq(payout, 0);
    }

    function test_redBitmap() public view {
        uint8[18] memory reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        for (uint256 i = 0; i < reds.length; i++) {
            assertTrue(game.isRed(reds[i]), "Should be red");
        }
        assertFalse(game.isRed(0), "0 should not be red");
        assertFalse(game.isRed(2), "2 should not be red");
        assertFalse(game.isRed(4), "4 should not be red");
    }

    function test_spinColorBet() public {
        bytes32 seed = keccak256(abi.encodePacked(bytes32(uint256(200)), block.number, player, uint256(0)));
        uint8 result = uint8(uint256(seed) % 37);
        bool resultIsRed = game.isRed(result);

        vm.prevrandao(bytes32(uint256(200)));

        if (result == 0) {
            vm.prank(player);
            (, , bool wonRed,) = game.spin{value: 0.01 ether}(1, 0); // Red
            assertFalse(wonRed);
        } else if (resultIsRed) {
            vm.prank(player);
            (, , bool wonRed, uint256 payout) = game.spin{value: 0.01 ether}(1, 0); // Red
            assertTrue(wonRed);
            assertEq(payout, 0.02 ether); // 2x
        } else {
            vm.prank(player);
            (, , bool wonBlack, uint256 payout) = game.spin{value: 0.01 ether}(2, 0); // Black
            assertTrue(wonBlack);
            assertEq(payout, 0.02 ether); // 2x
        }
    }

    function test_revertInvalidBetType() public {
        vm.prank(player);
        vm.expectRevert(Roulette.InvalidBetValue.selector);
        game.spin{value: 0.01 ether}(11, 0); // Invalid bet type
    }

    function test_revertInvalidNumber() public {
        vm.prank(player);
        vm.expectRevert(Roulette.InvalidBetValue.selector);
        game.spin{value: 0.01 ether}(0, 37); // Number > 36
    }

    function test_dozenBets() public {
        bytes32 seed = keccak256(abi.encodePacked(bytes32(uint256(300)), block.number, player, uint256(0)));
        uint8 result = uint8(uint256(seed) % 37);

        vm.prevrandao(bytes32(uint256(300)));
        vm.prank(player);

        if (result == 0) {
            // Zero — all dozen bets lose
            (, , bool won,) = game.spin{value: 0.01 ether}(7, 0);
            assertFalse(won);
        } else if (result <= 12) {
            (, , bool won, uint256 payout) = game.spin{value: 0.01 ether}(7, 0); // Dozen1st
            assertTrue(won);
            assertEq(payout, 0.03 ether); // 3x
        } else if (result <= 24) {
            (, , bool won, uint256 payout) = game.spin{value: 0.01 ether}(8, 0); // Dozen2nd
            assertTrue(won);
            assertEq(payout, 0.03 ether);
        } else {
            (, , bool won, uint256 payout) = game.spin{value: 0.01 ether}(9, 0); // Dozen3rd
            assertTrue(won);
            assertEq(payout, 0.03 ether);
        }
    }

    function testFuzz_spinDoesNotRevert(uint8 betType, uint8 betValue, uint256 randao) public {
        betType = uint8(bound(betType, 0, 9));
        betValue = uint8(bound(betValue, 0, 36));
        vm.prevrandao(bytes32(randao));
        vm.prank(player);
        game.spin{value: 0.01 ether}(betType, betValue);
    }
}
