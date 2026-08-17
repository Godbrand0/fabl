'use client';

import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { gameConfig } from '../game/config/gameConfig';
import BootScene from '../game/scenes/BootScene';
import MultiplayerArenaScene from '../game/scenes/MultiplayerArenaScene';
import gameBridge from '../game/systems/GameBridge';
import networkBridge from '../game/systems/NetworkBridge';
import { dbService } from '../lib/supabaseClient';

interface MultiplayerGameContainerProps {
  /** The local player's own live PlayerData — same shape single-player uses. */
  playerData: any;
  partyId: string;
  wallet: string;
  partySize: number;
  /** Boot-time guess at whether this client is host — NetworkBridge confirms/corrects
   *  it for real once Presence syncs, and keeps it up to date if the host migrates. */
  isHost: boolean;
  /** When this client joined the party (lobby's joinedAtRef) — the tie-break NetworkBridge
   *  uses to deterministically pick a new spawn authority if the host disconnects. */
  joinedAt: number;
  /** Wallets of every OTHER party member — their real gear/stats are fetched live. */
  otherWallets: string[];
}

// Mirrors GameContainer.tsx's Phaser bootstrap, but boots only the dedicated
// multiplayer arena and additionally wires the Realtime NetworkBridge + pushes every
// party member's real PlayerData (not just the local player's) into the scene.
export default function MultiplayerGameContainer({ playerData, partyId, wallet, partySize, isHost, joinedAt, otherWallets }: MultiplayerGameContainerProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const playerDataRef = useRef(playerData);
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.screen?.orientation?.addEventListener('change', check);
    return () => {
      window.removeEventListener('resize', check);
      window.screen?.orientation?.removeEventListener('change', check);
    };
  }, []);

  useEffect(() => {
    // Distinct parent id from single-player's GameContainer — the pause menu can be open
    // over an active single-player run while a multiplayer mission is launched from the
    // Multiplayer tab, so both containers can briefly exist in the DOM at once.
    const configWithScenes: Phaser.Types.Core.GameConfig = {
      ...gameConfig,
      parent: 'mp-game-canvas-container',
      scene: [BootScene, MultiplayerArenaScene],
    };

    const game = new Phaser.Game(configWithScenes);
    gameRef.current = game;
    game.registry.set('startZone', 'MultiplayerArenaScene');
    game.registry.set('multiplayerContext', { partySize, isHost });

    // Never let a networking failure take down the game canvas — local play still works.
    networkBridge.start(partyId, wallet, joinedAt).catch(err => {
      console.error('networkBridge.start failed:', err);
    });

    const unsubReq = gameBridge.on('request_player_data', () => {
      gameBridge.emit('sync_player_data', playerDataRef.current);
    });

    // Real gear/stats for every teammate — the same dbService.getPlayer read every
    // other screen uses, so a party member's Void arena avatar always matches
    // whatever they actually have equipped in single-player.
    let cancelled = false;
    Promise.all(otherWallets.map(w => dbService.getPlayer(w).catch(() => null))).then(results => {
      if (cancelled) return;
      results.forEach((data, i) => {
        if (data) gameBridge.emit('sync_party_member_data', { wallet: otherWallets[i], data });
      });
    });

    return () => {
      cancelled = true;
      unsubReq();
      networkBridge.stop();
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, wallet]);

  useEffect(() => {
    if (playerData) {
      playerDataRef.current = playerData;
      gameBridge.emit('sync_player_data', playerData);
    }
  }, [playerData]);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden" style={{ touchAction: 'none' }}>
      {isPortrait && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 gap-4">
          <div className="text-5xl" style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>📱</div>
          <p className="text-white text-lg font-bold tracking-wide">Rotate your phone</p>
          <p className="text-zinc-400 text-sm">This game is best played in landscape</p>
        </div>
      )}
      <div id="mp-game-canvas-container" className="w-full h-full" />
    </div>
  );
}
