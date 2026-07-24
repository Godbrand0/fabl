'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Sword, Backpack, User, BookOpen, Award, Heart, Flame,
  RefreshCw, Gem, Play, Settings as SettingsIcon, X, CheckCircle2,
} from 'lucide-react';
import TavernShop, { TAVERN_WEAPONS } from './TavernShop';
import BankModal from './BankModal';
import GuidedTour, { TOUR_STEPS } from './GuidedTour';
import NFTDetailModal from './NFTDetailModal';
import StarterWeaponModal from './StarterWeaponModal';
import { dbService } from '../lib/supabaseClient';
import { avalancheService } from '../lib/avalanche';
import { audioManager } from '../lib/audio';
import gameBridge from '../game/systems/GameBridge';
import { AVAX_ITEMS, STAT_POINT_FIRST_COST, STAT_POINT_COST } from '../lib/nft';

type Section = 'nav' | 'tavern' | 'bank' | 'marketplace' | 'stats' | 'profile' | 'codex' | 'loadout' | 'settings';

interface MenuPageProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletConnected: boolean;
  walletAddress: string;
  connectWallet: () => Promise<void>;
  avaxBalance: string;
  fableBalance: string;
  refreshBalance: () => Promise<void>;
  onStartGame: () => void;
  /** Present only when opened as an in-game pause menu (game keeps running behind it). */
  onClose?: () => void;
}

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'tavern',      label: 'Tavern',        icon: <span>🍺</span> },
  { id: 'bank',        label: 'Bank',          icon: <span>🏦</span> },
  { id: 'marketplace', label: 'Marketplace',   icon: <span>🛒</span> },
  { id: 'stats',       label: 'Stats',         icon: <User size={14} /> },
  { id: 'profile',     label: 'Profile',       icon: <User size={14} /> },
  { id: 'codex',       label: 'Codex / Map',   icon: <BookOpen size={14} /> },
  { id: 'loadout',     label: 'Loadout',       icon: <Sword size={14} /> },
  { id: 'settings',    label: 'Settings',      icon: <SettingsIcon size={14} /> },
];

// Drop preview images at /public/zones/{sceneKey}.png to populate these cards.
const ZONE_INFO = [
  {
    sceneKey: 'SunfallDunesScene', name: 'Sunfall Dunes', color: 'text-yellow-400',
    enemyName: 'Imp', enemyDesc: 'Weaker desert variant — fast but frail.',
    bossName: 'Sand Wraith', bossDesc: 'Swirling desert spirit guarding the dunes with sweeping sandstorms.',
  },
  {
    sceneKey: 'EmberFieldsScene', name: 'Ember Fields', color: 'text-red-500',
    enemyName: 'Imp', enemyDesc: 'Standard aggressive fire-spitter. Moves fast but frail.',
    bossName: 'Lava Pumpkin', bossDesc: 'Giant volcanic entity. Shoots heavy rings of magma.',
  },
  {
    sceneKey: 'AshwaterMarshScene', name: 'Ashwater Marsh', color: 'text-purple-400',
    enemyName: 'Poison Slime', enemyDesc: 'Slow purple gelatin. Spits acidic slowing fluid.',
    bossName: 'Swamp Hydra', bossDesc: 'Three heads spitting multiple poison projectiles in wide arcs.',
  },
  {
    sceneKey: 'ObsidianPeakScene', name: 'Obsidian Peak', color: 'text-zinc-300',
    enemyName: 'Obsidian Golem', enemyDesc: 'Slow rocky giant. Blocks 20% of incoming player attacks.',
    bossName: 'Fire Demon', bossDesc: 'Final volcanic boss. Shoots high-damage flame pulses and shakes the summit.',
  },
];

