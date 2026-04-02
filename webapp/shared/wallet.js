// Enshrined VRF Wallet & RPC Utilities

let _account = null;
let _onAccountChange = null;

async function rpc(method, params = []) {
  const res = await fetch(ENSHRINED_VRF.RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
  });
  const d = await res.json();
  return d.result;
}

function getAccount() {
  return _account;
}

async function connectWallet() {
  if (!window.ethereum) {
    alert('MetaMask를 설치해주세요!');
    return null;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    _account = accounts[0];
  } catch (e) {
    console.error('Wallet connection failed:', e);
    return null;
  }

  // Try to switch chain (non-fatal — don't block wallet connection)
  const chainHex = '0x' + ENSHRINED_VRF.CHAIN_ID.toString(16);
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainHex }],
    });
  } catch (e) {
    if (e.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainHex,
            chainName: ENSHRINED_VRF.CHAIN_NAME,
            rpcUrls: [ENSHRINED_VRF.RPC_URL],
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          }],
        });
      } catch (e2) {
        console.warn('Failed to add chain:', e2);
      }
    } else {
      console.warn('Failed to switch chain:', e);
    }
  }

  window.ethereum.on('accountsChanged', (accounts) => {
    _account = accounts[0] || null;
    if (_onAccountChange) _onAccountChange(_account);
  });

  return _account;
}

function onAccountChange(callback) {
  _onAccountChange = callback;
}

async function sendTx(to, data, valueWei) {
  const params = { from: _account, to, data, gas: '0x50000' };
  if (valueWei) params.value = valueWei;
  return window.ethereum.request({ method: 'eth_sendTransaction', params: [params] });
}

async function waitReceipt(txHash, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
    if (receipt) return receipt;
  }
  return null;
}

async function getBalance(address) {
  const bal = await rpc('eth_getBalance', [address || _account, 'latest']);
  return parseInt(bal, 16) / 1e18;
}

async function callContract(to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

async function getBlockNumber() {
  const bn = await rpc('eth_blockNumber');
  return parseInt(bn, 16);
}

function ethToWei(ethStr) {
  return '0x' + BigInt(Math.floor(parseFloat(ethStr) * 1e18)).toString(16);
}

function weiToEth(weiHex) {
  return parseInt(weiHex, 16) / 1e18;
}

function shortAddr(addr) {
  if (!addr) return '—';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function pad64(val) {
  return val.toString(16).padStart(64, '0');
}
