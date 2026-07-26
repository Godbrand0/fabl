import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { encodePacked, keccak256 } from 'viem';
import { avalanche } from 'viem/chains';
import { FABLE_GAME_SESSION_ADDRESS, ZONE_LEVEL_IDS } from '../../../lib/nft';

const ATTESTATION_TTL_SECONDS = 15 * 60;

// Signs an attestation that FableGameSession.clearZone verifies on-chain:
// keccak256(contract, chainId, player, zoneId, score, deadline), EIP-191
// personal_sign — see FableGameSession._recoverSigner in contract/src.
//
// `score` is the sum of every enemy's point value killed this run, tallied
// client-side (CombatScene's runScore) and passed straight through here —
// there's no server-side recomputation of it yet. The zone's FABLE reward
// is a fixed on-chain constant (FableGameSession.zoneRewards), not part of
// this attestation at all, so this route has no ability to mint an
// arbitrary amount — only to vouch for a score.
export async function POST(req: NextRequest) {
  try {
    const { walletAddress, zone, score } = await req.json() as { walletAddress: string; zone: string; score: number };

    if (!walletAddress || !zone || typeof score !== 'number' || score < 0) {
      return NextResponse.json({ error: 'Missing walletAddress, zone, or score' }, { status: 400 });
    }

    const zoneId = ZONE_LEVEL_IDS[zone];
    if (zoneId == null) {
      return NextResponse.json({ error: `Unknown zone: ${zone}` }, { status: 400 });
    }

    const gameServerKey = process.env.GAME_SERVER_PRIVATE_KEY;
    const deadline = Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS;
    const roundedScore = Math.floor(score);

    if (!gameServerKey || !FABLE_GAME_SESSION_ADDRESS) {
      // Dev fallback: mocked attestation, matched by avalancheService's mock wallet path
      return NextResponse.json({ zoneId, score: roundedScore, deadline, signature: '0xmock', mocked: true });
    }

    const gameServerAccount = privateKeyToAccount(gameServerKey as `0x${string}`);

    const hash = keccak256(encodePacked(
      ['address', 'uint256', 'address', 'uint256', 'uint256', 'uint256'],
      [FABLE_GAME_SESSION_ADDRESS, BigInt(avalanche.id), walletAddress as `0x${string}`, BigInt(zoneId), BigInt(roundedScore), BigInt(deadline)],
    ));

    const signature = await gameServerAccount.signMessage({ message: { raw: hash } });

    return NextResponse.json({ zoneId, score: roundedScore, deadline, signature, mocked: false });
  } catch (err: any) {
    console.error('[attest-zone-clear]', err);
    return NextResponse.json({ error: err.message || 'Attestation failed' }, { status: 500 });
  }
}
