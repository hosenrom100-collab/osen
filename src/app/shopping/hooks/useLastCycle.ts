"use client";

import { useEffect, useState } from "react";
import { CycleItemSnapshot } from "../types";
import { fetchRecentCycles } from "../lib/closeCycle";

/**
 * Items of the most recently closed cycle for this list. Refetched every time `enabled`
 * flips on (the add sheet opens), so a cycle closed a moment ago is picked up. A failed
 * load just means no suggestions — never worth an error in the add flow.
 */
export function useLastCycleItems(listType: "supermarket" | "large", enabled: boolean): CycleItemSnapshot[] {
  const [loaded, setLoaded] = useState<{ listType: string; items: CycleItemSnapshot[] } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchRecentCycles(listType, 5)
      .then((cycles) => {
        if (!cancelled) setLoaded({ listType, items: cycles[0]?.items ?? [] });
      })
      .catch((e) => console.error("Error loading last cycle:", e));
    return () => {
      cancelled = true;
    };
  }, [listType, enabled]);

  // Ignore items loaded for the other list after switching tabs.
  return loaded && loaded.listType === listType ? loaded.items : [];
}
