import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { avalanche } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

const AVALANCHE_RPC = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';
const FUNDING_AMOUNT = parseEther('0.01'); // 0.01 AVAX — enough for ~10+ gameplay txs

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { walletAddress } = await req.json();

    if (!walletAddress) {
      return NextResponse.json({ error: 'Missing walletAddress' }, { status: 400 });
    }

    const address = (walletAddress as string).toLowerCase();

    // Check if already funded in DB
    const { data: profile } = await supabase
      .from('players')
      .select('celo_funded')
      .eq('wallet_address', address)
      .single();

    if (profile?.celo_funded) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Already funded' });
    }

    const adminKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminKey || adminKey === '<your_deployer_private_key>') {
      console.warn('ADMIN_PRIVATE_KEY not configured. Skipping AVAX funding.');
      return NextResponse.json({ success: true, skipped: true, reason: 'Funder not configured' });
    }

    const account = privateKeyToAccount(adminKey as `0x${string}`);
    const publicClient = createPublicClient({ chain: avalanche, transport: http(AVALANCHE_RPC) });
    const walletClient = createWalletClient({ account, chain: avalanche, transport: http(AVALANCHE_RPC) });

    // Check admin balance
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance < FUNDING_AMOUNT) {
      console.error('Admin wallet has insufficient AVAX for funding.');
      return NextResponse.json({ success: false, error: 'Funder balance too low' }, { status: 500 });
    }

    // Send AVAX
    const hash = await walletClient.sendTransaction({
      to: walletAddress as `0x${string}`,
      value: FUNDING_AMOUNT,
    });

    await publicClient.waitForTransactionReceipt({ hash });

    // Mark as funded in DB (column kept as `celo_funded` to avoid a schema migration)
    await supabase
      .from('players')
      .upsert({ wallet_address: address, celo_funded: true }, { onConflict: 'wallet_address' });

    console.log(`Funded ${walletAddress} with 0.01 AVAX. Tx: ${hash}`);
    return NextResponse.json({ success: true, txHash: hash });

  } catch (err: any) {
    console.error('Fund wallet error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
