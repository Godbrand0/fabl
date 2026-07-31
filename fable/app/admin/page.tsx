'use client';

import { useEffect, useState } from 'react';
import CampaignsPanel from '../../components/CampaignsPanel';

interface LeaderboardRow {
  wallet_address: string;
  player_name: string;
  zone_clears: number;
  score: number;
}

interface Stats {
  totalPlayers: number;
  newPlayers: { last24h: number; last7d: number; last30d: number };
  activePlayers: { last24h: number; last7d: number };
  totalFableClaimed: number;
  totalClaims: number;
  totalZoneClears: number;
  leaderboard: LeaderboardRow[];
  signupsByDay: { date: string; count: number }[];
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export default function AdminDashboard() {
  // globals.css locks html AND body to overflow:hidden + position:fixed +
  // height:100% for the game's full-screen mobile view — this is an
  // ordinary content page, so undo that lock on both elements while
  // mounted (touching only body left html pinned to one viewport tall,
  // which made body scroll *inside* that fixed box instead of the page
  // growing normally) and restore it on unmount.
  useEffect(() => {
    const elements = [document.documentElement, document.body];
    const prev = elements.map((el) => ({
      overflow: el.style.overflow,
      position: el.style.position,
      height: el.style.height,
    }));
    elements.forEach((el) => {
      el.style.overflow = 'auto';
      el.style.position = 'static';
      el.style.height = 'auto';
    });
    return () => {
      elements.forEach((el, i) => {
        el.style.overflow = prev[i].overflow;
        el.style.position = prev[i].position;
        el.style.height = prev[i].height;
      });
    };
  }, []);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  async function loadStats() {
    const res = await fetch('/api/admin/stats');
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    if (!res.ok) {
      setError('Failed to load stats');
      return;
    }
    setStats(await res.json());
    setAuthed(true);
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoginError(body.error || 'Login failed');
      return;
    }
    setPassword('');
    await loadStats();
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthed(false);
    setStats(null);
  }

  if (authed === null) {
    return (
      <div style={styles.centerPage}>
        <span style={{ color: '#898781' }}>Loading…</span>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div style={styles.centerPage}>
        <form onSubmit={handleLogin} style={styles.loginCard}>
          <h1 style={styles.loginTitle}>Fable Admin</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            style={styles.input}
          />
          {loginError && <div style={styles.errorText}>{loginError}</div>}
          <button type="submit" style={styles.primaryButton}>Sign in</button>
        </form>
      </div>
    );
  }

  if (error) {
    return <div style={styles.centerPage}><span style={styles.errorText}>{error}</span></div>;
  }

  if (!stats) {
    return (
      <div style={styles.centerPage}>
        <span style={{ color: '#898781' }}>Loading stats…</span>
      </div>
    );
  }

  const maxCount = Math.max(1, ...stats.signupsByDay.map((d) => d.count));

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Fable Admin Dashboard</h1>
        <button onClick={handleLogout} style={styles.secondaryButton}>Sign out</button>
      </div>

