import React, { useState, useRef, useCallback, useEffect } from 'react';
import { RefreshCw, ArrowDown, Sparkles } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';

const PULL_THRESHOLD_PX = 65;
const MAX_PULL_PX = 95;
const REFRESH_COOLDOWN_MS = 2000;

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefreshCustom?: () => Promise<void>;
  className?: string;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  children,
  onRefreshCustom,
  className = '',
}) => {
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [refreshSuccess, setRefreshSuccess] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);
  const isRefreshingRef = useRef<boolean>(false);
  const lastRefreshTimeRef = useRef<number>(0);

  let realtimeSync: any = null;
  try {
    realtimeSync = useRealtimeSync();
  } catch (e) {
    // Context unavailable fallback
  }

  const triggerAppRefresh = useCallback(async () => {
    const now = Date.now();
    if (isRefreshingRef.current || now - lastRefreshTimeRef.current < REFRESH_COOLDOWN_MS) {
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setRefreshSuccess(false);

    try {
      // 1. Refresh application data via RealtimeSync if available
      if (realtimeSync?.triggerManualSync) {
        await realtimeSync.triggerManualSync().catch((err: any) => {
          console.warn('[PullToRefresh] Manual sync warning:', err);
        });
      }

      // 2. Refresh notifications and unread counts
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('exfin-notifications-updated'));
        window.dispatchEvent(new CustomEvent('exfin-pull-to-refresh'));
      }

      // 3. Custom page-level refresh if supplied
      if (onRefreshCustom) {
        await onRefreshCustom().catch((err: any) => {
          console.warn('[PullToRefresh] Custom refresh warning:', err);
        });
      }

      // 4. On Native Android platform, check for APK update immediately
      const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
      if (isAndroid && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('exfin-check-app-update'));
      }

      setRefreshSuccess(true);
      lastRefreshTimeRef.current = Date.now();
    } catch (err) {
      console.error('[PullToRefresh] Refresh operation error:', err);
    } finally {
      // Hold indicator briefly for user feedback then smoothly reset
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
        isRefreshingRef.current = false;
        setTimeout(() => setRefreshSuccess(false), 500);
      }, 600);
    }
  }, [realtimeSync, onRefreshCustom]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isRefreshingRef.current || e.touches.length !== 1) return;

    // Verify container and page scroll position is at the very top
    const container = containerRef.current;
    const isAtTop =
      (!container || container.scrollTop <= 0) &&
      (typeof window === 'undefined' || window.scrollY <= 0);

    if (!isAtTop) return;

    startYRef.current = e.touches[0].clientY;
    startXRef.current = e.touches[0].clientX;
    isPullingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPullingRef.current || isRefreshingRef.current || e.touches.length !== 1) return;

    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - startYRef.current;
    const deltaX = currentX - startXRef.current;

    // Only pull down if vertical movement dominates horizontal scrolling
    if (deltaY <= 0 || Math.abs(deltaX) > deltaY * 1.2) {
      if (pullDistance > 0) setPullDistance(0);
      return;
    }

    const container = containerRef.current;
    const isAtTop =
      (!container || container.scrollTop <= 0) &&
      (typeof window === 'undefined' || window.scrollY <= 0);

    if (!isAtTop) {
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    // Apply smooth logarithmic rubber-band damping
    const dampedDistance = Math.min(deltaY * 0.42, MAX_PULL_PX);
    setPullDistance(dampedDistance);
  };

  const handleTouchEnd = () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;

    if (pullDistance >= PULL_THRESHOLD_PX && !isRefreshingRef.current) {
      setPullDistance(50); // Hold at active spinner height
      void triggerAppRefresh();
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchCancel = () => {
    isPullingRef.current = false;
    if (!isRefreshingRef.current) {
      setPullDistance(0);
    }
  };

  const pullProgressRatio = Math.min(1, pullDistance / PULL_THRESHOLD_PX);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className={`relative overflow-anchor-none ${className}`}
    >
      {/* Top Pull Down Refresh Banner / Indicator */}
      <div
        className="overflow-hidden transition-all duration-200 ease-out flex items-center justify-center select-none pointer-events-none z-30"
        style={{
          height: isRefreshing ? 52 : pullDistance,
          opacity: pullDistance > 5 || isRefreshing ? 1 : 0,
        }}
      >
        <div className="py-2 px-4 rounded-full bg-slate-900/90 border border-cyan-500/30 shadow-lg backdrop-blur-md flex items-center gap-2.5 text-xs font-bold text-white">
          {isRefreshing ? (
            <>
              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
              <span className="text-cyan-300">
                {refreshSuccess ? 'Data Updated ✓' : 'Refreshing Application Data...'}
              </span>
            </>
          ) : pullDistance >= PULL_THRESHOLD_PX ? (
            <>
              <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-emerald-300">Release to refresh & check update</span>
            </>
          ) : (
            <>
              <ArrowDown
                className="w-4 h-4 text-cyan-400 transition-transform duration-200"
                style={{ transform: `rotate(${pullProgressRatio * 180}deg)` }}
              />
              <span className="text-slate-300">Pull down to refresh</span>
            </>
          )}
        </div>
      </div>

      {children}
    </div>
  );
};
