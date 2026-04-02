// Enshrined VRF dApp Configuration
// Contract addresses are set after deployment via deploy-contracts.sh

export const CHAIN_ID = 7777
export const RPC_URL = 'http://localhost:8545'
export const CHAIN_NAME = 'Enshrined VRF L2'

// Contract addresses (updated by deploy script)
export const contracts = {
  dice: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  coinFlip: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
  roulette: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
  lottery: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
  rps: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
}

// Minimal ABIs for each contract
export const abis = {
  dice: [
    'function play(uint8 chosenNumber) external payable returns (uint256 gameId, uint8 rolledNumber, bool won, uint256 payout)',
    'function fundHouse() external payable',
    'function totalGames() external view returns (uint256)',
    'function houseBalance() external view returns (uint256)',
    'function totalGamesPlayed() external view returns (uint256)',
    'event GamePlayed(uint256 indexed gameId, address indexed player, uint8 chosenNumber, uint8 rolledNumber, uint256 betAmount, uint256 payout, bool won, bytes32 randomSeed)',
  ],
  coinFlip: [
    'function flip(bool chosenHeads) external payable returns (uint256 gameId, bool resultHeads, bool won, uint256 payout)',
    'function fundHouse() external payable',
    'function totalGames() external view returns (uint256)',
    'function houseBalance() external view returns (uint256)',
    'function totalGamesPlayed() external view returns (uint256)',
    'event GamePlayed(uint256 indexed gameId, address indexed player, bool chosenHeads, bool resultHeads, uint256 betAmount, uint256 payout, bool won, bytes32 randomSeed)',
  ],
  roulette: [
    'function spin(uint8 betType, uint8 betValue) external payable returns (uint256 spinId, uint8 result, bool won, uint256 payout)',
    'function fundHouse() external payable',
    'function totalGames() external view returns (uint256)',
    'function houseBalance() external view returns (uint256)',
    'function isRed(uint8 number) external pure returns (bool)',
    'event SpinResult(uint256 indexed spinId, address indexed player, uint8 betType, uint8 betValue, uint8 result, uint256 betAmount, uint256 payout, bool won, bytes32 randomSeed)',
  ],
  rps: [
    'function play(uint8 hand) external payable returns (uint256 gameId, uint8 houseHand, uint8 outcome, uint8 multiplier, uint256 payout)',
    'function fundHouse() external payable',
    'function totalGames() external view returns (uint256)',
    'function houseBalance() external view returns (uint256)',
    'function totalGamesPlayed() external view returns (uint256)',
    'event GamePlayed(uint256 indexed gameId, address indexed player, uint8 playerHand, uint8 houseHand, uint8 outcome, uint8 multiplier, uint256 betAmount, uint256 payout, bytes32 randomSeed)',
  ],
  lottery: [
    'function buyTicket(uint256 number) external payable',
    'function draw() external',
    'function claimPrize(uint256 roundId) external',
    'function currentRoundId() external view returns (uint256)',
    'function getBlocksRemaining() external view returns (uint256)',
    'function getRoundInfo(uint256 roundId) external view returns (uint256 startBlock, uint8 status, uint256 ticketCount, uint256 winningNumber, uint256 prizePool, bytes32 randomSeed, uint256 winnerCount)',
    'function getMyTickets(uint256 roundId, address player) external view returns (uint256[] memory)',
    'function hasClaimed(uint256 roundId, address player) external view returns (bool)',
    'function houseBalance() external view returns (uint256)',
    'event TicketPurchased(uint256 indexed roundId, address indexed player, uint256 ticketIndex)',
    'event RoundDrawn(uint256 indexed roundId, uint256 winningNumber, uint256 prizePool, uint256 winnerCount)',
    'event PrizeClaimed(uint256 indexed roundId, address indexed player, uint256 amount)',
  ],
}
