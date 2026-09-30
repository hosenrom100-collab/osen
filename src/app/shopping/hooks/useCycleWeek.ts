"use client";

import { useCallback, useEffect, useState } from "react";
import { CutoffConfig, ShoppingRequest } from "../types";
import { fetchRecentCycles } from "../lib/closeCycle";
import { getCycleWeekLabel } from "../lib/cycleWeek";
import { toDateOrNull } from "../lib/dateUtils";

type ListType = "supermarket" | "large";

/**
 * Week label per list. A list's cycle starts when the previous one was closed; if it was
 * never closed, at its earliest live item. Call `refresh` after closing a cycle.
 */
export function useCycleWeeks(requests: ShoppingRequest[], cutoffConfig?: CutoffConfig) {
  const [lastClosed, setLastClosed] = useState<Record<ListType, Date | null>>({ supermarket: null, large: null });

  const refresh = useCallback(async () => {
    try {
      const cycles = await fetchRecentCycles("supermarket", 50);
      const large = await fetchRecentCycles("large", 50);
      setLastClosed({ supermarket: cycles[0]?.closedAt ?? null, large: large[0]?.closedAt ?? null });
    } catch (e) {
      console.error("Error loading last cycle date:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const labelFor = (listType: ListType) => {
    const inList = requests.filter(
      (r) => r.status !== "deleted" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
    );
    const earliest = inList
      .map((r) => toDateOrNull(r.createdAt))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    // A carried-over item predates the close, so the close date wins whenever there is one.
    const start = lastClosed[listType] && lastClosed[listType]!.getTime() > 0 ? lastClosed[listType]! : earliest ?? new Date();
    return getCycleWeekLabel(start, cutoffConfig);
  };

  return { weekLabels: { supermarket: labelFor("supermarket"), large: labelFor("large") }, refreshWeeks: refresh };
}
