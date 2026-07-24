'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { avalancheService } from '../lib/avalanche';
import { dbService } from '../lib/supabaseClient';
import { AVAX_ITEMS, FABLE_ITEMS, AvaxItemDef, FableItemDef } from '../lib/nft';
import gameBridge from '../game/systems/GameBridge';
import { X, Gem, Info, Sword, Sparkles } from 'lucide-react';

// Re-export weapon list for HUD loadout panel
export const TAVERN_WEAPONS = [
  { id: 'bamboo_stick', name: 'Bamboo Stick', attack: 5, textureKey: 'player_bamboo' },
  ...AVAX_ITEMS.filter(i => i.category === 'weapon').map(i => ({
    id: i.id, name: i.name, attack: i.attack ?? 0,
    textureKey: i.id === 'iron_sword' ? 'player_iron_sword' : i.id === 'ember_blade' ? 'player_ember_blade' : 'player_obsidian_gs'
  }))
];

type ShopTab = 'avax' | 'items';

interface TavernShopProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  avaxBalance: string;
  fableBalance: string;
  refreshBalance: () => Promise<void>;
  onLeave: () => void;
  showMessage: (msg: string) => void;
}

const AVAX_COLS = 2;  // weapons col 0, abilities col 1
const AVAX_ROWS = 3;
const ITEMS_COLS = 2; // potions col 0, buffs col 1
const ITEMS_ROWS = 3;

