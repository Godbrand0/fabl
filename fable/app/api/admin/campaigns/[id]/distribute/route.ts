import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '../../../../../../lib/adminAuth';
import { supabaseAdmin } from '../../../../../../lib/adminSupabase';
import { getCampaignWinners, sendAvax } from '../../../../../../lib/campaigns';

// Re-derives winners from on-chain data (never trusts anything the client
// sent), skips wallets already paid out for this campaign (so re-calling
// after a partial failure only retries what's left), and sends AVAX
// directly from the admin wallet. Marks the campaign 'paid' only once every
// winner has a recorded payout; 'failed' if any send in this pass errored,
// so the admin dashboard can surface "retry" rather than silently losing
// the remainder of the pool.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  const { id } = await params;
  const { data: campaign, error } = await supabaseAdmin.from('campaigns').select('*').eq('id', id).single();
  if (error || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  if (campaign.status === 'paid') {
    return NextResponse.json({ error: 'Campaign already fully paid' }, { status: 409 });
  }

  const startsAtMs = new Date(campaign.starts_at).getTime();
  const endsAtMs = new Date(campaign.ends_at).getTime();
  if (Date.now() <= endsAtMs) {
    return NextResponse.json({ error: 'Campaign window has not closed yet' }, { status: 400 });
  }

  let winners;
  try {
    winners = await getCampaignWinners(startsAtMs, endsAtMs, campaign.top_n);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to compute winners' }, { status: 500 });
  }

  if (winners.length === 0) {
    await supabaseAdmin.from('campaigns').update({ status: 'failed' }).eq('id', id);
    return NextResponse.json({ error: 'No qualifying scores in this campaign window' }, { status: 400 });
  }

  const { data: existingPayouts } = await supabaseAdmin
    .from('campaign_payouts')
    .select('wallet_address')
    .eq('campaign_id', id);
  const alreadyPaid = new Set((existingPayouts || []).map(p => p.wallet_address));

  const amountEach = Number(campaign.pool_avax) / winners.length;
  const results: { wallet: string; rank: number; amountAvax: number; txHash?: string; error?: string }[] = [];

  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i];
    const rank = i + 1;
    if (alreadyPaid.has(winner.wallet)) {
      results.push({ wallet: winner.wallet, rank, amountAvax: amountEach });
      continue;
    }

    try {
      const txHash = await sendAvax(winner.wallet, amountEach);
      await supabaseAdmin.from('campaign_payouts').insert({
        campaign_id: id,
        wallet_address: winner.wallet,
        rank,
        score: winner.score.toString(),
        amount_avax: amountEach,
        tx_hash: txHash,
      });
      results.push({ wallet: winner.wallet, rank, amountAvax: amountEach, txHash });
    } catch (err: any) {
      results.push({ wallet: winner.wallet, rank, amountAvax: amountEach, error: err.message || 'Send failed' });
    }
  }

  const allPaid = results.every(r => r.txHash || alreadyPaid.has(r.wallet));
  await supabaseAdmin
    .from('campaigns')
    .update({ status: allPaid ? 'paid' : 'failed', paid_at: allPaid ? new Date().toISOString() : null })
    .eq('id', id);

  return NextResponse.json({ status: allPaid ? 'paid' : 'failed', results });
}
