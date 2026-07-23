'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { avalancheService } from '../lib/avalanche';
import { dbService } from '../lib/supabaseClient';
import { AVAX_ITEMS, GOLD_ITEMS, AvaxItemDef, GoldItemDef } from '../lib/nft';
import gameBridge from '../game/systems/GameBridge';
import { X, Gem } from 'lucide-react';

// Re-export weapon list for HUD loadout panel
export const TAVERN_WEAPONS = [
  { id: 'bamboo_stick', name: 'Bamboo Stick', attack: 5, textureKey: 'player_bamboo' },
  ...AVAX_ITEMS.filter(i => i.category === 'weapon').map(i => ({
    id: i.id, name: i.name, attack: i.attack ?? 0,
    textureKey: i.id === 'iron_sword' ? 'player_iron_sword' : i.id === 'ember_blade' ? 'player_ember_blade' : 'player_obsidian_gs'
  }))
];

type ShopTab = 'gold' | 'avax';

interface TavernShopProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  avaxBalance: string;
  refreshBalance: () => Promise<void>;
  onLeave: () => void;
  showMessage: (msg: string) => void;
}

const AVAX_COLS = 2;  // weapons col 0, abilities col 1
const AVAX_ROWS = 3;
const GOLD_COLS = 2; // potions col 0, buffs col 1
const GOLD_ROWS = 3;

