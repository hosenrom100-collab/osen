"use client";

import { useRef, useState } from "react";

const PULL_THRESHOLD = 70;

/**
 * Generic pull-to-refresh touch gesture for a scrollable container. Only activates
 * when the container is already scrolled to the top. Has no Firestore/data knowledge —
 * pass whatever `onRefresh` callback makes sense (e.g. re-fetching a one-time settings doc).
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop <= 0 && !isRefreshing) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = null;
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta, PULL_THRESHOLD * 1.5));
    }
  };

  const onTouchEnd = async () => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setPullDistance(0);
    startY.current = null;
  };

  return {
    pullDistance,
    isRefreshing,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
