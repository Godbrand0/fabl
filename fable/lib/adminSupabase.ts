import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Service-role client for admin-only tables (campaigns, campaign_payouts) —
// those tables carry no public RLS policy at all, so the anon key used
// everywhere else in the app cannot read or write them. Real AVAX payout
// bookkeeping should never be reachable from the browser's anon key.
export const supabaseAdmin = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;
