// Enshrined VRF AppKit — Reown wallet connection + ethers.js helpers

import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { defineChain } from '@reown/appkit/networks'
import { BrowserProvider, Contract, JsonRpcProvider, parseEther, formatEther } from 'ethers'
import { CHAIN_ID, RPC_URL, CHAIN_NAME, contracts, abis } from './config.js'

// --- Custom chain definition ---
const enshrinedVrfChain = defineChain({
  id: CHAIN_ID,
  caipNetworkId: `eip155:${CHAIN_ID}`,
  chainNamespace: 'eip155',
  name: CHAIN_NAME,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Explorer', url: RPC_URL } },
})

// --- Initialize AppKit ---
// Get a free projectId at https://cloud.reown.com
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'ed9db8435ea432ec164cf02c06c0b969'

const appkit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [enshrinedVrfChain],
  metadata: {
    name: 'Enshrined VRF',
    description: 'OP Stack L2 with protocol-level VRF randomness',
    url: window.location.origin,
    icons: [],
  },
  projectId,
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
})

// --- Read-only provider (always available, no wallet needed) ---
const readProvider = new JsonRpcProvider(RPC_URL)

// --- Helpers ---

export function getAppKit() {
  return appkit
}

export function getReadProvider() {
  return readProvider
}

export async function getSigner() {
  const walletProvider = appkit.getWalletProvider()
  if (!walletProvider) throw new Error('Wallet not connected')
  const provider = new BrowserProvider(walletProvider)
  return provider.getSigner()
}

export function getAddress() {
  return appkit.getAddress()
}

export function isConnected() {
  return appkit.getIsConnected()
}

export function subscribeAccount(callback) {
  return appkit.subscribeAccount(callback)
}

// --- Contract helpers ---

/** Get a read-only contract instance (no wallet needed) */
export function getReadContract(name) {
  return new Contract(contracts[name], abis[name], readProvider)
}

/** Get a write contract instance (requires connected wallet) */
export async function getWriteContract(name) {
  const signer = await getSigner()
  return new Contract(contracts[name], abis[name], signer)
}

// --- Utility re-exports ---
export { parseEther, formatEther }

export async function getBlockNumber() {
  return readProvider.getBlockNumber()
}

export async function getBalance(address) {
  const bal = await readProvider.getBalance(address || getAddress())
  return formatEther(bal)
}

export function shortAddr(addr) {
  if (!addr) return '\u2014'
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}
