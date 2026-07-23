'use client';

import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { gameConfig } from '../game/config/gameConfig';
import BootScene from '../game/scenes/BootScene';
import SunfallDunesScene from '../game/scenes/SunfallDunesScene';
import EmberFieldsScene from '../game/scenes/EmberFieldsScene';
import AshwaterMarshScene from '../game/scenes/AshwaterMarshScene';
import ObsidianPeakScene from '../game/scenes/ObsidianPeakScene';
import gameBridge from '../game/systems/GameBridge';

interface GameContainerProps {
  playerData: any;
  /** Scene key to boot directly into (from Menu's Start/Continue). Defaults to the first zone. */
  startZone?: string;
}

export default function GameContainer({ playerData, startZone }: GameContainerProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const playerDataRef = useRef(playerData);
  const [isPortrait, setIsPortrait] = useState(false);

  // Detect orientation on mount and on change
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
    // 1. Initialize Phaser Game on client
    const configWithScenes: Phaser.Types.Core.GameConfig = {
      ...gameConfig,
      scene: [BootScene, SunfallDunesScene, EmberFieldsScene, AshwaterMarshScene, ObsidianPeakScene],
    };

    const game = new Phaser.Game(configWithScenes);
    gameRef.current = game;
    // BootScene reads this to decide which zone to boot straight into.
    game.registry.set('startZone', startZone || 'SunfallDunesScene');

    // 2. Setup initial listener to push character data to scenes when requested.
    // Uses a ref so the handler always reads the latest playerData, not the mount-time snapshot.
    const unsubReq = gameBridge.on('request_player_data', () => {
      gameBridge.emit('sync_player_data', playerDataRef.current);
    });

    return () => {
      // 3. Cleanup Game on unmount
      unsubReq();
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      // Do NOT call gameBridge.clear() here — it nukes HUD's listeners too.
      // Each component's own unsub functions handle their cleanup.
    };
  }, []);

  // Keep ref current and push updates to the active Phaser scene
  useEffect(() => {
    if (playerData) {
      playerDataRef.current = playerData;
      gameBridge.emit('sync_player_data', playerData);
    }
  }, [playerData]);

  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {/* Rotate-your-phone overlay — shown only on portrait devices */}
      {isPortrait && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 gap-4">
          <div className="text-5xl" style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>📱</div>
          <p className="text-white text-lg font-bold tracking-wide">Rotate your phone</p>
          <p className="text-zinc-400 text-sm">This game is best played in landscape</p>
        </div>
      )}
      <div id="game-canvas-container" className="w-full h-full" />
    </div>
  );
}
