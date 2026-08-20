import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { AlertTriangle, Trash2, RefreshCw, CheckCircle2 } from 'lucide-react';

export const DeleteAllDataSection: React.FC = () => {
  const [confirmText, setConfirmText] = useState('');
  const [isWipingState, setIsWipingState] = useState(false);
  const [wipedSuccess, setWipedSuccess] = useState(false);

  const handleClearLocalState = () => {
    if (confirmText !== 'DELETE ALL DATA') return;
    setIsWipingState(true);
    
    setTimeout(() => {
      try {
        // Clear localStorage and session storage
        localStorage.clear();
        sessionStorage.clear();
        setWipedSuccess(true);
        setIsWipingState(false);
        setConfirmText('');
        
        // Reload page after a brief delay to apply fresh slate
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        console.error('Error clearing local state:', err);
        setIsWipingState(false);
      }
    }, 1000);
  };

  const handleClearSyncQueue = () => {
    try {
      // Find all offline-sync related keys and remove them
      Object.keys(localStorage).forEach((key) => {
        if (key.includes('offline') || key.includes('sync') || key.includes('queue')) {
          localStorage.removeItem(key);
        }
      });
      alert('Stalled offline sync queue has been cleared successfully.');
    } catch (err) {
      console.error('Error clearing sync queue:', err);
    }
  };

  return (
    <Card className="border border-red-500/30 bg-red-950/10 p-6 space-y-4 rounded-xl">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-red-500/10 text-red-400 rounded-lg">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-red-200 uppercase tracking-wider">
            Super Admin Destructive Console
          </h3>
          <p className="text-sm text-zinc-400">
            Wipe localized app caches, discard corrupted offline sync buffers, or trigger an absolute clean state. These operations are irreversible.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="border border-zinc-800 bg-zinc-900/40 p-4 rounded-lg space-y-3">
          <h4 className="text-sm font-semibold text-zinc-300">Clear Sync Pipeline</h4>
          <p className="text-xs text-zinc-500">
            Purges any pending, offline, or corrupted transactions cached in your browser. Use this if your sync queue is permanently blocked or stalling.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearSyncQueue}
            className="w-full border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Purge Offline Sync Queues
          </Button>
        </div>

        <div className="border border-red-500/20 bg-red-950/20 p-4 rounded-lg space-y-3">
          <h4 className="text-sm font-semibold text-red-300">Factory Reset Local Cache</h4>
          <p className="text-xs text-zinc-500">
            Wipes all cached app variables, permissions, user context, and preferences. Requires confirmation to prevent accidents.
          </p>
          
          <div className="space-y-2">
            <label className="block text-xs text-zinc-400 font-medium">
              Type <span className="font-mono text-red-400 select-all">DELETE ALL DATA</span> to confirm:
            </label>
            <input
              type="text"
              className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-red-500/50"
              placeholder="Type confirmation here..."
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>

          <Button
            variant="destructive"
            size="sm"
            disabled={confirmText !== 'DELETE ALL DATA' || isWipingState}
            onClick={handleClearLocalState}
            className="w-full flex items-center justify-center gap-2"
          >
            {isWipingState ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Wiping local state...
              </>
            ) : wipedSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> State cleared, restarting...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" /> Wipe Client Cache & Log Out
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};
