import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '../../../../lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });
  }

  const [
    totalPlayers,
    newLast24h,
    newLast7d,
    newLast30d,
    activeLast24h,
    activeLast7d,
    claims,
    leaderboard,
    recentPlayers,
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('players').select('*', { count: 'exact', head: true }).gte('created_at', daysAgo(1)),
    supabase.from('players').select('*', { count: 'exact', head: true }).gte('created_at', daysAgo(7)),
    supabase.from('players').select('*', { count: 'exact', head: true }).gte('created_at', daysAgo(30)),
    supabase.from('players').select('*', { count: 'exact', head: true }).gte('updated_at', daysAgo(1)),
    supabase.from('players').select('*', { count: 'exact', head: true }).gte('updated_at', daysAgo(7)),
    supabase.from('level_reward_claims').select('amount_gd'),
    supabase.from('leaderboard').select('*').order('score', { ascending: false }).limit(10),
    supabase.from('players').select('created_at').gte('created_at', daysAgo(30)),
  ]);

  const totalFableClaimed = (claims.data || []).reduce((sum, c: any) => sum + (c.amount_gd || 0), 0);
  const totalZoneClears = (leaderboard.data || []).reduce((sum, l: any) => sum + (l.zone_clears || 0), 0);

  // Bucket new-player signups by day (UTC) for the last 30 days, for a growth chart.
  const dayBuckets: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const key = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dayBuckets[key] = 0;
  }
  for (const p of recentPlayers.data || []) {
    const key = (p as any).created_at?.slice(0, 10);
    if (key && key in dayBuckets) dayBuckets[key]++;
  }
  const signupsByDay = Object.entries(dayBuckets).map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    totalPlayers: totalPlayers.count || 0,
    newPlayers: { last24h: newLast24h.count || 0, last7d: newLast7d.count || 0, last30d: newLast30d.count || 0 },
    activePlayers: { last24h: activeLast24h.count || 0, last7d: activeLast7d.count || 0 },
    totalFableClaimed,
    totalClaims: (claims.data || []).length,
    totalZoneClears,
    leaderboard: leaderboard.data || [],
    signupsByDay,
  });
}
