import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { encodePacked, keccak256, parseEther } from 'viem';
import { avalanche } from 'viem/chains';
import { FABLE_GAME_SESSION_ADDRESS, ZONE_LEVEL_IDS, ZONE_LEVEL_REWARDS } from '../../../lib/nft';

const ATTESTATION_TTL_SECONDS = 15 * 60;

// Signs an attestation that FableGameSession.clearZone verifies on-chain:
// keccak256(contract, chainId, player, zoneId, amount, deadline), EIP-191
// personal_sign — see FableGameSession._recoverSigner in contract/src.
export async function POST(req: NextRequest) {
  try {
    const { walletAddress, zone } = await req.json() as { walletAddress: string; zone: string };

    if (!walletAddress || !zone) {
      return NextResponse.json({ error: 'Missing walletAddress or zone' }, { status: 400 });
    }

    const zoneId = ZONE_LEVEL_IDS[zone];
    const reward = ZONE_LEVEL_REWARDS[zone];
    if (zoneId == null || !reward) {
      return NextResponse.json({ error: `Unknown zone: ${zone}` }, { status: 400 });
    }

    const gameServerKey = process.env.GAME_SERVER_PRIVATE_KEY;
    const deadline = Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS;
    const amount = parseEther(reward.toString());

    if (!gameServerKey || !FABLE_GAME_SESSION_ADDRESS) {
      // Dev fallback: mocked attestation, matched by avalancheService's mock wallet path
      return NextResponse.json({ zoneId, amount: amount.toString(), deadline, signature: '0xmock', mocked: true });
    }

    const gameServerAccount = privateKeyToAccount(gameServerKey as `0x${string}`);

    const hash = keccak256(encodePacked(
      ['address', 'uint256', 'address', 'uint256', 'uint256', 'uint256'],
      [FABLE_GAME_SESSION_ADDRESS, BigInt(avalanche.id), walletAddress as `0x${string}`, BigInt(zoneId), amount, BigInt(deadline)],
    ));

    const signature = await gameServerAccount.signMessage({ message: { raw: hash } });

    return NextResponse.json({ zoneId, amount: amount.toString(), deadline, signature, mocked: false });
  } catch (err: any) {
    console.error('[attest-zone-clear]', err);
    return NextResponse.json({ error: err.message || 'Attestation failed' }, { status: 500 });
  }
}
