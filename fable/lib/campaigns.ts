import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { avalanche, avalancheFuji } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { FABLE_LEADERBOARD_ADDRESS, FABLE_LEADERBOARD_ABI } from './nft';

const RPC_URL = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';
const chain = RPC_URL.includes('avax-test') ? avalancheFuji : avalanche;

const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

const WEEK_SECONDS = 7 * 24 * 60 * 60;

export interface CampaignWinner {
  wallet: string;
  score: bigint;
  timestampMs: number;
}

// The only source campaign payouts trust: every FableLeaderboard submission
// whose block timestamp falls inside [startsAtMs, endsAtMs], collapsed to
// each player's best score in that window. Deliberately never reads the
// Supabase `leaderboard` table — that table has an open `USING (true)` RLS
// policy, so anyone can write arbitrary rows to it from the browser console;
// it's fine for a display leaderboard, not for deciding who gets paid AVAX.
export async function getCampaignWinners(startsAtMs: number, endsAtMs: number, topN: number): Promise<CampaignWinner[]> {
  if (!FABLE_LEADERBOARD_ADDRESS) throw new Error('NEXT_PUBLIC_FABLE_LEADERBOARD_ADDRESS not configured');

  const startWeek = Math.floor(startsAtMs / 1000 / WEEK_SECONDS);
  const endWeek = Math.floor(endsAtMs / 1000 / WEEK_SECONDS);

  const best = new Map<string, CampaignWinner>();

  for (let week = startWeek; week <= endWeek; week++) {
    const entries = await publicClient.readContract({
      address: FABLE_LEADERBOARD_ADDRESS,
      abi: FABLE_LEADERBOARD_ABI,
      functionName: 'getAllScores',
      args: [BigInt(week)],
    });

    for (const e of entries as readonly { player: string; score: bigint; timestamp: bigint }[]) {
      const ts = Number(e.timestamp) * 1000;
      if (ts < startsAtMs || ts > endsAtMs) continue;

      const wallet = e.player.toLowerCase();
      const existing = best.get(wallet);
      if (!existing || e.score > existing.score) {
        best.set(wallet, { wallet, score: e.score, timestampMs: ts });
      }
    }
  }

  return Array.from(best.values())
    .sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : a.timestampMs - b.timestampMs))
    .slice(0, topN);
}

// Sends `amountAvax` (a plain decimal number, rounded to 6dp) from the admin
// wallet directly to `to` and waits for the receipt — same pattern as the
// fund-new-wallet route, just aimed at a campaign winner instead of a new
// player's gas top-up.
export async function sendAvax(to: string, amountAvax: number): Promise<string> {
  const key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) throw new Error('ADMIN_PRIVATE_KEY not configured');

  const account = privateKeyToAccount(key as `0x${string}`);
  const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });

  const hash = await walletClient.sendTransaction({
    to: to as `0x${string}`,
    value: parseEther(amountAvax.toFixed(6)),
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