export default function TavernShop({
  playerData, setPlayerData,
  walletAddress, walletConnected, connectWallet,
  avaxBalance, refreshBalance,
  onLeave, showMessage,
}: TavernShopProps) {
  const [tab, setTab]       = useState<ShopTab>('gold');
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const [buying, setBuying] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const lastJoyRef          = useRef(0);

  // Refs so event-listener closures always see fresh values
  const playerDataRef    = useRef(playerData);
  const avaxBalRef        = useRef(avaxBalance);
  const walletAddrRef    = useRef(walletAddress);
  const buyingRef        = useRef(buying);
  const cursorRef        = useRef(cursor);
  const tabRef           = useRef(tab);

  useEffect(() => { playerDataRef.current    = playerData;      }, [playerData]);
  useEffect(() => { avaxBalRef.current       = avaxBalance;     }, [avaxBalance]);
  useEffect(() => { walletAddrRef.current    = walletAddress;   }, [walletAddress]);
  useEffect(() => { buyingRef.current        = buying;          }, [buying]);
  useEffect(() => { cursorRef.current        = cursor;          }, [cursor]);
  useEffect(() => { tabRef.current           = tab;             }, [tab]);

  // Reset cursor when changing tabs
  const switchTab = useCallback((t: ShopTab) => {
    setTab(t);
    setCursor({ col: 0, row: 0 });
  }, []);

  const cols = tab === 'gold' ? GOLD_COLS : AVAX_COLS;
  const rows = tab === 'gold' ? GOLD_ROWS : AVAX_ROWS;

  const getAvaxItem = (col: number, row: number): AvaxItemDef | null =>
    AVAX_ITEMS.find(i => i.col === col && i.row === row) ?? null;
  const getGoldItem = (col: number, row: number): GoldItemDef | null =>
    GOLD_ITEMS.find(i => i.col === col && i.row === row) ?? null;

  const isAvaxItemOwned = (id: string, pd = playerDataRef.current): boolean => {
    const item = AVAX_ITEMS.find(i => i.id === id);
    if (!item) return false;
    if (item.category === 'weapon')  return pd.arsenal?.includes(id);
    if (item.category === 'ability') return pd.abilities?.includes(id);
    return false;
  };

  const canAffordAvax = (avaxCost: number) => parseFloat(avaxBalRef.current) >= avaxCost;
  const canAffordGold = (goldCost: number) => (playerDataRef.current.gold ?? 0) >= goldCost;

  const move = useCallback((dCol: number, dRow: number) => {
    const maxCols = tabRef.current === 'gold' ? GOLD_COLS : AVAX_COLS;
    const maxRows = tabRef.current === 'gold' ? GOLD_ROWS : AVAX_ROWS;
    setCursor(prev => ({
      col: Math.max(0, Math.min(maxCols - 1, prev.col + dCol)),
      row: Math.max(0, Math.min(maxRows - 1, prev.row + dRow)),
    }));
  }, []);

  // ── Gold purchase (no signing) ─────────────────────────────────────────────
  const buyGoldItem = useCallback(async () => {
    const { col, row } = cursorRef.current;
    const item = GOLD_ITEMS.find(i => i.col === col && i.row === row);
    if (!item || buyingRef.current) return;

    const pd = playerDataRef.current;
    if ((pd.gold ?? 0) < item.goldCost) {
      showMessage(`Need ${item.goldCost}🪙 — not enough gold!`);
      return;
    }

    setBuying(true);
    try {
      setPlayerData((prev: any) => {
        let updated = { ...prev, gold: prev.gold - item.goldCost };
        if (item.heal) {
          updated.hp = Math.min(prev.maxHp, prev.hp + item.heal);
          gameBridge.emit('player_health_changed', { hp: updated.hp });
        }
        if (item.fullHeal) {
          updated.hp = prev.maxHp;
          gameBridge.emit('player_health_changed', { hp: updated.hp });
        }
        if (item.tempBuff) {
          updated.tempBuff = item.tempBuff; // scene picks this up from sync_player_data
        }
        dbService.savePlayer(updated);
        return updated;
      });
      showMessage(`${item.icon} ${item.name} used! ${item.effect}`);
    } finally {
      setBuying(false);
    }
  }, [setPlayerData, showMessage]);

  // ── AVAX purchase (signs tx → mints NFT) ───────────────────────────────────
  const buyAvaxItem = useCallback(async () => {
    const { col, row } = cursorRef.current;
    const item = AVAX_ITEMS.find(i => i.col === col && i.row === row);
    if (!item || buyingRef.current) return;

    const pd = playerDataRef.current;
    if (isAvaxItemOwned(item.id, pd)) {
      showMessage(`You already own ${item.name}!`);
      return;
    }

    if (parseFloat(avaxBalRef.current) < item.avaxCost) {
      showMessage(`Need ${item.avaxCost} AVAX — not enough balance!`);
      return;
    }

    setBuying(true);
    try {
      // Ensure wallet connected
      let addr = walletAddrRef.current;
      if (!addr) {
        await connectWallet();
        addr = (await avalancheService.getConnectedAddress()) ?? '';
      }
      if (!addr) { showMessage('Connect your wallet to purchase with AVAX.'); return; }

      // Single tx: pays AVAX to treasury and mints the NFT atomically
      showMessage(`Sending ${item.avaxCost} AVAX and minting ${item.name}…`);
      const nftItem = await avalancheService.buyItemWithAvax(addr, item.id, item.rarity, item.avaxCost, {
        attack: item.attack,
        weaponType: item.category === 'weapon' ? 'Sword' : 'Ability',
      });
      if (!nftItem) { showMessage('Purchase failed. Check your AVAX balance.'); return; }

      await refreshBalance();

      setPlayerData((prev: any) => {
        let updated = { ...prev };
        if (item.category === 'weapon') {
          const arsenal = [...(prev.arsenal || ['bamboo_stick'])];
          if (!arsenal.includes(item.id)) arsenal.push(item.id);
          updated = { ...updated, arsenal, equippedWeapon: item.id };
        } else if (item.category === 'ability') {
          const abilities = [...(prev.abilities || [])];
          if (!abilities.includes(item.id)) abilities.push(item.id);
          updated = { ...updated, abilities };
        }
        const nftItems = [...(prev.nftItems || [])];
        if (!nftItems.some(n => n.itemId === item.id)) nftItems.push(nftItem);
        updated = { ...updated, nftItems };
        dbService.savePlayer(updated);
        return updated;
      });

      const txMsg = nftItem.txHash.startsWith('mock_')
        ? `(mock mode)`
        : `Tx: ${nftItem.txHash.slice(0, 10)}…`;
      showMessage(`${item.icon} ${item.name} minted! ${txMsg}`);
    } catch (err) {
      console.error('AVAX purchase failed:', err);
      showMessage('Purchase failed. Please try again.');
    } finally {
      setBuying(false);
    }
  }, [connectWallet, refreshBalance, setPlayerData, showMessage]);

  // Dispatch to correct buy fn based on active tab
  const handleBuyRef = useRef<() => void>(() => {});
  handleBuyRef.current = tab === 'gold' ? buyGoldItem : buyAvaxItem;

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':  move(-1,  0); break;
        case 'ArrowRight': move( 1,  0); break;
        case 'ArrowUp':    move( 0, -1); break;
        case 'ArrowDown':  move( 0,  1); break;
        case 'Tab':
          e.preventDefault();
          switchTab(tabRef.current === 'gold' ? 'avax' : 'gold');
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          handleBuyRef.current();
          break;
        case 'Escape':
          onLeave();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, onLeave, switchTab]);

  // ── Joystick navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = gameBridge.on('joystick_left', (dir: { x: number; y: number }) => {
      const now = Date.now();
      if (now - lastJoyRef.current < 280) return;
      const ax = Math.abs(dir.x), ay = Math.abs(dir.y);
      if (ax < 0.4 && ay < 0.4) return;
      lastJoyRef.current = now;
      if (ax >= ay) move(dir.x > 0 ? 1 : -1, 0);
      else move(0, dir.y > 0 ? 1 : -1);
    });
    return unsub;
  }, [move]);

  // ── Render helpers ───────────────────────────────────────────────────────
  const avaxCellBorder = (item: AvaxItemDef, isActive: boolean) => {
    if (!isActive) return 'border-zinc-700/40';
    if (isAvaxItemOwned(item.id)) return 'border-blue-500 shadow-blue-500/20 shadow-lg';
    if (canAffordAvax(item.avaxCost)) return 'border-emerald-500 shadow-emerald-500/20 shadow-lg';
    return 'border-red-500 shadow-red-500/20 shadow-lg';
  };

  const goldCellBorder = (item: GoldItemDef | null, isActive: boolean) => {
    if (!item || !isActive) return 'border-zinc-700/40';
    if (canAffordGold(item.goldCost)) return 'border-yellow-500 shadow-yellow-500/20 shadow-lg';
    return 'border-red-500 shadow-red-500/20 shadow-lg';
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/97 backdrop-blur-sm font-mono text-zinc-100 pointer-events-auto overflow-hidden">

      {/* ── Info / close bar (title omitted — sidebar already shows "Tavern") ── */}
      <div className="flex items-center justify-end gap-2 px-2 py-1 border-b border-yellow-900/40 bg-zinc-950 shrink-0">
        <button
          onClick={() => setShowInfo(true)}
          className="text-zinc-400 hover:text-white transition-colors bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
        >
          ℹ️
        </button>
        <button onClick={onLeave} className="text-zinc-500 hover:text-zinc-200 p-0.5">
          <X size={15} />
        </button>
      </div>

      {/* ── Tab switcher ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-zinc-800 shrink-0">
        <button
          onClick={() => switchTab('gold')}
          className={`py-2 text-[10px] font-bold uppercase tracking-widest border-r border-zinc-800 transition-colors ${
            tab === 'gold'
              ? 'text-yellow-400 bg-yellow-950/20 border-b-2 border-b-yellow-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          🪙 Gold Shop
          <span className="block text-[8px] font-normal text-zinc-600 normal-case tracking-normal">No signing required</span>
        </button>
        <button
          onClick={() => switchTab('avax')}
          className={`py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
            tab === 'avax'
              ? 'text-emerald-400 bg-emerald-950/20 border-b-2 border-b-emerald-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span className="flex items-center justify-center gap-1">
            ◈ AVAX Shop <Gem size={10} className="text-purple-400" />
          </span>
          <span className="block text-[8px] font-normal text-zinc-600 normal-case tracking-normal">Signs tx · mints NFT to wallet</span>
        </button>
      </div>

      {/* ── Gold Shop grid ────────────────────────────────────────────────── */}
      {tab === 'gold' && (
        <>
          <div className="overflow-y-auto overscroll-contain flex-1" style={{ touchAction: 'pan-y' }}>
            <div className="grid grid-cols-2 gap-1.5 p-1.5">
              {Array.from({ length: GOLD_COLS }, (_, col) =>
                Array.from({ length: GOLD_ROWS }, (_, row) => {
                  const item     = getGoldItem(col, row);
                  const isActive = cursor.col === col && cursor.row === row;
                  if (!item) return (
                    <div key={`${col}-${row}`} className="rounded-lg border-2 border-zinc-800/20 bg-zinc-900/10 min-h-16" />
                  );
                  const affordable = canAffordGold(item.goldCost);
                  const buyNow = () => {
                    // cursorRef must be current *before* the buy fires — the buy
                    // functions read cursorRef synchronously, but the effect that
                    // normally syncs it from `cursor` state lags one render behind.
                    cursorRef.current = { col, row };
                    setCursor({ col, row });
                    handleBuyRef.current();
                  };
                  return (
                    <div
                      key={item.id}
                      onClick={() => setCursor({ col, row })}
                      className={`flex flex-col items-center justify-center p-1 rounded-lg border-2 transition-all text-center select-none min-h-16 gap-0.5
                        ${isActive ? 'bg-zinc-800/70' : 'bg-zinc-900/30 hover:bg-zinc-800/30'}
                        ${goldCellBorder(item, isActive)}`}
                    >
                      <span className="text-lg leading-none">{item.icon}</span>
                      <span className={`text-[8px] font-bold leading-tight ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>{item.name}</span>
                      <button
                        onClick={buyNow}
                        disabled={buying || !affordable}
                        className={`w-full mt-0.5 px-1 py-0.5 rounded text-[8px] font-bold active:scale-95 transition-all ${
                          affordable ? 'bg-yellow-600 hover:bg-yellow-500 text-black' : 'bg-zinc-800 text-red-400 border border-red-900/40'
                        }`}
                      >
                        {affordable ? `BUY ${item.goldCost}🪙` : 'No Gold'}
                      </button>
                    </div>
                  );
                })
              ).flat()}
            </div>
          </div>
        </>
      )}

      {/* ── AVAX Shop grid ───────────────────────────────────────────────── */}
      {tab === 'avax' && (
        <>
          <div className="overflow-y-auto overscroll-contain flex-1" style={{ touchAction: 'pan-y' }}>
            <div className="grid grid-cols-2 gap-1.5 p-1.5">
              {Array.from({ length: AVAX_COLS }, (_, col) =>
                Array.from({ length: AVAX_ROWS }, (_, row) => {
                  const item     = getAvaxItem(col, row);
                  const isActive = cursor.col === col && cursor.row === row;
                  if (!item) return null;
                  const owned      = isAvaxItemOwned(item.id);
                  const affordable = canAffordAvax(item.avaxCost);
                  const buyNow = () => {
                    cursorRef.current = { col, row };
                    setCursor({ col, row });
                    handleBuyRef.current();
                  };
                  return (
                    <div
                      key={item.id}
                      onClick={() => setCursor({ col, row })}
                      className={`flex flex-col items-center justify-center p-1 rounded-lg border-2 transition-all text-center select-none min-h-20 gap-0.5
                        ${isActive ? 'bg-zinc-800/70' : 'bg-zinc-900/30 hover:bg-zinc-800/30'}
                        ${avaxCellBorder(item, isActive)}`}
                    >
                      <div className="relative w-8 h-8 shrink-0">
                        <Image
                          src={`/nft/${item.id}.png`}
                          alt={item.name}
                          fill
                          className="object-contain rounded"
                          sizes="32px"
                        />
                      </div>
                      <span className={`text-[8px] font-bold leading-tight ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>{item.name}</span>
                      {owned ? (
                        <span className="w-full mt-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-blue-950/40 text-blue-400 border border-blue-800/50">✓ OWNED</span>
                      ) : (
                        <button
                          onClick={buyNow}
                          disabled={buying || !affordable}
                          className={`w-full mt-0.5 px-1 py-0.5 rounded text-[8px] font-bold active:scale-95 transition-all ${
                            affordable ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-zinc-800 text-red-400 border border-red-900/40'
                          }`}
                        >
                          {affordable ? `${item.avaxCost} AVAX` : 'Need AVAX'}
                        </button>
                      )}
                    </div>
                  );
                })
              ).flat()}
            </div>
          </div>
        </>
      )}
      
      {/* ── Info Modal ──────────────────────────────────────────────────────── */}
      {showInfo && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="bg-zinc-950 border-2 border-yellow-900/50 p-4 rounded-xl flex flex-col gap-3 max-w-sm">
            <h2 className="text-yellow-400 font-bold text-sm border-b border-zinc-800 pb-2">Tavern Guide</h2>
            <p className="text-xs text-zinc-300">
              <span className="text-yellow-400 font-bold">Gold (G)</span> is used to buy standard potions, healing, and temporary buffs. You earn it by defeating enemies in combat zones.
            </p>
            <p className="text-xs text-zinc-300">
              <span className="text-emerald-400 font-bold">AVAX</span> is real cryptocurrency on Avalanche. It is used to buy premium NFT weapons and abilities — each one is minted straight to your wallet and is yours to keep or resell.
            </p>
            <button onClick={() => setShowInfo(false)} className="mt-2 bg-yellow-900/50 hover:bg-yellow-800/50 text-yellow-400 font-bold py-1.5 rounded border border-yellow-700/50 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
