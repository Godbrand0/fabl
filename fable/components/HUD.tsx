'use client';

import React, { useState, useEffect } from 'react';
import gameBridge from '../game/systems/GameBridge';
import { dbService } from '../lib/supabaseClient';
import { audioManager } from '../lib/audio';
import { MapPin, Award } from 'lucide-react';
import LevelClearScreen from './LevelClearScreen';
import DeathScreen from './DeathScreen';
import MiniMap from './MiniMap';
import GameControls from './GameControls';

interface HUDProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  avaxBalance: string;
  fableBalance: string;
  refreshBalance: () => Promise<void>;
  onOpenMenu: () => void;
}

export default function HUD({
  playerData,
  setPlayerData,
  walletAddress,
  walletConnected,
  connectWallet,
  avaxBalance,
  fableBalance,
  refreshBalance,
  onOpenMenu,
}: HUDProps) {
  const [currentZone, setCurrentZone] = useState<string>('Booting...');
  const [inLevelClear, setInLevelClear] = useState(false);
  const [levelClearZone, setLevelClearZone] = useState<string>('');
  const [levelClearScore, setLevelClearScore] = useState(0);
  const [inDeathScreen, setInDeathScreen] = useState(false);
  const [deathInfo, setDeathInfo] = useState<{ zone: string; runScore: number; enemiesDefeated: number; requiredDefeatsToBoss: number; bossSpawned: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);


  useEffect(() => {
    // 1. Scene Changes — replayLast=true so HUD always gets the zone even if it
    //    mounted after the zone scene already emitted scene_changed during Phaser boot.
    const unsubScene = gameBridge.on('scene_changed', (data: any) => {
      setCurrentZone(data.title);
      setInLevelClear(false);
      setPlayerData((prev: any) => {
        if (prev.currentZone === data.scene) return prev;
        const updated = { ...prev, currentZone: data.scene };
        dbService.savePlayer(updated);
        return updated;
      });
    }, true);

    // 2. Mid-zone kill progress — update locally every kill, persist every 5th
    //    (and whenever the menu is opened) to avoid a write per kill.
    const unsubZoneProgress = gameBridge.on('zone_progress_updated', (data: { zone: string; enemiesDefeated: number; runScore: number }) => {
      setPlayerData((prev: any) => {
        const zoneProgress = { ...(prev.zoneProgress || {}), [data.zone]: { enemiesDefeated: data.enemiesDefeated, runScore: data.runScore } };
        const updated = { ...prev, zoneProgress };
        if (data.enemiesDefeated % 5 === 0) dbService.savePlayer(updated);
        return updated;
      });
    });
    const unsubPauseFlush = gameBridge.on('game_pause', () => {
      setPlayerData((prev: any) => { dbService.savePlayer(prev); return prev; });
    });

    // Lets other overlays (e.g. LevelClearScreen after the final zone) open the menu directly
    const unsubOpenMenu = gameBridge.on('open_menu', () => onOpenMenu());

    // 3. Health Sync
    const unsubHP = gameBridge.on('player_health_changed', (data: any) => {
      setPlayerData((prev: any) => {
        const nextHP = Math.max(0, data.hp);
        return { ...prev, hp: nextHP };
      });
    });

    // 5. XP Sync
    const unsubXP = gameBridge.on('player_xp_gained', (gained: number) => {
      setPlayerData((prev: any) => {
        let newXP = prev.xp + gained;
        let newLevel = prev.level;
        let statPoints = prev.statPoints || 0;
        const xpNeeded = newLevel * 100;
        if (newXP >= xpNeeded) {
          newXP -= xpNeeded;
          newLevel += 1;
          statPoints += 5;
          setTimeout(() => {
            showFlashMessage(`LEVEL UP! You reached Level ${newLevel}!`);
            audioManager.playSfx('levelUp');
          }, 0);
        }
        const updated = { ...prev, xp: newXP, level: newLevel, statPoints };
        dbService.savePlayer(updated);
        return updated;
      });
    });

    // 6. Loot Sync
    const unsubLoot = gameBridge.on('loot_collected', (data: any) => {
      setPlayerData((prev: any) => {
        const inventory = [...(prev.inventory || [])];
        const index = inventory.findIndex(i => i.item === data.item);
        if (index >= 0) {
          inventory[index].count += 1;
        } else {
          inventory.push({ item: data.item, count: 1 });
        }
        const updated = { ...prev, inventory };
        dbService.savePlayer(updated);
        return updated;
      });
    });

    // 7. Zone Cleared → show level clear/potion screen
    const unsubClear = gameBridge.on('zone_cleared', (data: any) => {
      setPlayerData((prev: any) => {
        let maxUnlocked = prev.maxUnlockedZone || 1;
        if (data.zone === 'SunfallDunesScene' && maxUnlocked < 2) maxUnlocked = 2;
        if (data.zone === 'EmberFieldsScene' && maxUnlocked < 3) maxUnlocked = 3;
        if (data.zone === 'AshwaterMarshScene' && maxUnlocked < 4) maxUnlocked = 4;
        const zoneProgress = { ...(prev.zoneProgress || {}) };
        delete zoneProgress[data.zone];
        const updated = { ...prev, maxUnlockedZone: maxUnlocked, zoneProgress, currentZone: null };
        dbService.savePlayer(updated);
        return updated;
      });
      setLevelClearZone(data.zone);
      setLevelClearScore(data.score ?? 0);
      setInLevelClear(true);
    });

    // 9. Death Handler — shows the Died screen (quit vs. pay-to-continue),
    // both of which require a signature before the player can proceed.
    const unsubDeath = gameBridge.on('player_died', (data: any) => {
      setDeathInfo({
        zone: data.zone,
        runScore: data.runScore ?? 0,
        enemiesDefeated: data.enemiesDefeated ?? 0,
        requiredDefeatsToBoss: data.requiredDefeatsToBoss ?? 8,
        bossSpawned: !!data.bossSpawned,
      });
      setInDeathScreen(true);
    });

    // Retry requesting scene info after Phaser has had time to boot.
    const t1 = setTimeout(() => gameBridge.emit('request_scene_info'), 300);
    const t2 = setTimeout(() => gameBridge.emit('request_scene_info'), 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      unsubScene();
      unsubZoneProgress();
      unsubPauseFlush();
      unsubOpenMenu();
      unsubHP();
      unsubXP();
      unsubLoot();
      unsubClear();
      unsubDeath();
    };
  }, []);

  const showFlashMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };
  return (
    <div className="absolute inset-0 flex flex-col pointer-events-none select-none justify-between font-mono">
      {/* 1. Top HUD Header */}
      <div className="w-full p-4 flex justify-between items-start pointer-events-auto bg-linear-to-b from-black/80 via-black/30 to-transparent">
        {/* Left: Player Profile & Stats + Minimap */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 bg-black/60 border border-zinc-800 p-2 rounded-lg backdrop-blur-md">
            {/* HP Bar */}
            <div className="w-24 flex flex-col gap-0.5 mt-0.5">
              <div className="flex justify-between text-[8px] text-zinc-400 font-bold tracking-wider">
                <span className="flex items-center gap-0.5 text-red-500">HP</span>
                <span>{playerData.hp}/{playerData.maxHp}</span>
              </div>
              <div className="w-full bg-zinc-950 h-1.5 rounded border border-zinc-800 overflow-hidden">
                <div
                  className="bg-red-500 h-full transition-all duration-300"
                  style={{ width: `${(playerData.hp / playerData.maxHp) * 100}%` }}
                />
              </div>
            </div>

            {/* XP Bar */}
            <div className="w-24 flex flex-col gap-0.5 mt-1">
              <div className="flex justify-between text-[8px] text-zinc-400 font-bold tracking-wider">
                <span className="text-green-500">XP</span>
                <span>{playerData.xp}/{playerData.level * 100}</span>
              </div>
              <div className="w-full bg-zinc-950 h-1 rounded border border-zinc-800 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all duration-300"
                  style={{ width: `${(playerData.xp / (playerData.level * 100)) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {!inLevelClear && <MiniMap />}
        </div>

        {/* Currency & Zone */}
        <div className="flex flex-col gap-1 items-end">
          <div className="flex gap-1.5 bg-black/60 border border-zinc-800 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md">
            <span className="text-purple-400">◆ {parseFloat(fableBalance).toFixed(2)} FABLE</span>
            <span className="text-zinc-500">|</span>
            <span className="text-emerald-400 flex items-center gap-1 font-bold">
              ◈ {parseFloat(avaxBalance).toFixed(4)} AVAX
            </span>
          </div>
          
          <div className="flex items-center gap-1 bg-black/40 border border-zinc-800/80 px-2 py-0.5 rounded text-[10px] text-zinc-300 font-semibold">
            <MapPin size={10} className="text-zinc-400" />
            <span>{currentZone}</span>
          </div>

          {playerData.pendingRewards && playerData.pendingRewards.length > 0 && (
            <div className="flex items-center gap-1 bg-linear-to-r from-green-600/80 to-emerald-600/80 border border-green-500/30 px-2 py-0.5 rounded text-[9px] text-green-100 font-bold animate-pulse">
              <Award size={10} />
              <span>{playerData.pendingRewards.length} Reward{playerData.pendingRewards.length > 1 ? 's' : ''} Pending! Visit Bank</span>
            </div>
          )}

          {/* Menu Button — pauses the running scene and opens the full-page menu */}
          <button
            onClick={() => { audioManager.playSfx('click'); onOpenMenu(); }}
            className="mt-1 bg-zinc-900 border-2 border-zinc-700 px-3 py-1 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors shadow-lg active:scale-95"
            style={{ imageRendering: 'pixelated', fontFamily: 'monospace' }}
          >
            MENU
          </button>
        </div>
      </div>

      {/* 2. Middle Overlay (Message / Warning / Tavern Overlay) */}
      <div className="flex-1 flex flex-col items-center justify-center pointer-events-none p-4">
        {message && (
          <div className="bg-black/85 border-2 border-purple-500 text-purple-300 px-4 py-2.5 rounded-lg text-center text-xs font-bold shadow-xl shadow-black/80 animate-bounce pointer-events-auto max-w-70">
            {message}
          </div>
        )}

      </div>

      {/* 3. Bottom Controls Area */}
      <GameControls />

      {/* Level Clear / Potion Shop overlay — rendered LAST so it sits above all other HUD layers */}
      {inLevelClear && (
        <LevelClearScreen
          clearedZone={levelClearZone}
          runScore={levelClearScore}
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletAddress={walletAddress || playerData?.wallet_address || undefined}
          walletConnected={walletConnected}
          connectWallet={connectWallet}
          fableBalance={fableBalance}
          refreshBalance={refreshBalance}
          onContinue={() => setInLevelClear(false)}
        />
      )}

      {/* Death overlay — quit (signed checkpoint) or pay to continue (signed + FABLE burn) */}
      {inDeathScreen && deathInfo && (
        <DeathScreen
          zone={deathInfo.zone}
          runScore={deathInfo.runScore}
          enemiesDefeated={deathInfo.enemiesDefeated}
          requiredDefeatsToBoss={deathInfo.requiredDefeatsToBoss}
          bossSpawned={deathInfo.bossSpawned}
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletAddress={walletAddress || playerData?.wallet_address || undefined}
          walletConnected={walletConnected}
          connectWallet={connectWallet}
          fableBalance={fableBalance}
          refreshBalance={refreshBalance}
          onQuit={() => setInDeathScreen(false)}
          onContinue={() => setInDeathScreen(false)}
        />
      )}
    </div>
  );
}
