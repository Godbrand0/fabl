import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '../../../../lib/adminAuth';
import { supabaseAdmin } from '../../../../lib/adminSupabase';

function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin.from('campaigns').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  const body = await req.json() as { name?: string; startsAt?: string; endsAt?: string; topN?: number; poolAvax?: number };
  const { name, startsAt, endsAt, topN, poolAvax } = body;

  if (!name || !startsAt || !endsAt || !topN || !poolAvax) {
    return NextResponse.json({ error: 'Missing name, startsAt, endsAt, topN, or poolAvax' }, { status: 400 });
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return NextResponse.json({ error: 'endsAt must be after startsAt' }, { status: 400 });
  }
  if (topN < 1 || topN > 20) {
    return NextResponse.json({ error: 'topN must be between 1 and 20' }, { status: 400 });
  }
  if (poolAvax <= 0) {
    return NextResponse.json({ error: 'poolAvax must be positive' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert({ name, starts_at: startsAt, ends_at: endsAt, top_n: topN, pool_avax: poolAvax, status: 'pending' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