export default function TavernShop({
  playerData, setPlayerData,
  walletAddress, walletConnected, connectWallet,
  avaxBalance, fableBalance, refreshBalance,
  onLeave, showMessage,
}: TavernShopProps) {
  const [tab, setTab]       = useState<ShopTab>('avax');
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const [buying, setBuying] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [detailItem, setDetailItem] = useState<AvaxItemDef | FableItemDef | null>(null);
  const lastJoyRef          = useRef(0);

  // Refs so event-listener closures always see fresh values
  const playerDataRef    = useRef(playerData);
  const avaxBalRef        = useRef(avaxBalance);
  const fableBalRef       = useRef(fableBalance);
  const walletAddrRef    = useRef(walletAddress);
  const buyingRef        = useRef(buying);
  const cursorRef        = useRef(cursor);
  const tabRef           = useRef(tab);

  useEffect(() => { playerDataRef.current    = playerData;      }, [playerData]);
  useEffect(() => { avaxBalRef.current       = avaxBalance;     }, [avaxBalance]);
  useEffect(() => { fableBalRef.current      = fableBalance;    }, [fableBalance]);
  useEffect(() => { walletAddrRef.current    = walletAddress;   }, [walletAddress]);
  useEffect(() => { buyingRef.current        = buying;          }, [buying]);
  useEffect(() => { cursorRef.current        = cursor;          }, [cursor]);
  useEffect(() => { tabRef.current           = tab;             }, [tab]);

  const TABS: ShopTab[] = ['avax', 'items'];
  const colsFor = (t: ShopTab) => t === 'avax' ? AVAX_COLS : ITEMS_COLS;
  const rowsFor = (t: ShopTab) => t === 'avax' ? AVAX_ROWS : ITEMS_ROWS;

  // Reset cursor when changing tabs
  const switchTab = useCallback((t: ShopTab) => {
    setTab(t);
    setCursor({ col: 0, row: 0 });
  }, []);

  const getAvaxItem = (col: number, row: number): AvaxItemDef | null =>
    AVAX_ITEMS.find(i => i.col === col && i.row === row) ?? null;
  const getFableItem = (col: number, row: number): FableItemDef | null =>
    FABLE_ITEMS.find(i => i.col === col && i.row === row) ?? null;

  const isWeaponOwned = (id: string, pd = playerDataRef.current): boolean => {
    const item = AVAX_ITEMS.find(i => i.id === id);
    if (!item) return false;
    if (item.category === 'weapon')  return pd.arsenal?.includes(id);
    if (item.category === 'ability') return pd.abilities?.includes(id);
    return false;
  };

  const canAffordAvax  = (avaxCost: number)  => parseFloat(avaxBalRef.current) >= avaxCost;
  const canAffordFable = (fableCost: number) => parseFloat(fableBalRef.current) >= fableCost;

  const move = useCallback((dCol: number, dRow: number) => {
    const maxCols = colsFor(tabRef.current);
    const maxRows = rowsFor(tabRef.current);
    setCursor(prev => ({
      col: Math.max(0, Math.min(maxCols - 1, prev.col + dCol)),
      row: Math.max(0, Math.min(maxRows - 1, prev.row + dRow)),
    }));
  }, []);

  // ── FableShop purchase (potions/buffs — signs tx, burns FABLE) ─────────────
  const buyFableItem = useCallback(async () => {
    const { col, row } = cursorRef.current;
    const item = FABLE_ITEMS.find(i => i.col === col && i.row === row);
    if (!item || buyingRef.current) return;

    if (!canAffordFable(item.fableCost)) {
      showMessage(`Need ${item.fableCost} FABLE — not enough balance!`);
      return;
    }

    setBuying(true);
    try {
      let addr = walletAddrRef.current;
      if (!addr) {
        await connectWallet();
        addr = (await avalancheService.getConnectedAddress()) ?? '';
      }
      if (!addr) { showMessage('Connect your wallet to spend FABLE.'); return; }

      showMessage(`Spending ${item.fableCost} FABLE on ${item.name}…`);
      const success = await avalancheService.buyShopItem(addr, item.itemId);
      if (!success) { showMessage('Purchase failed. Check your FABLE balance.'); return; }

      await refreshBalance();

      setPlayerData((prev: any) => {
        let updated = { ...prev };
        if (item.heal) {
          updated.hp = Math.min(prev.maxHp, prev.hp + item.heal);
          gameBridge.emit('player_health_changed', { hp: updated.hp });
        }
        if (item.fullHeal) {
          updated.hp = prev.maxHp;
          gameBridge.emit('player_health_changed', { hp: updated.hp });
        }
        if (item.tempBuff) {
          updated.tempBuff = item.tempBuff;
        }
        dbService.savePlayer(updated);
        return updated;
      });
      showMessage(`${item.icon} ${item.name} used! ${item.effect}`);
    } catch (err) {
      console.error('FABLE purchase failed:', err);
      showMessage('Purchase failed. Please try again.');
    } finally {
      setBuying(false);
    }
  }, [connectWallet, refreshBalance, setPlayerData, showMessage]);

  // ── AVAX purchase (signs tx → mints NFT) ───────────────────────────────────
  const buyAvaxItem = useCallback(async () => {
    const { col, row } = cursorRef.current;
    const item = AVAX_ITEMS.find(i => i.col === col && i.row === row);
    if (!item || buyingRef.current) return;

    const pd = playerDataRef.current;
    if (isWeaponOwned(item.id, pd)) {
      showMessage(`You already own ${item.name}!`);
      return;
    }

    if (!canAffordAvax(item.avaxCost)) {
      showMessage(`Need ${item.avaxCost} AVAX — not enough balance!`);
      return;
    }

    setBuying(true);
    try {
      let addr = walletAddrRef.current;
      if (!addr) {
        await connectWallet();
        addr = (await avalancheService.getConnectedAddress()) ?? '';
      }
      if (!addr) { showMessage('Connect your wallet to purchase with AVAX.'); return; }

      showMessage(`Sending ${item.avaxCost} AVAX and minting ${item.name}…`);
      const nftItem = await avalancheService.buyItemWithAvax(addr, item.id, item.weaponId, item.avaxCost);
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

      const txMsg = nftItem.txHash.startsWith('mock_') ? `(mock mode)` : `Tx: ${nftItem.txHash.slice(0, 10)}…`;
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
  handleBuyRef.current = tab === 'avax' ? buyAvaxItem : buyFableItem;

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':  move(-1,  0); break;
        case 'ArrowRight': move( 1,  0); break;
        case 'ArrowUp':    move( 0, -1); break;
        case 'ArrowDown':  move( 0,  1); break;
        case 'Tab': {
          e.preventDefault();
          const next = TABS[(TABS.indexOf(tabRef.current) + 1) % TABS.length];
          switchTab(next);
          break;
        }
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
    if (isWeaponOwned(item.id)) return 'border-blue-500 shadow-blue-500/20 shadow-lg';
    if (canAffordAvax(item.avaxCost)) return 'border-emerald-500 shadow-emerald-500/20 shadow-lg';
    return 'border-red-500 shadow-red-500/20 shadow-lg';
  };

  const fableCellBorder = (item: FableItemDef | null, isActive: boolean) => {
    if (!item || !isActive) return 'border-zinc-700/40';
    if (canAffordFable(item.fableCost)) return 'border-purple-500 shadow-purple-500/20 shadow-lg';
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
          onClick={() => switchTab('avax')}
          className={`py-2 text-[10px] font-bold uppercase tracking-widest border-r border-zinc-800 transition-colors ${
            tab === 'avax'
              ? 'text-emerald-400 bg-emerald-950/20 border-b-2 border-b-emerald-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span className="flex items-center justify-center gap-1">
            ◈ AVAX <Gem size={10} className="text-purple-400" />
          </span>
          <span className="block text-[8px] font-normal text-zinc-600 normal-case tracking-normal">Buy NFT weapons</span>
        </button>
        <button
          onClick={() => switchTab('items')}
          className={`py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
            tab === 'items'
              ? 'text-purple-400 bg-purple-950/20 border-b-2 border-b-purple-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          🧪 Items
          <span className="block text-[8px] font-normal text-zinc-600 normal-case tracking-normal">Potions &amp; buffs</span>
        </button>
      </div>

      {/* ── AVAX Shop grid ───────────────────────────────────────────────── */}
      {tab === 'avax' && (
        <div className="overflow-y-auto overscroll-contain flex-1" style={{ touchAction: 'pan-y' }}>
          <div className="grid grid-cols-2 gap-1.5 p-1.5">
            {Array.from({ length: AVAX_COLS }, (_, col) =>
              Array.from({ length: AVAX_ROWS }, (_, row) => {
                const item     = getAvaxItem(col, row);
                const isActive = cursor.col === col && cursor.row === row;
                if (!item) return null;
                const owned      = isWeaponOwned(item.id);
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
                    className={`relative flex flex-col items-center justify-center p-1 rounded-lg border-2 transition-all text-center select-none min-h-28 gap-0.5
                      ${isActive ? 'bg-zinc-800/70' : 'bg-zinc-900/30 hover:bg-zinc-800/30'}
                      ${avaxCellBorder(item, isActive)}`}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                      className="absolute top-1 right-1 text-zinc-500 hover:text-white bg-black/50 rounded-full p-0.5 z-10"
                    >
                      <Info size={11} />
                    </button>
                    <div className="relative w-9 h-9 shrink-0">
                      <Image src={`/nft/${item.id}.png`} alt={item.name} fill className="object-contain rounded" sizes="36px" />
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
                        {affordable ? `${item.avaxCost} AVAX` : `Need ${item.avaxCost} AVAX`}
                      </button>
                    )}
                  </div>
                );
              })
            ).flat()}
          </div>
        </div>
      )}

      {/* ── FABLE Items grid (potions/buffs) ────────────────────────────────── */}
      {tab === 'items' && (
        <div className="overflow-y-auto overscroll-contain flex-1" style={{ touchAction: 'pan-y' }}>
          <div className="grid grid-cols-2 gap-1.5 p-1.5">
            {Array.from({ length: ITEMS_COLS }, (_, col) =>
              Array.from({ length: ITEMS_ROWS }, (_, row) => {
                const item     = getFableItem(col, row);
                const isActive = cursor.col === col && cursor.row === row;
                if (!item) return (
                  <div key={`${col}-${row}`} className="rounded-lg border-2 border-zinc-800/20 bg-zinc-900/10 min-h-24" />
                );
                const affordable = canAffordFable(item.fableCost);
                const buyNow = () => {
                  cursorRef.current = { col, row };
                  setCursor({ col, row });
                  handleBuyRef.current();
                };
                return (
                  <div
                    key={item.id}
                    onClick={() => setCursor({ col, row })}
                    className={`relative flex flex-col items-center justify-center p-1 rounded-lg border-2 transition-all text-center select-none min-h-24 gap-0.5
                      ${isActive ? 'bg-zinc-800/70' : 'bg-zinc-900/30 hover:bg-zinc-800/30'}
                      ${fableCellBorder(item, isActive)}`}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                      className="absolute top-1 right-1 text-zinc-500 hover:text-white bg-black/50 rounded-full p-0.5 z-10"
                    >
                      <Info size={11} />
                    </button>
                    <span className="text-xl leading-none">{item.icon}</span>
                    <span className={`text-[8px] font-bold leading-tight ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>{item.name}</span>
                    <button
                      onClick={buyNow}
                      disabled={buying || !affordable}
                      className={`w-full mt-0.5 px-1 py-0.5 rounded text-[8px] font-bold active:scale-95 transition-all ${
                        affordable ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-zinc-800 text-red-400 border border-red-900/40'
                      }`}
                    >
                      {affordable ? `${item.fableCost} FABLE` : `Need ${item.fableCost} FABLE`}
                    </button>
                  </div>
                );
              })
            ).flat()}
          </div>
        </div>
      )}

      {/* ── Info Modal ──────────────────────────────────────────────────────── */}
      {showInfo && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="bg-zinc-950 border-2 border-yellow-900/50 p-4 rounded-xl flex flex-col gap-3 max-w-sm">
            <h2 className="text-yellow-400 font-bold text-sm border-b border-zinc-800 pb-2">Tavern Guide</h2>
            <p className="text-xs text-zinc-300">
              <span className="text-emerald-400 font-bold">AVAX</span> is real cryptocurrency on Avalanche. It is used to buy premium NFT weapons and abilities — each one is minted straight to your wallet and is yours to keep or resell.
            </p>
            <p className="text-xs text-zinc-300">
              <span className="text-purple-400 font-bold">FABLE</span> is earned by clearing zones. Spend it on potions, buffs, and stat points, or save it up toward your next AVAX purchase — your call.
            </p>
            <button onClick={() => setShowInfo(false)} className="mt-2 bg-yellow-900/50 hover:bg-yellow-800/50 text-yellow-400 font-bold py-1.5 rounded border border-yellow-700/50 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Item Detail Modal (weapons/abilities/consumables/buffs) ────────── */}
      {detailItem && 'avaxCost' in detailItem && (() => {
        const item = detailItem as AvaxItemDef;
        const owned = isWeaponOwned(item.id);
        return (
          <div
            className="absolute inset-0 z-60 bg-black/85 flex items-center justify-center p-3"
            onClick={() => setDetailItem(null)}
          >
            <div
              className="w-full max-w-xs bg-zinc-950 border border-purple-800/50 rounded-2xl shadow-2xl shadow-purple-950/40 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative w-full h-32 bg-zinc-900 shrink-0">
                <Image src={`/nft/${item.id}.png`} alt={item.name} fill className="object-cover" />
                <button
                  onClick={() => setDetailItem(null)}
                  className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white rounded-full p-1.5"
                >
                  <X size={14} />
                </button>
                <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[8px] font-bold bg-purple-950/80 border border-purple-700/50 text-purple-300 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  <Gem size={9} /> NFT — mints to your wallet
                </span>
              </div>
              <div className="p-3 flex flex-col gap-2.5">
                <div>
                  <h2 className="text-base font-extrabold text-yellow-400">{item.name}</h2>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest">
                    {item.category === 'weapon' ? 'Weapon' : 'Ability'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 italic leading-relaxed">"{item.desc}"</p>
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                  {item.category === 'weapon' ? <Sword size={13} className="text-red-400 shrink-0" /> : <Sparkles size={13} className="text-purple-400 shrink-0" />}
                  <div className="flex flex-col">
                    <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">Combat Effect</span>
                    <span className="text-xs font-bold text-zinc-200">{item.effect}</span>
                  </div>
                </div>
                {owned ? (
                  <span className="w-full text-center px-3 py-2 rounded-lg text-xs font-bold bg-blue-950/40 text-blue-400 border border-blue-800/50">✓ OWNED</span>
                ) : (
                  <button
                    onClick={() => { setCursor({ col: item.col, row: item.row }); setDetailItem(null); switchTab('avax'); }}
                    className="w-full bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg active:scale-95 transition-all"
                  >
                    {item.avaxCost} AVAX — View in Shop
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {detailItem && 'fableCost' in detailItem && (() => {
        const item = detailItem as FableItemDef;
        return (
          <div
            className="absolute inset-0 z-60 bg-black/85 flex items-center justify-center p-3"
            onClick={() => setDetailItem(null)}
          >
            <div
              className="w-full max-w-xs bg-zinc-950 border border-purple-800/50 rounded-2xl shadow-2xl shadow-purple-950/40 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative w-full h-24 bg-zinc-900 shrink-0 flex items-center justify-center">
                <span className="text-5xl">{item.icon}</span>
                <button
                  onClick={() => setDetailItem(null)}
                  className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white rounded-full p-1.5"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="p-3 flex flex-col gap-2.5">
                <div>
                  <h2 className="text-base font-extrabold text-yellow-400">{item.name}</h2>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest">
                    {item.tempBuff ? 'Temporary Buff' : 'Consumable'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 italic leading-relaxed">"{item.desc}"</p>
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                  <Sparkles size={13} className="text-purple-400 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">Effect</span>
                    <span className="text-xs font-bold text-zinc-200">{item.effect}</span>
                  </div>
                </div>
                <button
                  onClick={() => { setCursor({ col: item.col, row: item.row }); setDetailItem(null); switchTab('items'); }}
                  className="w-full bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold py-2 rounded-lg active:scale-95 transition-all"
                >
                  {item.fableCost} FABLE — View in Shop
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
