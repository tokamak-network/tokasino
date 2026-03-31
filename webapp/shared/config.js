// Tokasino dApp Configuration
// Contract addresses are set after deployment via deploy-contracts.sh

const TOKASINO = {
  CHAIN_ID: 7777,
  RPC_URL: 'http://localhost:8545',
  CHAIN_NAME: 'Tokasino L2',

  // Contract addresses (updated by deploy script)
  contracts: {
    dice: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    coinFlip: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    roulette: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    lottery: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
  },

  // Function selectors (keccak256 first 4 bytes)
  selectors: {
    // InstantDice
    'play(uint8)': '0x53a04b05',
    // CoinFlip
    'flip(bool)': '0x1d263f67',
    // Roulette
    'spin(uint8,uint8)': '0x73b66c3d',
    // Lottery
    'buyTicket(uint256)': '0x67dd74ca',
    'draw()': '0x0eecae21',
    'claimPrize(uint256)': '0xd7098154',
    // Common view functions
    'houseBalance()': '0x67084eb3',
    'totalGames()': '0x2c4e591b',
    'totalGamesPlayed()': '0x5c492129',
    'totalSpinsPlayed()': '0xe28df2ad',
    // Lottery view
    'currentRoundId()': '0x9cbe5efd',
    'getBlocksRemaining()': '0x7941a062',
    'getRoundInfo(uint256)': '0x88c3ffb0',
    'getMyTickets(uint256,address)': '0x7d23464b',
    'hasClaimed(uint256,address)': '0x873f6f9e',
  },

  // Event topic hashes
  events: {
    diceGamePlayed: '0x99fc187654a8b4875aa54c915d830c89936e6cbc7b84c883edac698e794462c5',
    coinFlipGamePlayed: '0x059aab4388e9f03c361cfb5dd3f27d1dbf3f887da4993c5d13cb03577e08051c',
    rouletteSpinResult: '0xa35ef07b4500a17097d5f75f26d8cc96157572c2d4981839426c41e91ec18d88',
    ticketPurchased: '0xdbaaf4c87ce30816c961a81d110622a3227ede77953d4383d514ff88ab2e0fd3',
    roundDrawn: '0xe5cd9d13317511e76aa28198da1ec2610d2cdb4fd2fb9dba8bdb7952c0b7594e',
    prizeClaimed: '0x4aa95f981a8337cb337de335b965507da0879c3b49f799d20058e913f5ad2c26',
  }
};