      <div style={styles.tileGrid}>
        <StatTile label="Total players" value={stats.totalPlayers.toLocaleString()} />
        <StatTile label="New players (7d)" value={stats.newPlayers.last7d.toLocaleString()} sub={`${stats.newPlayers.last24h} today · ${stats.newPlayers.last30d} in 30d`} />
        <StatTile label="Active players (7d)" value={stats.activePlayers.last7d.toLocaleString()} sub={`${stats.activePlayers.last24h} today`} />
        <StatTile label="FABLE earned" value={stats.totalFableClaimed.toLocaleString()} sub={`${stats.totalClaims.toLocaleString()} claims`} />
        <StatTile label="Zone clears" value={stats.totalZoneClears.toLocaleString()} />
      </div>

      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>New players — last 30 days</h2>
        <div style={styles.chartWrap}>
          <svg viewBox="0 0 620 180" style={{ width: '100%', height: 180, overflow: 'visible' }}>
            {[0, 0.5, 1].map((frac) => (
              <line
                key={frac}
                x1={0} x2={620}
                y1={140 - frac * 120} y2={140 - frac * 120}
                stroke="#e1e0d9" strokeWidth={1}
              />
            ))}
            {stats.signupsByDay.map((d, i) => {
              const barWidth = 620 / stats.signupsByDay.length - 3;
              const x = i * (620 / stats.signupsByDay.length);
              const h = (d.count / maxCount) * 120;
              const isHovered = hoveredDay === i;
              return (
                <rect
                  key={d.date}
                  x={x} y={140 - h}
                  width={Math.max(barWidth, 1)} height={h}
                  rx={2}
                  fill={isHovered ? '#1c5cab' : '#2a78d6'}
                  onMouseEnter={() => setHoveredDay(i)}
                  onMouseLeave={() => setHoveredDay(null)}
                />
              );
            })}
            <line x1={0} x2={620} y1={140} y2={140} stroke="#c3c2b7" strokeWidth={1} />
          </svg>
          {hoveredDay !== null && stats.signupsByDay[hoveredDay] && (
            <div style={styles.tooltip}>
              {stats.signupsByDay[hoveredDay].date}: <strong>{stats.signupsByDay[hoveredDay].count}</strong> new player{stats.signupsByDay[hoveredDay].count === 1 ? '' : 's'}
            </div>
          )}
          <div style={styles.chartAxisLabels}>
            <span>{stats.signupsByDay[0]?.date}</span>
            <span>{stats.signupsByDay[stats.signupsByDay.length - 1]?.date}</span>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>Leaderboard — top 10</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Player</th>
                <th style={styles.th}>Wallet</th>
                <th style={styles.thRight}>Zone clears</th>
                <th style={styles.thRight}>Score</th>
              </tr>
            </thead>
            <tbody>
              {stats.leaderboard.map((row, i) => (
                <tr key={row.wallet_address}>
                  <td style={styles.td}>{i + 1}</td>
                  <td style={styles.td}>{row.player_name}</td>
                  <td style={{ ...styles.td, color: '#898781', fontVariantNumeric: 'tabular-nums' }}>{shortAddr(row.wallet_address)}</td>
                  <td style={styles.tdRight}>{row.zone_clears}</td>
                  <td style={styles.tdRight}>{row.score.toLocaleString()}</td>
                </tr>
              ))}
              {stats.leaderboard.length === 0 && (
                <tr><td style={styles.td} colSpan={5}>No leaderboard entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CampaignsPanel />
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={styles.tile}>
      <div style={styles.tileLabel}>{label}</div>
      <div style={styles.tileValue}>{value}</div>
      {sub && <div style={styles.tileSub}>{sub}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centerPage: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f9f9f7', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  loginCard: {
    background: '#fcfcfb', border: '1px solid rgba(11,11,11,0.10)', borderRadius: 12,
    padding: 32, width: 320, display: 'flex', flexDirection: 'column', gap: 12,
  },
  loginTitle: { margin: 0, marginBottom: 8, fontSize: 20, color: '#0b0b0b' },
  input: {
    padding: '10px 12px', borderRadius: 8, border: '1px solid #c3c2b7', fontSize: 14,
  },
  primaryButton: {
    padding: '10px 12px', borderRadius: 8, border: 'none', background: '#2a78d6',
    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  secondaryButton: {
    padding: '8px 14px', borderRadius: 8, border: '1px solid #c3c2b7', background: 'transparent',
    color: '#52514e', fontSize: 13, cursor: 'pointer',
  },
  errorText: { color: '#d03b3b', fontSize: 13 },
  page: {
    minHeight: '100vh', background: '#f9f9f7', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1000, margin: '0 auto', width: '100%' },
  title: { margin: 0, fontSize: 22, color: '#0b0b0b' },
  tileGrid: {
    maxWidth: 1000, margin: '0 auto', width: '100%',
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12,
  },
  tile: {
    background: '#fcfcfb', border: '1px solid rgba(11,11,11,0.10)', borderRadius: 12, padding: '16px 18px',
  },
  tileLabel: { fontSize: 12, color: '#898781', marginBottom: 6 },
  tileValue: { fontSize: 26, fontWeight: 700, color: '#0b0b0b' },
  tileSub: { fontSize: 12, color: '#52514e', marginTop: 4 },
  panel: {
    maxWidth: 1000, margin: '0 auto', width: '100%',
    background: '#fcfcfb', border: '1px solid rgba(11,11,11,0.10)', borderRadius: 12, padding: 20,
  },
  panelTitle: { margin: '0 0 16px', fontSize: 15, color: '#0b0b0b' },
  chartWrap: { position: 'relative' },
  chartAxisLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#898781', marginTop: 4 },
  tooltip: {
    position: 'absolute', top: 0, right: 0, background: '#0b0b0b', color: '#fff',
    fontSize: 12, padding: '4px 8px', borderRadius: 6,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', color: '#898781', fontWeight: 500, borderBottom: '1px solid #e1e0d9' },
  thRight: { textAlign: 'right', padding: '8px 10px', color: '#898781', fontWeight: 500, borderBottom: '1px solid #e1e0d9' },
  td: { padding: '8px 10px', borderBottom: '1px solid #e1e0d9', color: '#0b0b0b' },
  tdRight: { padding: '8px 10px', borderBottom: '1px solid #e1e0d9', color: '#0b0b0b', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
