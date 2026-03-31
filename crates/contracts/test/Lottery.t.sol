// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Lottery.sol";

contract LotteryTest is Test {
    Lottery public lottery;
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    function setUp() public {
        lottery = new Lottery();
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function test_buyTicket() public {
        vm.prank(alice);
        lottery.buyTicket{value: 0.01 ether}(42);

        (,, uint256 ticketCount,, uint256 prizePool,,) = lottery.getRoundInfo(0);
        assertEq(ticketCount, 1);
        assertEq(prizePool, 0.01 ether);
    }

    function test_buyMultipleTickets() public {
        vm.startPrank(alice);
        lottery.buyTicket{value: 0.01 ether}(10);
        lottery.buyTicket{value: 0.01 ether}(20);
        lottery.buyTicket{value: 0.01 ether}(30);
        vm.stopPrank();

        uint256[] memory tickets = lottery.getMyTickets(0, alice);
        assertEq(tickets.length, 3);
        assertEq(tickets[0], 10);
        assertEq(tickets[1], 20);
        assertEq(tickets[2], 30);
    }

    function test_revertWrongPrice() public {
        vm.prank(alice);
        vm.expectRevert("Wrong ticket price");
        lottery.buyTicket{value: 0.02 ether}(42);
    }

    function test_revertNumberOutOfRange() public {
        vm.prank(alice);
        vm.expectRevert("Number out of range");
        lottery.buyTicket{value: 0.01 ether}(100);
    }

    function test_revertDrawTooEarly() public {
        vm.prank(alice);
        lottery.buyTicket{value: 0.01 ether}(42);

        vm.expectRevert(Lottery.RoundStillOpen.selector);
        lottery.draw();
    }

    function test_revertDrawNoTickets() public {
        vm.roll(block.number + 51);
        vm.expectRevert(Lottery.NoTickets.selector);
        lottery.draw();
    }

    function test_drawAndClaim() public {
        // Buy tickets: alice and bob both pick winning number
        // We need to figure out what the winning number will be

        vm.prank(alice);
        lottery.buyTicket{value: 0.01 ether}(0); // buy number 0
        vm.prank(bob);
        lottery.buyTicket{value: 0.01 ether}(1); // buy number 1

        // Advance blocks
        vm.roll(block.number + 51);
        vm.prevrandao(bytes32(uint256(999)));

        // Calculate expected winning number
        bytes32 seed = keccak256(abi.encodePacked(bytes32(uint256(999)), block.number, uint256(0)));
        uint256 winningNumber = uint256(seed) % 100;

        lottery.draw();

        (,,, uint256 actualWinning, uint256 prizePool,, uint256 winnerCount) = lottery.getRoundInfo(0);
        assertEq(actualWinning, winningNumber);

        // Prize pool = 0.02 ether * 90% = 0.018 ether
        assertEq(prizePool, 0.018 ether);

        // New round should be started
        assertEq(lottery.currentRoundId(), 1);

        // If alice or bob won, they can claim
        if (winningNumber == 0 && winnerCount > 0) {
            uint256 balBefore = alice.balance;
            vm.prank(alice);
            lottery.claimPrize(0);
            assertGt(alice.balance, balBefore);
        } else if (winningNumber == 1 && winnerCount > 0) {
            uint256 balBefore = bob.balance;
            vm.prank(bob);
            lottery.claimPrize(0);
            assertGt(bob.balance, balBefore);
        }
    }

    function test_prizeCarryOver() public {
        // Buy ticket with unlikely-to-win number
        vm.prank(alice);
        lottery.buyTicket{value: 0.01 ether}(50);

        vm.roll(block.number + 51);

        // Find a prevrandao that doesn't result in 50
        uint256 randao = 1;
        while (true) {
            bytes32 seed = keccak256(abi.encodePacked(bytes32(randao), block.number, uint256(0)));
            if (uint256(seed) % 100 != 50) break;
            randao++;
        }
        vm.prevrandao(bytes32(randao));

        lottery.draw();

        // No winner — prize should carry over to round 1
        (,,,,uint256 newPrize,,) = lottery.getRoundInfo(1);
        assertEq(newPrize, 0.009 ether); // 0.01 * 90%
    }

    function test_revertDoubleClaim() public {
        vm.prank(alice);
        lottery.buyTicket{value: 0.01 ether}(0);

        vm.roll(block.number + 51);

        // Find prevrandao that gives winning number 0
        uint256 randao = 1;
        while (true) {
            bytes32 seed = keccak256(abi.encodePacked(bytes32(randao), block.number, uint256(0)));
            if (uint256(seed) % 100 == 0) break;
            randao++;
        }
        vm.prevrandao(bytes32(randao));

        lottery.draw();

        vm.prank(alice);
        lottery.claimPrize(0);

        vm.prank(alice);
        vm.expectRevert(Lottery.AlreadyClaimed.selector);
        lottery.claimPrize(0);
    }

    function test_blocksRemaining() public {
        uint256 remaining = lottery.getBlocksRemaining();
        assertEq(remaining, 50);

        vm.roll(block.number + 25);
        remaining = lottery.getBlocksRemaining();
        assertEq(remaining, 25);

        vm.roll(block.number + 30);
        remaining = lottery.getBlocksRemaining();
        assertEq(remaining, 0);
    }
}
