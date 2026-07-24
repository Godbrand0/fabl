'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { dbService } from '../lib/supabaseClient';
import { avalancheService } from '../lib/avalanche';
import { audioManager } from '../lib/audio';
import HUD from '../components/HUD';
import MenuPage from '../components/MenuPage';
import gameBridge from '../game/systems/GameBridge';
import { Wallet2, User, Loader2, AlertTriangle } from 'lucide-react';

const GameContainer = dynamic(() => import('../components/GameContainer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center w-full h-[60vh] bg-zinc-950 text-zinc-400 font-mono gap-3">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <span>Loading Fable Game Engine...</span>
    </div>
  ),
});

type Phase = 'splash' | 'auth' | 'creating' | 'menu' | 'playing';
type AuthTab = 'google' | 'username';

export default function Home() {
  const [phase, setPhase]         = useState<Phase>('splash');
  const [progress, setProgress]   = useState(0);
  const [splashFade, setSplashFade] = useState(false);

  const [playerData, setPlayerData]   = useState<any>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress]     = useState('');
  const [avaxBalance, setAvaxBalance]         = useState('0.0000');
  const [fableBalance, setFableBalance]       = useState('0.00');

  // Auth screen state
  const [authTab, setAuthTab]       = useState<AuthTab>('google');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError]   = useState('');
  const [usernameInput, setUsernameInput] = useState('');

  // Character creation state
  const [charName, setCharName]     = useState('');
  const [creating, setCreating]     = useState(false);

  // In-game pause menu (overlays GameContainer + HUD without unmounting them)
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  // Splash: 10s progress bar → auth screen
  useEffect(() => {
    const DURATION = 10000;
    const INTERVAL = 80;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += INTERVAL;
      setProgress(Math.min(100, (elapsed / DURATION) * 100));
      if (elapsed >= DURATION) {
        clearInterval(timer);
        setSplashFade(true);
        setTimeout(() => setPhase('auth'), 600);
      }
    }, INTERVAL);
    return () => clearInterval(timer);
  }, []);

  const refreshBalance = async (addr?: string) => {
    const target = addr || walletAddress;
    if (!target) return;
    try {
      const [avax, fable] = await Promise.all([
        avalancheService.getAvaxBalance(target),
        avalancheService.getFableBalance(target),
      ]);
      setAvaxBalance(avax);
      setFableBalance(fable);
    } catch { /* ignore */ }
  };

  // ── GOOGLE SIGN-IN (Web3Auth embedded wallet) ───────────────────────────────
  const handleWalletSignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const { web3authLogin } = await import('../lib/web3auth');
      await web3authLogin();
      const addr = await avalancheService.getConnectedAddress();
      if (!addr) throw new Error('No address returned from Google login');

      setWalletAddress(addr);
      setWalletConnected(true);
      refreshBalance(addr);

      // DB-only check — localStorage must not bypass character creation
      const existing = await dbService.getPlayerFromDB(addr);
      if (existing) {
        setPlayerData(existing);
        setPhase('menu');
      } else {
        // Fresh embedded wallet — fund it with a little AVAX for gas (fire-and-forget)
        fetch('/api/fund-new-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: addr }),
        }).catch(console.error);
        setPhase('creating');
      }
    } catch (err) {
      console.error('Google sign-in failed', err);
      setAuthError('Google sign-in failed. Try again or use a username.');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── EXTERNAL WALLET SIGN-IN (Core/MetaMask — for players who already hold AVAX) ──
  const handleExternalWalletSignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const addr = await avalancheService.connectWallet();
      setWalletAddress(addr);
      setWalletConnected(true);
      refreshBalance(addr);

      const existing = await dbService.getPlayerFromDB(addr);
      if (existing) {
        setPlayerData(existing);
        setPhase('menu');
      } else {
        // External wallets already hold their own gas — no funding needed.
        setPhase('creating');
      }
    } catch (err) {
      console.error('Wallet sign-in failed', err);
      setAuthError('Wallet connection failed. Try again or use Google.');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── USERNAME SIGN-IN ────────────────────────────────────────────────────────
  const handleUsernameSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const found = await dbService.getPlayerByName(usernameInput);
      if (found) {
        setPlayerData(found);
        setPhase('menu');
      } else {
        setAuthError('No account found for that username. Please sign in with your wallet first to create a profile.');
      }
    } catch {
      setAuthError('Lookup failed. Check your connection and try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── CHARACTER CREATION (only reached after wallet connect) ──────────────────
  const handleCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!charName.trim() || !walletAddress) return;
    setCreating(true);

    const stats = { strength: 0, agility: 0, defense: 0, vitality: 0 };
    const maxHp = 100;

    const newPlayer = {
      wallet_address:  walletAddress,
      name:            charName.trim(),
      class:           'knight',
      level:           1,
      xp:              0,
      maxHp,
      hp:              maxHp,
      stats,
      statPoints:      0,
      maxUnlockedZone: 1,
      equippedWeapon:  'bamboo_stick',
      arsenal:         ['bamboo_stick'],
      abilities:       [],
      inventory:       [],
      nftItems:        [],
      tempBuff:         null,
      activeAbility:    null,
      pendingRewards:   [],
      onboarded:        false,
      zoneProgress:     {},
      currentZone:      null,
    };

    try {
      const saved = await dbService.savePlayer(newPlayer);
      setPlayerData(saved);
      setPhase('menu');
    } catch (err) {
      console.error('Failed to create character:', err);
    } finally {
      setCreating(false);
    }
  };

  // ── SPLASH ──────────────────────────────────────────────────────────────────
  if (phase === 'splash') {
    return (
      <div
        className="fixed inset-0 z-999 flex flex-col items-center justify-center bg-[#0a0a0a] transition-opacity duration-600"
        style={{ opacity: splashFade ? 0 : 1 }}
      >
        <div className="relative w-full max-w-lg px-6">
          <Image src="/banner.png" alt="Fable RPG" width={1024} height={341}
            className="w-full rounded-xl shadow-2xl shadow-amber-900/30" priority />
        </div>
        <div className="mt-6 text-center flex flex-col items-center gap-1">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-400 to-amber-500 tracking-widest uppercase">
            Fable RPG
          </h1>
          <p className="text-xs text-zinc-500 tracking-widest uppercase">Volcanic Action RPG on Avalanche</p>
        </div>
        <div className="mt-8 w-full max-w-xs px-6 flex flex-col items-center gap-2">
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-linear-to-r from-yellow-500 to-amber-400 rounded-full transition-none"
              style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] text-zinc-600 font-mono tracking-widest uppercase">
            {progress < 100 ? 'Loading world…' : 'Ready!'}
          </span>
        </div>
      </div>
    );
  }

  // ── AUTH ────────────────────────────────────────────────────────────────────
  if (phase === 'auth') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] px-4 font-mono">
        <div className="w-full max-w-sm flex flex-col gap-6">

          {/* Logo */}
          <div className="text-center flex flex-col items-center gap-1">
            <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-400 to-amber-500 tracking-widest uppercase">
              Fable RPG
            </h1>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Volcanic Action RPG on Avalanche</p>
          </div>

          {/* Card */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">

            {/* Tabs */}
            <div className="grid grid-cols-2 border-b border-zinc-800">
              {([['google', 'Google'], ['username', 'Username']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setAuthTab(id); setAuthError(''); }}
                  className={`flex items-center justify-center gap-2 py-3.5 text-xs font-bold tracking-wider transition-colors
                    ${authTab === id
                      ? 'bg-zinc-900 text-yellow-400 border-b-2 border-yellow-500'
                      : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {id === 'google' ? <Wallet2 size={13} /> : <User size={13} />} {label}
                </button>
              ))}
            </div>

            <div className="p-5 flex flex-col gap-4">

              {/* GOOGLE TAB */}
              {authTab === 'google' && (
                <div className="flex flex-col gap-4">
                  <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                    Sign in with Google to get a secure embedded wallet — no extension needed. Your progress is saved to that wallet.
                  </p>
                  <button
                    onClick={handleWalletSignIn}
                    disabled={authLoading}
                    className="w-full bg-white text-black py-3.5 rounded-xl text-sm font-bold tracking-wider hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {authLoading
                      ? <><Loader2 size={15} className="animate-spin" /> Connecting…</>
                      : <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
                          Log in with Google
                        </>}
                  </button>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-zinc-800" />
                    <span className="text-[9px] text-zinc-600 uppercase tracking-widest">or</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>

                  <button
                    onClick={handleExternalWalletSignIn}
                    disabled={authLoading}
                    className="w-full bg-linear-to-r from-purple-700 to-indigo-700 text-white py-3 rounded-xl text-xs font-bold tracking-wider hover:brightness-110 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {authLoading
                      ? <><Loader2 size={15} className="animate-spin" /> Connecting…</>
                      : <><Wallet2 size={15} /> Connect Wallet</>}
                  </button>
                  <p className="text-[9px] text-zinc-600 text-center leading-relaxed">
                    Already hold AVAX in Core or MetaMask? Connect it directly instead of creating a new wallet.
                  </p>
                </div>
              )}

              {/* USERNAME TAB */}
              {authTab === 'username' && (
                <form onSubmit={handleUsernameSignIn} className="flex flex-col gap-4">
                  <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                    Enter your hero's name to continue. Only works if you've previously signed in with a wallet.
                  </p>
                  <input
                    type="text"
                    placeholder="Your hero's name…"
                    value={usernameInput}
                    onChange={e => setUsernameInput(e.target.value)}
                    maxLength={12}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-yellow-600 focus:outline-none px-4 py-2.5 rounded-lg text-sm font-semibold text-zinc-100 transition-colors"
                    required
                  />
                  <button
                    type="submit"
                    disabled={authLoading || !usernameInput.trim()}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-extrabold py-3 rounded-xl text-sm tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {authLoading
                      ? <><Loader2 size={15} className="animate-spin" /> Looking up…</>
                      : <><User size={15} /> Continue</>}
                  </button>
                </form>
              )}

              {/* Error */}
              {authError && (
                <div className="flex items-start gap-2 bg-red-950/40 border border-red-800/50 rounded-lg p-3">
                  <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-300 leading-relaxed">{authError}</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-[9px] text-zinc-700 uppercase tracking-widest">
            Powered by Avalanche C-Chain
          </p>
        </div>
      </div>
    );
  }

  // ── CHARACTER CREATION (wallet connected, no profile yet) ───────────────────
  if (phase === 'creating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] px-4 py-8 font-mono text-zinc-200">
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-6">

          <div className="text-center flex flex-col items-center gap-1">
            <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-500 to-amber-600 tracking-wider uppercase">
              Create Your Hero
            </h1>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">New to Fable RPG</p>
          </div>

          {/* Connected wallet badge */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-[10px] text-zinc-400 font-mono flex-1 truncate">{walletAddress}</span>
            <span className="text-[9px] text-green-400 font-bold">Connected</span>
          </div>

          <form onSubmit={handleCreateCharacter} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Hero's Name</label>
              <input
                type="text"
                placeholder="Enter Name…"
                value={charName}
                onChange={e => setCharName(e.target.value)}
                maxLength={12}
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-yellow-600 focus:outline-none px-4 py-2.5 rounded-lg text-sm font-semibold text-zinc-100 transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={creating || !charName.trim()}
              className="w-full bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 text-black py-3 rounded-xl text-sm font-extrabold tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60 shadow-lg shadow-amber-900/20"
            >
              {creating
                ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
                : 'CREATE HERO'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── MENU ────────────────────────────────────────────────────────────────────
  if (phase === 'menu') {
    return (
      <MenuPage
        playerData={playerData}
        setPlayerData={setPlayerData}
        walletConnected={walletConnected}
        walletAddress={walletAddress}
        connectWallet={handleWalletSignIn}
        avaxBalance={avaxBalance}
        fableBalance={fableBalance}
        refreshBalance={refreshBalance}
        onStartGame={() => setPhase('playing')}
      />
    );
  }

  // ── PLAYING ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <GameContainer playerData={playerData} startZone={playerData?.currentZone || undefined} />
      <HUD
        playerData={playerData}
        setPlayerData={setPlayerData}
        walletAddress={walletAddress}
        walletConnected={walletConnected}
        connectWallet={handleWalletSignIn}
        avaxBalance={avaxBalance}
        fableBalance={fableBalance}
        refreshBalance={refreshBalance}
        onOpenMenu={() => { gameBridge.emit('game_pause'); audioManager.pauseMusic(); setShowPauseMenu(true); }}
      />
      {showPauseMenu && (
        <MenuPage
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletConnected={walletConnected}
          walletAddress={walletAddress}
          connectWallet={handleWalletSignIn}
          avaxBalance={avaxBalance}
          fableBalance={fableBalance}
          refreshBalance={refreshBalance}
          onStartGame={() => setPhase('playing')}
          onClose={() => { gameBridge.emit('game_resume'); audioManager.resumeMusic(); setShowPauseMenu(false); }}
        />
      )}
    </div>
  );
}
