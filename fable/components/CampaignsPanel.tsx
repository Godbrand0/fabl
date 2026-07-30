'use client';

import { useEffect, useState } from 'react';

interface Campaign {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
  top_n: number;
  pool_avax: number;
  status: 'pending' | 'paid' | 'failed';
  created_at: string;
  paid_at: string | null;
}

interface Winner {
  rank: number;
  wallet: string;
  score: string;
  amountAvax: number;
  alreadyPaid: boolean;
}

interface Preview {
  campaign: Campaign;
  windowClosed: boolean;
  winners: Winner[];
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignsPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState(toLocalInputValue(new Date()));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
  const [topN, setTopN] = useState(5);
  const [poolAvax, setPoolAvax] = useState(1);

  const [previews, setPreviews] = useState<Record<number, Preview>>({});
  const [previewLoading, setPreviewLoading] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [distributing, setDistributing] = useState<number | null>(null);

  async function loadCampaigns() {
    setLoading(true);
    const res = await fetch('/api/admin/campaigns');
    if (res.ok) {
      const body = await res.json();
      setCampaigns(body.campaigns || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          topN,
          poolAvax,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error || 'Failed to create campaign');
        return;
      }
      setName('');
      await loadCampaigns();
    } finally {
      setCreating(false);
    }
  }

  async function loadPreview(id: number) {
    setPreviewLoading(id);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/preview`);
      const body = await res.json();
      if (res.ok) {
        setPreviews((p) => ({ ...p, [id]: body }));
      }
    } finally {
      setPreviewLoading(null);
    }
  }

  async function handleDistribute(id: number) {
    setDistributing(id);
    setConfirmingId(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/distribute`, { method: 'POST' });
      await res.json();
      await Promise.all([loadCampaigns(), loadPreview(id)]);
    } finally {
      setDistributing(null);
    }
  }

  return (
    <div style={styles.panel}>
      <h2 style={styles.panelTitle}>Campaigns — top-N AVAX payouts</h2>

      <form onSubmit={handleCreate} style={styles.form}>
        <div style={styles.formRow}>
          <label style={styles.label}>Name</label>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Launch week" required />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Starts</label>
          <input style={styles.input} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Ends</label>
          <input style={styles.input} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Top N</label>
          <input style={styles.inputSmall} type="number" min={1} max={20} value={topN} onChange={(e) => setTopN(Number(e.target.value))} required />
        </div>
        <div style={styles.formRow}>
          <label style={styles.label}>Pool (AVAX)</label>
          <input style={styles.inputSmall} type="number" min={0} step="0.01" value={poolAvax} onChange={(e) => setPoolAvax(Number(e.target.value))} required />
        </div>
        <button type="submit" disabled={creating} style={styles.primaryButton}>
          {creating ? 'Creating…' : 'Create campaign'}
        </button>
        {formError && <div style={styles.errorText}>{formError}</div>}
      </form>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && <span style={{ color: '#898781', fontSize: 13 }}>Loading campaigns…</span>}
        {!loading && campaigns.length === 0 && <span style={{ color: '#898781', fontSize: 13 }}>No campaigns yet.</span>}

        {campaigns.map((c) => {
          const preview = previews[c.id];
          const windowClosed = Date.now() > new Date(c.ends_at).getTime();
          return (
            <div key={c.id} style={styles.campaignCard}>
              <div style={styles.campaignHeader}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0b0b0b' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#898781' }}>
                    {new Date(c.starts_at).toLocaleString()} → {new Date(c.ends_at).toLocaleString()} · top {c.top_n} · {c.pool_avax} AVAX
                  </div>
                </div>
                <span style={{ ...styles.badge, ...(c.status === 'paid' ? styles.badgePaid : c.status === 'failed' ? styles.badgeFailed : styles.badgePending) }}>
                  {c.status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button style={styles.secondaryButton} onClick={() => loadPreview(c.id)} disabled={previewLoading === c.id}>
                  {previewLoading === c.id ? 'Loading…' : 'Preview winners'}
                </button>

                {c.status !== 'paid' && confirmingId !== c.id && (
                  <button
                    style={{ ...styles.secondaryButton, opacity: windowClosed ? 1 : 0.5 }}
                    disabled={!windowClosed || distributing === c.id}
                    title={windowClosed ? '' : 'Campaign window has not closed yet'}
                    onClick={() => setConfirmingId(c.id)}
                  >
                    Distribute
                  </button>
                )}
                {confirmingId === c.id && (
                  <>
                    <button style={styles.dangerButton} onClick={() => handleDistribute(c.id)} disabled={distributing === c.id}>
                      {distributing === c.id ? 'Sending…' : 'Confirm & send AVAX'}
                    </button>
                    <button style={styles.secondaryButton} onClick={() => setConfirmingId(null)}>Cancel</button>
                  </>
                )}
              </div>

              {preview && (
                <div style={{ marginTop: 12, overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>Wallet</th>
                        <th style={styles.thRight}>Score</th>
                        <th style={styles.thRight}>Amount (AVAX)</th>
                        <th style={styles.th}>Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.winners.map((w) => (
                        <tr key={w.wallet}>
                          <td style={styles.td}>{w.rank}</td>
                          <td style={{ ...styles.td, color: '#898781', fontVariantNumeric: 'tabular-nums' }}>{shortAddr(w.wallet)}</td>
                          <td style={styles.tdRight}>{w.score}</td>
                          <td style={styles.tdRight}>{w.amountAvax.toFixed(4)}</td>
                          <td style={styles.td}>{w.alreadyPaid ? '✓' : '—'}</td>
                        </tr>
                      ))}
                      {preview.winners.length === 0 && (
                        <tr><td style={styles.td} colSpan={5}>No qualifying scores in this window yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    maxWidth: 1000, margin: '0 auto', width: '100%',
    background: '#fcfcfb', border: '1px solid rgba(11,11,11,0.10)', borderRadius: 12, padding: 20,
  },
  panelTitle: { margin: '0 0 16px', fontSize: 15, color: '#0b0b0b' },
  form: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' },
  formRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, color: '#898781' },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid #c3c2b7', fontSize: 13, minWidth: 160 },
  inputSmall: { padding: '8px 10px', borderRadius: 8, border: '1px solid #c3c2b7', fontSize: 13, width: 90 },
  primaryButton: {
    padding: '9px 14px', borderRadius: 8, border: 'none', background: '#2a78d6',
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', height: 'fit-content',
  },
  secondaryButton: {
    padding: '7px 12px', borderRadius: 8, border: '1px solid #c3c2b7', background: 'transparent',
    color: '#52514e', fontSize: 12, cursor: 'pointer',
  },
  dangerButton: {
    padding: '7px 12px', borderRadius: 8, border: 'none', background: '#d03b3b',
    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  errorText: { color: '#d03b3b', fontSize: 13, width: '100%' },
  campaignCard: { border: '1px solid #e1e0d9', borderRadius: 10, padding: 14 },
  campaignHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  badge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, textTransform: 'capitalize', height: 'fit-content' },
  badgePending: { background: '#f0efec', color: '#52514e' },
  badgePaid: { background: '#e5f6e5', color: '#0ca30c' },
  badgeFailed: { background: '#fbe7e6', color: '#d03b3b' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#898781', fontWeight: 500, borderBottom: '1px solid #e1e0d9' },
  thRight: { textAlign: 'right', padding: '6px 8px', color: '#898781', fontWeight: 500, borderBottom: '1px solid #e1e0d9' },
  td: { padding: '6px 8px', borderBottom: '1px solid #e1e0d9', color: '#0b0b0b' },
  tdRight: { padding: '6px 8px', borderBottom: '1px solid #e1e0d9', color: '#0b0b0b', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
