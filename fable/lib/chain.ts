import { avalanche, avalancheFuji, type Chain } from 'viem/chains';

export const AVALANCHE_RPC_URL = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';

// Single source of truth for which network the app targets, derived from the
// RPC URL — every wallet integration and API route reads this instead of
// hardcoding `avalanche` (mainnet), so testnet vs mainnet is one env var,
// not N places to remember to flip. No dependency on lib/avalanche.ts or
// lib/web3auth.ts on purpose: both of those import from here, and either one
// importing back would create a cycle.
export const activeChain: Chain = AVALANCHE_RPC_URL.includes('avax-test') ? avalancheFuji : avalanche;

export const activeChainIdHex = `0x${activeChain.id.toString(16)}`;
