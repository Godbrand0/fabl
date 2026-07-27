import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { encodePacked, keccak256 } from 'viem';
import { avalanche } from 'viem/chains';
import { FABLE_GAME_SESSION_ADDRESS, ZONE_LEVEL_IDS, ATTEST_ACTION, AttestAction } from '../../../lib/nft';

const ATTESTATION_TTL_SECONDS = 15 * 60;

const ACTION_MAP: Record<string, AttestAction> = {
  clear: ATTEST_ACTION.CLEAR,
  checkpoint: ATTEST_ACTION.CHECKPOINT,
  continue: ATTEST_ACTION.CONTINUE,
};

// Signs an attestation that FableGameSession verifies on-chain:
// keccak256(contract, chainId, action, player, zoneId, score, deadline),
// EIP-191 personal_sign — see FableGameSession._recoverSigner in contract/src.
//
// `action` picks which of the three functions this signature is valid for
// (clearZone / submitCheckpoint / continueRun) — baked into the hash so a
// signature issued for one can never be replayed into another. `score` is
// the sum of every enemy's point value killed this run, tallied client-side
// (CombatScene's runScore) and passed straight through here — there's no
// server-side recomputation of it yet. FABLE amounts are never part of this
// attestation: zone rewards and the continue fee are fixed on-chain
// constants, so this route has no ability to mint or move an arbitrary
// amount — only to vouch for a score under a given action.
export async function POST(req: NextRequest) {
  try {
    const { walletAddress, zone, score, action } = await req.json() as {
      walletAddress: string; zone: string; score: number; action: string;
    };

    if (!walletAddress || !zone || typeof score !== 'number' || score < 0) {
      return NextResponse.json({ error: 'Missing walletAddress, zone, or score' }, { status: 400 });
    }

    const actionTag = ACTION_MAP[action];
    if (!actionTag) {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
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
      ['address', 'uint256', 'uint8', 'address', 'uint256', 'uint256', 'uint256'],
      [FABLE_GAME_SESSION_ADDRESS, BigInt(avalanche.id), actionTag, walletAddress as `0x${string}`, BigInt(zoneId), BigInt(roundedScore), BigInt(deadline)],
    ));

    const signature = await gameServerAccount.signMessage({ message: { raw: hash } });

    return NextResponse.json({ zoneId, score: roundedScore, deadline, signature, mocked: false });
  } catch (err: any) {
    console.error('[attest-zone-clear]', err);
    return NextResponse.json({ error: err.message || 'Attestation failed' }, { status: 500 });
  }
}
