// Shared helper functions for the randomness explainer

export function sh(h, n = 10) {
  if (!h || h.length < 20) return h || '--'
  return h.slice(0, n + 2) + '...' + h.slice(-n)
}

export function full(h) {
  return h || '0x???'
}

export function formatPrevrandao(raw) {
  if (!raw) return null
  return '0x' + BigInt(raw).toString(16).padStart(64, '0')
}
