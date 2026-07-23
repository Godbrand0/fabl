import React, { useState } from 'react';
import { Loader2, Landmark, ShieldCheck, X } from 'lucide-react';
import { ZONE_LEVEL_REWARDS } from '../lib/nft';
import { avalancheService } from '../lib/avalanche';

const ZONE_DISPLAY: Record<string, string> = {
  SunfallDunesScene:  'Sunfall Dunes',
  EmberFieldsScene:   'Ember Fields',
  AshwaterMarshScene: 'Ashwater Marsh',
  ObsidianPeakScene:  'Obsidian Peak',
};

interface BankModalProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  onClose: () => void;
  refreshBalance: () => Promise<void>;
  showMessage: (msg: string) => void;
}

export default function BankModal({
  playerData,
  setPlayerData,
  walletAddress,
  walletConnected,
  connectWallet,
  onClose,
  refreshBalance,
  showMessage
}: BankModalProps) {
  const [claiming, setClaiming] = useState(false);

  const pendingZones = playerData.pendingRewards || [];

  let totalReward = 0;
  pendingZones.forEach((z: string) => {
    totalReward += ZONE_LEVEL_REWARDS[z] || 0;
  });

  const handleClaim = async () => {
    if (claiming) return;

    if (!walletConnected || !walletAddress) {
      await connectWallet();
      return;
    }

    setClaiming(true);
    try {
      const res = await fetch('/api/claim-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, zones: pendingZones }),
      });
      const data = await res.json();

      if (data.success) {
        showMessage(`Successfully claimed ${totalReward} FABLE!`);
        setPlayerData((prev: any) => {
          const updated = { ...prev, pendingRewards: [] };
          return updated;
        });
        await refreshBalance();
        onClose();
      } else if (data.alreadyClaimedAll) {
        showMessage('Rewards were already claimed.');
        setPlayerData((prev: any) => {
          const updated = { ...prev, pendingRewards: [] };
          return updated;
        });
        onClose();
      } else {
        showMessage('Claim failed — please try again later.');
      }
    } catch (e) {
      console.error(e);
      showMessage('Claim failed due to network error.');
    } finally {
      setClaiming(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'claim' | 'withdraw'>('claim');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const handleWithdraw = async () => {
    if (withdrawing) return;
    if (!withdrawAddress || !withdrawAmount) {
      showMessage('Please enter address and amount.');
      return;
    }
    const amountNum = Number(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showMessage('Invalid amount.');
      return;
    }
    setWithdrawing(true);
    try {
      let addr = walletAddress;
      if (!walletConnected || !addr) {
        await connectWallet();
        addr = (await avalancheService.getConnectedAddress()) ?? '';
      }
      if (!addr) {
        showMessage('Connect wallet to withdraw.');
        setWithdrawing(false);
        return;
      }
      const success = await avalancheService.transferAvax(addr, withdrawAddress, amountNum);
      if (success) {
        showMessage(`Successfully sent ${amountNum} AVAX`);
        setWithdrawAddress('');
        setWithdrawAmount('');
        await refreshBalance();
      } else {
        showMessage('Withdrawal failed.');
      }
    } catch (err) {
      console.error(err);
      showMessage('Withdrawal error.');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md font-mono pointer-events-auto">
      <div className="w-full max-w-sm flex flex-col gap-4 px-6 border border-emerald-900/50 bg-zinc-950 p-6 rounded-2xl shadow-2xl shadow-emerald-900/20">

        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Landmark className="text-emerald-500" size={24} />
            <div>
              <h2 className="text-lg font-extrabold text-emerald-400 tracking-widest uppercase">Town Bank</h2>
              <p className="text-[10px] text-zinc-500 italic">"Secure your hard-earned loot."</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800/60 mt-2">
          <button
            onClick={() => setActiveTab('claim')}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${activeTab === 'claim' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-400'}`}
          >
            Claim Rewards
          </button>
          <button
            onClick={() => setActiveTab('withdraw')}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${activeTab === 'withdraw' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-400'}`}
          >
            Send AVAX
          </button>
        </div>

        {activeTab === 'claim' && (
          <div className="flex flex-col gap-4">
            {/* Content */}
            {pendingZones.length === 0 ? (
              <div className="py-4 flex flex-col items-center justify-center gap-2 text-center">
                <ShieldCheck size={32} className="text-zinc-700" />
                <p className="text-zinc-400 text-sm font-bold mt-2">No Pending Rewards</p>
                <p className="text-zinc-600 text-[10px]">You haven't earned FABLE yet. Defeat the level boss to earn more...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-xl p-4 flex flex-col items-center gap-2">
                  <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Pending Payout</span>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold text-emerald-400 leading-none">{totalReward.toLocaleString()}</span>
                    <span className="text-emerald-600 font-bold pb-1">FABLE</span>
                  </div>

                  <div className="w-full mt-2 pt-2 border-t border-emerald-900/30 flex flex-col gap-1 text-[10px]">
                    {pendingZones.map((z: string) => (
                      <div key={z} className="flex justify-between text-zinc-400">
                        <span>{ZONE_DISPLAY[z] ?? z}</span>
                        <span className="text-emerald-500">+{ZONE_LEVEL_REWARDS[z] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 flex justify-center items-center gap-2 tracking-wider active:scale-95 transition-all shadow-lg bg-emerald-700 hover:bg-emerald-600 text-white shadow-emerald-900/30"
                >
                  {claiming ? (
                    <><Loader2 size={16} className="animate-spin" /> Processing…</>
                  ) : (
                    `Claim ${totalReward.toLocaleString()} FABLE`
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'withdraw' && (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-[10px] text-zinc-400">
              Send real AVAX to an external wallet (like Core or MetaMask) on Avalanche C-Chain.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Destination Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Amount (AVAX)</label>
              <input
                type="number"
                placeholder="0.0000"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAddress || !withdrawAmount}
              className="w-full mt-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-sm flex justify-center items-center tracking-wider active:scale-95 transition-all shadow-lg shadow-emerald-900/30"
            >
              {withdrawing ? <><Loader2 size={16} className="animate-spin mr-2" /> Processing…</> : "Send AVAX"}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