export default function MenuPage({
  playerData,
  setPlayerData,
  walletConnected,
  walletAddress,
  connectWallet,
  avaxBalance,
  fableBalance,
  refreshBalance,
  onStartGame,
  onClose,
}: MenuPageProps) {
  const [section, setSection]         = useState<Section>('nav');
  const [addressCopied, setAddressCopied] = useState(false);
  const [musicOn, setMusicOn]         = useState(true);
  const [sfxOn, setSfxOn]             = useState(true);
  const [message, setMessage]         = useState<string | null>(null);
  const [selectedNft, setSelectedNft] = useState<any | null>(null);
  const [showStarterWeapon, setShowStarterWeapon] = useState(false);
  const [allocatingStat, setAllocatingStat] = useState(false);

  const showFlashMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const hasProgress = (playerData.level > 1) || ((playerData.maxUnlockedZone || 1) > 1);

  const finishOnboarding = () => {
    setPlayerData((prev: any) => {
      const updated = { ...prev, onboarded: true };
      dbService.savePlayer(updated);
      return updated;
    });
  };

  // ── Guided onboarding tour — forces new players through every menu page ────
  const [tourStep, setTourStep] = useState(0);
  const tourActive = !playerData.onboarded && !onClose;
  const tourTarget = tourActive ? TOUR_STEPS[tourStep]?.target ?? null : null;

  const handleNavClick = (id: Section) => {
    if (tourActive) {
      // During the tour only the highlighted tab responds
      if (id !== tourTarget) return;
      audioManager.playSfx('click');
      setSection(id);
      setTourStep(s => s + 1);
      return;
    }
    audioManager.playSfx('click');
    setSection(id);
  };

  const handleStartClick = () => {
    if (tourActive && tourTarget !== 'start') return;
    audioManager.playSfx('click');
    if (tourActive) finishOnboarding();
    onClose ? onClose() : onStartGame();
  };

  // ── Stat allocation — spends FABLE on-chain via FableShop.buyStatPoint() ───
  const totalStatsInvested = (playerData.stats.strength || 0) + (playerData.stats.agility || 0)
    + (playerData.stats.defense || 0) + (playerData.stats.vitality || 0);
  const statCap  = (playerData.maxUnlockedZone || 1) * 5;
  const statCost = totalStatsInvested === 0 ? STAT_POINT_FIRST_COST : STAT_POINT_COST;

  const allocateStat = async (statName: 'strength' | 'agility' | 'defense' | 'vitality') => {
    if (allocatingStat) return;
    if (totalStatsInvested >= statCap) return;
    if (parseFloat(fableBalance) < statCost) {
      showFlashMessage(`Need ${statCost} FABLE to allocate a stat point.`);
      return;
    }

    setAllocatingStat(true);
    try {
      let addr = walletAddress;
      if (!walletConnected || !addr) {
        await connectWallet();
        addr = (await avalancheService.getConnectedAddress()) ?? '';
      }
      if (!addr) { showFlashMessage('Connect your wallet to allocate stats.'); return; }

      const success = await avalancheService.buyStatPoint(addr);
      if (!success) { showFlashMessage('Stat purchase failed.'); return; }

      await refreshBalance();
      setPlayerData((prev: any) => {
        const stats = { ...prev.stats };
        stats[statName] = (stats[statName] || 0) + 1;

        let maxHp = prev.maxHp;
        let hp = prev.hp;
        if (statName === 'vitality') {
          maxHp += 10;
          hp = Math.min(prev.hp + 10, maxHp);
        }

        const updated = { ...prev, stats, maxHp, hp };
        dbService.savePlayer(updated);
        return updated;
      });
    } catch (err) {
      console.error('allocateStat failed:', err);
      showFlashMessage('Stat purchase failed. Please try again.');
    } finally {
      setAllocatingStat(false);
    }
  };

  // ── Loadout (ported from HUD) ──────────────────────────────────────────────
  const equipWeapon = (weaponId: string) => {
    setPlayerData((prev: any) => {
      const updated = { ...prev, equippedWeapon: weaponId };
      dbService.savePlayer(updated);
      const wDef = TAVERN_WEAPONS.find(w => w.id === weaponId);
      if (wDef?.textureKey) gameBridge.emit('weapon_changed', { textureKey: wDef.textureKey });
      return updated;
    });
  };

  const equipAbility = (abilityId: string) => {
    setPlayerData((prev: any) => {
      const updated = { ...prev, activeAbility: abilityId };
      dbService.savePlayer(updated);
      return updated;
    });
  };

  const currentWeaponObj = TAVERN_WEAPONS.find(w => w.id === playerData.equippedWeapon) ?? TAVERN_WEAPONS[0];

  const levelsCleared = Math.max(0, (playerData.maxUnlockedZone || 1) - 1);
  const nftCount = playerData.nftItems?.length ?? 0;
  const zoneNames: Record<number, string> = { 1: 'Sunfall Dunes', 2: 'Ember Fields', 3: 'Ashwater Marsh', 4: 'Obsidian Peak' };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col font-mono text-zinc-200 overflow-hidden">
      {/* One-time Guildmaster tour — walks new players through every page and
          only unlocks Start Game at the end */}
      {tourActive && (
        <GuidedTour
          playerName={playerData?.name}
          stepIndex={tourStep}
          onNext={() => setTourStep(s => s + 1)}
        />
      )}

      {message && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-70 bg-black/85 border-2 border-purple-500 text-purple-300 px-4 py-2.5 rounded-lg text-center text-xs font-bold shadow-xl max-w-70">
          {message}
        </div>
      )}

      {selectedNft && (
        <NFTDetailModal nft={selectedNft} onClose={() => setSelectedNft(null)} />
      )}

      {showStarterWeapon && (
        <StarterWeaponModal onClose={() => setShowStarterWeapon(false)} />
      )}

      {/* Header */}
          <div className="w-full px-4 py-2 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 shrink-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-sm font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-400 to-amber-500 tracking-widest uppercase">
                Fable RPG
              </h1>
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest">{playerData.name} · Lv {playerData.level}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-purple-400">◆ {parseFloat(fableBalance).toFixed(2)} FABLE</span>
              <span className="text-xs font-bold text-emerald-400">◈ {parseFloat(avaxBalance).toFixed(4)} AVAX</span>
              {onClose && (
                <button
                  onClick={() => { audioManager.playSfx('click'); onClose(); }}
                  className="ml-2 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2.5 py-1 rounded-lg text-xs font-bold text-zinc-200"
                >
                  <Play size={12} /> Resume
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Nav sidebar */}
            <div className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900/40 flex flex-col p-3 gap-2 overflow-y-auto">
              <button
                data-tour="start"
                onClick={handleStartClick}
                disabled={tourActive && tourTarget !== 'start'}
                className={`w-full bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 text-black font-extrabold py-3 rounded-xl text-sm tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-amber-900/20 mb-2
                  ${tourActive && tourTarget !== 'start' ? 'opacity-40 cursor-not-allowed' : ''}
                  ${tourTarget === 'start' ? 'ring-2 ring-yellow-300 animate-pulse' : ''}`}
              >
                <Play size={15} />
                {onClose ? 'Resume Game' : hasProgress ? 'Continue Game' : 'Start Game'}
              </button>

              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  data-tour={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-xs font-bold transition-colors
                    ${section === item.id ? 'bg-purple-900/40 border border-purple-700 text-purple-200' : 'text-zinc-400 hover:bg-zinc-800 border border-transparent'}
                    ${tourTarget === item.id ? 'ring-2 ring-yellow-400 border-yellow-600 text-yellow-300 animate-pulse' : ''}
                    ${tourActive && tourTarget !== item.id ? 'opacity-40' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Content pane — `relative` so Tavern/Bank's `absolute inset-0` fills
                just this pane instead of the whole screen */}
            <div className={`flex-1 overflow-y-auto relative ${section === 'tavern' || section === 'bank' ? '' : 'p-6'}`}>
              {section === 'nav' && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-zinc-500">
                  <span className="text-4xl">🗡️</span>
                  <p className="text-sm">Pick a section from the left, or {onClose ? 'resume your run' : hasProgress ? 'continue your run' : 'start your first zone'}.</p>
                </div>
              )}

              {/* TAVERN */}
              {section === 'tavern' && (
                <TavernShop
                  playerData={playerData}
                  setPlayerData={setPlayerData}
                  walletAddress={walletAddress}
                  walletConnected={walletConnected}
                  connectWallet={connectWallet}
                  avaxBalance={avaxBalance}
                  fableBalance={fableBalance}
                  refreshBalance={refreshBalance}
                  onLeave={() => setSection('nav')}
                  showMessage={showFlashMessage}
                />
              )}

              {/* BANK */}
              {section === 'bank' && (
                <BankModal
                  playerData={playerData}
                  setPlayerData={setPlayerData}
                  walletAddress={walletAddress}
                  walletConnected={walletConnected}
                  connectWallet={connectWallet}
                  onClose={() => setSection('nav')}
                  refreshBalance={refreshBalance}
                  showMessage={showFlashMessage}
                />
              )}

              {/* MARKETPLACE */}
              {section === 'marketplace' && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-zinc-500">
                  <span className="text-4xl">🛒</span>
                  <span className="text-sm font-bold text-zinc-300">Marketplace</span>
                  <p className="text-xs max-w-xs">Player-to-player trading is coming soon.</p>
                </div>
              )}

              {/* SETTINGS */}
              {section === 'settings' && (
                <div className="flex flex-col gap-3 max-w-sm">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Audio</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const next = !musicOn;
                        setMusicOn(next);
                        audioManager.setMusicEnabled(next);
                        if (next) audioManager.playSfx('click');
                      }}
                      className={`flex-1 px-3 py-3 rounded-lg text-xs font-bold border ${musicOn ? 'text-yellow-400 border-yellow-800 bg-yellow-950/20' : 'text-zinc-600 border-zinc-800'}`}
                    >
                      {musicOn ? '🎵 Music On' : '🔇 Music Off'}
                    </button>
                    <button
                      onClick={() => {
                        const next = !sfxOn;
                        setSfxOn(next);
                        audioManager.setSfxEnabled(next);
                        if (next) audioManager.playSfx('click');
                      }}
                      className={`flex-1 px-3 py-3 rounded-lg text-xs font-bold border ${sfxOn ? 'text-yellow-400 border-yellow-800 bg-yellow-950/20' : 'text-zinc-600 border-zinc-800'}`}
                    >
                      {sfxOn ? '🔊 SFX On' : '🔇 SFX Off'}
                    </button>
                  </div>
                </div>
              )}

              {/* STATS */}
              {section === 'stats' && (
                <div className="flex flex-col gap-4 w-full">
                  <div className="flex justify-between items-center bg-purple-950/40 border border-purple-900/60 p-3 rounded-lg text-purple-300 font-bold text-sm">
                    <span>Points invested</span>
                    <span>{totalStatsInvested} / {statCap}</span>
                  </div>

                  {totalStatsInvested < statCap ? (
                    <div className="text-xs text-purple-300 text-center">
                      Each point costs <span className="font-bold">{statCost} FABLE</span> &nbsp;·&nbsp; You have <span className="font-bold">{parseFloat(fableBalance).toFixed(2)} FABLE</span>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 text-center italic">
                      {playerData.maxUnlockedZone >= 3 ? 'Max stats reached' : 'Clear next zone to unlock 5 more points'}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: 'strength', name: '🔴 Strength', desc: '+2 DMG per point', val: playerData.stats.strength },
                      { key: 'agility',  name: '🟢 Agility',  desc: '-30ms fire rate per point', val: playerData.stats.agility },
                      { key: 'defense',  name: '🔵 Defense',  desc: '-3 DMG taken per point', val: playerData.stats.defense },
                      { key: 'vitality', name: '🟡 Vitality', desc: '+10 Max HP per point', val: playerData.stats.vitality },
                    ].map(st => {
                      const canBuy = totalStatsInvested < statCap && parseFloat(fableBalance) >= statCost && !allocatingStat;
                      return (
                        <div key={st.key} className="flex justify-between items-center bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-zinc-300">{st.name}</span>
                            <span className="text-[10px] text-zinc-500">{st.desc}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-lg">{st.val}</span>
                            <button
                              onClick={() => allocateStat(st.key as any)}
                              disabled={!canBuy}
                              className="w-7 h-7 flex justify-center items-center bg-purple-600 hover:bg-purple-500 disabled:opacity-30 rounded text-white font-bold text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* LOADOUT (weapons, abilities, bag) */}
              {section === 'loadout' && (
                <div className="flex flex-col gap-5 w-full">
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold">Equipped Weapon</span>
                      <span className="text-yellow-500 font-bold text-lg">{currentWeaponObj.name}</span>
                    </div>
                    <span className="text-zinc-400 font-bold text-lg">+{currentWeaponObj.attack} ATK</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-zinc-400 font-semibold tracking-wider">Arsenal</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {playerData.arsenal?.map((weaponId: string) => {
                        const details = TAVERN_WEAPONS.find(w => w.id === weaponId) ?? { name: 'Bamboo Stick', attack: 5 };
                        const isEquipped = playerData.equippedWeapon === weaponId;
                        const ownedNft = playerData.nftItems?.find((n: any) => n.itemId === weaponId);
                        const isNFT = !!ownedNft;
                        const isStarterWeapon = weaponId === 'bamboo_stick';
                        const canView = isNFT || isStarterWeapon;
                        return (
                          <div key={weaponId} className="flex flex-col gap-1.5 bg-black/40 border border-zinc-800/80 rounded-xl p-2.5">
                            <div
                              className={`relative w-full aspect-square rounded-lg overflow-hidden bg-zinc-950 ${canView ? 'cursor-pointer' : ''}`}
                              onClick={() => {
                                if (isNFT) setSelectedNft(ownedNft);
                                else if (isStarterWeapon) setShowStarterWeapon(true);
                              }}
                            >
                              {isNFT ? (
                                <Image src={`/nft/${weaponId}.png`} alt={details.name} fill className="object-cover" />
                              ) : isStarterWeapon ? (
                                <Image src="/nft/bamboo_stick.svg" alt={details.name} fill className="object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Sword size={28} className="text-zinc-600" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-200 truncate flex items-center gap-1">
                              {details.name} {isNFT && <Gem size={9} className="text-purple-400 shrink-0" />}
                            </span>
                            <span className="text-[9px] text-zinc-500">+{details.attack} ATK</span>
                            {isEquipped ? (
                              <span className="text-center text-[9px] bg-yellow-950 text-yellow-400 border border-yellow-800/80 px-2 py-1 rounded font-bold">EQUIPPED</span>
                            ) : (
                              <button onClick={() => equipWeapon(weaponId)} className="bg-purple-600 hover:bg-purple-500 text-white text-[9px] px-2 py-1 rounded font-bold">
                                EQUIP
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {playerData.abilities && playerData.abilities.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] text-zinc-400 font-semibold tracking-wider">Special Abilities</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {playerData.abilities.map((abilityId: string) => {
                          const def = AVAX_ITEMS.find(i => i.id === abilityId);
                          const isEquipped = playerData.activeAbility === abilityId;
                          const ownedNft = playerData.nftItems?.find((n: any) => n.itemId === abilityId);
                          return (
                            <div key={abilityId} className="flex flex-col gap-1.5 bg-black/40 border border-zinc-800/80 rounded-xl p-2.5">
                              <div
                                className={`relative w-full aspect-square rounded-lg overflow-hidden bg-zinc-950 ${ownedNft ? 'cursor-pointer' : ''}`}
                                onClick={() => ownedNft && setSelectedNft(ownedNft)}
                              >
                                <Image src={`/nft/${abilityId}.png`} alt={def?.name ?? abilityId} fill className="object-cover" />
                              </div>
                              <span className="text-[10px] font-bold text-zinc-200 truncate flex items-center gap-1">
                                {def?.name ?? abilityId} <Gem size={9} className="text-purple-400 shrink-0" />
                              </span>
                              <span className="text-[9px] text-purple-300">{def?.effect}</span>
                              {isEquipped ? (
                                <span className="text-center text-[9px] bg-yellow-950 text-yellow-400 border border-yellow-800/80 px-2 py-1 rounded font-bold">EQUIPPED</span>
                              ) : (
                                <button onClick={() => equipAbility(abilityId)} className="bg-purple-600 hover:bg-purple-500 text-white text-[9px] px-2 py-1 rounded font-bold">
                                  EQUIP
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-zinc-400 font-semibold tracking-wider flex items-center gap-1">
                      <Backpack size={11} /> Bag
                    </span>
                    {playerData.nftItems && playerData.nftItems.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {playerData.nftItems.map((nft: any) => {
                          const def = AVAX_ITEMS.find(i => i.id === nft.itemId);
                          return (
                            <div key={nft.itemId} className="flex items-center gap-1.5 bg-purple-950/30 p-2 rounded border border-purple-800/40">
                              <span className="text-base">{def?.icon ?? '🎁'}</span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-zinc-100 truncate">{def?.name ?? nft.itemId}</span>
                                <span className="text-[8px] text-purple-400">Token #{nft.tokenId}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {playerData.inventory && playerData.inventory.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {playerData.inventory.map((inv: any) => (
                          <div key={inv.item} className="flex justify-between items-center bg-zinc-900 p-2 rounded border border-zinc-800">
                            <span className="capitalize text-[11px] font-bold text-zinc-200">
                              {inv.item === 'scorpion' ? '🦂 Scorpion Shell' : '🔥 Fire Brand'}
                            </span>
                            <span className="bg-purple-900/60 text-purple-200 px-1.5 py-0.5 rounded text-[10px] font-bold">x{inv.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (!playerData.nftItems || playerData.nftItems.length === 0) && (
                      <div className="text-center text-zinc-500 py-4 text-[11px]">
                        Bag empty. Buy weapons in the Tavern to mint NFTs.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CODEX / MAP */}
              {section === 'codex' && (
                <div className="flex flex-col gap-4 w-full">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Zone Map & Bestiary</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ZONE_INFO.map((zone, i) => {
                      const zNum = i + 1;
                      const unlocked = (playerData.maxUnlockedZone || 1) >= zNum;
                      return (
                        <div key={zone.sceneKey} className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                          {/* Zone preview image */}
                          <div className="relative w-full aspect-video bg-zinc-950">
                            <Image
                              src={`/zones/${zone.sceneKey}.png`}
                              alt={zone.name}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                            {!unlocked && (
                              <div className="absolute inset-0 bg-black/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5">
                                <span className="text-2xl">🔒</span>
                                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Locked</span>
                              </div>
                            )}
                            <span className={`absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${unlocked ? 'bg-emerald-950/80 border border-emerald-700/50 text-emerald-300' : 'bg-zinc-950/80 border border-zinc-700/50 text-zinc-400'}`}>
                              {unlocked ? 'Unlocked' : `Zone ${zNum}`}
                            </span>
                          </div>

                          {/* Write-up */}
                          <div className="flex flex-col gap-1.5 p-3">
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${zone.color}`}>{zone.name}</span>
                            <p className="text-zinc-400 text-[11px] leading-relaxed">
                              <strong>{zone.enemyName}:</strong> {zone.enemyDesc}<br />
                              <strong>{zone.bossName} (Boss):</strong> {zone.bossDesc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PROFILE */}
              {section === 'profile' && (() => {
                const displayAddr = walletAddress || playerData?.wallet_address || '';
                return (
                  <div className="flex flex-col gap-3 w-full">
                    {displayAddr ? (
                      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Wallet</span>
                          {walletConnected
                            ? <span className="text-[9px] bg-green-900/50 text-green-400 border border-green-800/50 px-1.5 py-0.5 rounded-full font-bold">Connected</span>
                            : <span className="text-[9px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded-full font-bold">Reward address</span>}
                        </div>
                        <div className="flex items-center gap-2 bg-black/40 rounded-lg px-2 py-1.5">
                          <span className="text-[10px] font-mono text-zinc-300 flex-1 truncate">
                            {displayAddr.slice(0, 8)}…{displayAddr.slice(-6)}
                          </span>
                          <button
                            onClick={() => { navigator.clipboard.writeText(displayAddr); setAddressCopied(true); setTimeout(() => setAddressCopied(false), 2000); }}
                            className="text-zinc-400 hover:text-white shrink-0 text-[9px] font-bold"
                          >
                            {addressCopied ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={async () => {
                            try {
                              showFlashMessage('Opening Google login...');
                              const { web3authLogin } = await import('../lib/web3auth');
                              await web3authLogin();
                              const newAddr = await avalancheService.getConnectedAddress();
                              if (newAddr) {
                                await dbService.savePlayer({ ...playerData, wallet_address: newAddr });
                                fetch('/api/fund-new-wallet', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ walletAddress: newAddr }),
                                }).then(r => r.json()).then(d => {
                                  if (d.success && !d.skipped) showFlashMessage('Wallet funded with AVAX for gas!');
                                }).catch(console.error);
                              }
                              await connectWallet();
                              showFlashMessage('Logged in with Google! Welcome.');
                            } catch (err) {
                              console.error('Web3Auth Login failed', err);
                              showFlashMessage('Google login failed. Try again.');
                            }
                          }}
                          className="w-full bg-white text-black py-3 rounded-xl text-xs font-bold tracking-wider hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /><path d="M1 1h22v22H1z" fill="none" /></svg>
                          Log in with Google
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">AVAX Balance</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[15px] font-extrabold text-emerald-300 leading-none">
                            {parseFloat(avaxBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </span>
                          <button onClick={refreshBalance} className="text-emerald-700 hover:text-emerald-400 ml-auto">
                            <RefreshCw size={9} />
                          </button>
                        </div>
                        <span className="text-[9px] text-emerald-700">Avalanche C-Chain</span>
                      </div>
                      <div className="bg-purple-950/40 border border-purple-800/40 rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[9px] text-purple-400 font-bold uppercase tracking-wider">FABLE Balance</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[15px] font-extrabold text-purple-300 leading-none">
                            {parseFloat(fableBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                          <button onClick={refreshBalance} className="text-purple-700 hover:text-purple-400 ml-auto">
                            <RefreshCw size={9} />
                          </button>
                        </div>
                        <span className="text-[9px] text-purple-700">Soulbound in-game currency</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Level', value: playerData.level, color: 'text-purple-300', bg: 'bg-purple-950/30 border-purple-800/30' },
                        { label: 'Zones Cleared', value: `${levelsCleared}/4`, color: 'text-blue-300', bg: 'bg-blue-950/30 border-blue-800/30' },
                        { label: 'NFTs Owned', value: nftCount, color: 'text-pink-300', bg: 'bg-pink-950/30 border-pink-800/30' },
                      ].map(stat => (
                        <div key={stat.label} className={`${stat.bg} border rounded-xl p-2.5 flex flex-col items-center gap-1`}>
                          <span className={`text-[16px] font-extrabold ${stat.color}`}>{stat.value}</span>
                          <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider text-center leading-tight">{stat.label}</span>
                        </div>
                      ))}
                    </div>

                    {levelsCleared > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {Array.from({ length: levelsCleared }, (_, i) => (
                          <span key={i} className="text-[9px] bg-green-900/40 border border-green-700/40 text-green-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <CheckCircle2 size={8} /> {zoneNames[i + 1]}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Active Buffs</span>
                      {playerData.tempBuff ? (
                        <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-700/40 rounded-lg px-2.5 py-1.5">
                          <Flame size={12} className="text-amber-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-amber-300">
                              {playerData.tempBuff === 'damage' ? '+10% Damage' : '-15% Damage Taken'}
                            </span>
                            <span className="text-[8px] text-amber-600">Active this zone</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-zinc-600 italic">No active buffs</p>
                      )}
                    </div>

                    {/* ── NFT Collection ── */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">My Weapons & Abilities</span>
                      {playerData.nftItems && playerData.nftItems.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                          {playerData.nftItems.map((nft: any) => {
                            const def = AVAX_ITEMS.find(i => i.id === nft.itemId);
                            if (!def) return null;
                            return (
                              <button
                                key={nft.itemId}
                                onClick={() => setSelectedNft(nft)}
                                className="group flex flex-col gap-1.5 bg-zinc-900 border border-zinc-800 hover:border-purple-600 rounded-xl p-2 transition-colors text-left"
                              >
                                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-zinc-950">
                                  <Image src={`/nft/${def.id}.png`} alt={def.name} fill className="object-cover group-hover:scale-105 transition-transform" />
                                </div>
                                <span className="text-[10px] font-bold text-zinc-200 truncate">{def.name}</span>
                                <span className="text-[8px] text-purple-400 flex items-center gap-1">
                                  <Gem size={8} /> #{nft.tokenId}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-zinc-600 italic">No NFTs yet. Buy weapons and abilities with AVAX in the Tavern.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
    </div>
  );
}
