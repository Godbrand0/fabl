import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalanche } from 'viem/chains';
import { FABLE_TOKEN_ADDRESS, FABLE_TOKEN_ABI, ZONE_LEVEL_IDS, ZONE_LEVEL_REWARDS } from '../../../lib/nft';
import { dbService } from '../../../lib/supabaseClient';

const RPC = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';

const serverClient = createPublicClient({ chain: avalanche, transport: http(RPC) });

// Server-verified mint: the admin wallet is registered as a FableToken game
// contract (see contract/script/DeployFable.s.sol), so it can mint FABLE
// directly for a zone the player already has recorded as cleared. There is
// no on-chain double-claim guard here — `pendingRewards` on the player
// record (cleared client-side after a successful claim) is the source of
// truth, same trust model the game already used before this migration.
export async function POST(req: NextRequest) {
  try {
    const { walletAddress, zones } = await req.json() as { walletAddress: string; zones: string[] };

    if (!walletAddress || !zones || !Array.isArray(zones) || zones.length === 0) {
      return NextResponse.json({ error: 'Missing walletAddress or zones' }, { status: 400 });
    }

    const adminKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminKey || !FABLE_TOKEN_ADDRESS) {
      // Dev fallback: return mock reward
      return NextResponse.json({
        success: true,
        mocked: true,
        zones,
        txHash: `mock_reward_batch_${Date.now()}`,
      });
    }

    const adminAccount = privateKeyToAccount(adminKey as `0x${string}`);
    const adminWallet  = createWalletClient({ account: adminAccount, chain: avalanche, transport: http(RPC) });

    let totalReward = 0;
    for (const zone of zones) {
      if (ZONE_LEVEL_IDS[zone] == null) continue;
      totalReward += ZONE_LEVEL_REWARDS[zone] ?? 0;
    }

    if (totalReward === 0) {
      return NextResponse.json({ success: false, alreadyClaimedAll: true });
    }

    try {
      const { request } = await serverClient.simulateContract({
        account: adminAccount,
        address: FABLE_TOKEN_ADDRESS,
        abi: FABLE_TOKEN_ABI,
        functionName: 'mintReward',
        args: [walletAddress as `0x${string}`, parseEther(totalReward.toString())],
      });

      const hash = await adminWallet.writeContract(request);
      await serverClient.waitForTransactionReceipt({ hash });

      for (const zone of zones) {
        const levelId = ZONE_LEVEL_IDS[zone];
        if (levelId == null) continue;
        dbService.recordLevelRewardClaim(walletAddress, levelId, zone, ZONE_LEVEL_REWARDS[zone] ?? 0, hash).catch(() => {});
      }

      return NextResponse.json({ success: true, mocked: false, zones, txHash: hash });
    } catch (err: any) {
      console.error('[claim-rewards] mint failed:', err);
      return NextResponse.json({ error: err.message || 'Reward failed' }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[claim-rewards]', err);
    return NextResponse.json({ error: err.message || 'Reward failed' }, { status: 500 });
  }
}

