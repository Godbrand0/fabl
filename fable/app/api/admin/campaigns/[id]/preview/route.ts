import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '../../../../../../lib/adminAuth';
import { supabaseAdmin } from '../../../../../../lib/adminSupabase';
import { getCampaignWinners } from '../../../../../../lib/campaigns';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  try {
    const startsAtMs = new Date(campaign.starts_at).getTime();
    const endsAtMs = new Date(campaign.ends_at).getTime();
    const winners = await getCampaignWinners(startsAtMs, endsAtMs, campaign.top_n);

    const { data: existingPayouts } = await supabaseAdmin
      .from('campaign_payouts')
      .select('wallet_address')
      .eq('campaign_id', id);
    const paidWallets = new Set((existingPayouts || []).map(p => p.wallet_address));

    const amountEach = winners.length > 0 ? Number(campaign.pool_avax) / winners.length : 0;

    return NextResponse.json({
      campaign,
      windowClosed: Date.now() > endsAtMs,
      winners: winners.map((w, i) => ({
        rank: i + 1,
        wallet: w.wallet,
        score: w.score.toString(),
        amountAvax: amountEach,
        alreadyPaid: paidWallets.has(w.wallet),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to compute winners' }, { status: 500 });
  }
}
