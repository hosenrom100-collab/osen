"use client";

import { useCallback, useEffect, useState } from "react";
import { ShoppingRequest } from "../types";
import { fetchRecentCycles } from "../lib/closeCycle";
import { getDeliveryDate } from "../lib/cycleWeek";
import { toDateOrNull } from "../lib/dateUtils";

type ListType = "supermarket" | "large";

/**
 * Delivery label per list ("למשלוח שיגיע ביום חמישי dd/MM"). A list's cycle starts when the previous one was closed; if it was
 * never closed, at its earliest live item. Call `refresh` after closing a cycle.
 */
export function useCycleWeeks(requests: ShoppingRequest[]) {
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
    const closed = lastClosed[listType];
    const openedByClose = !!closed && closed.getTime() > 0;
    const start = openedByClose ? closed! : earliest ?? new Date();
    return `למשלוח שיגיע ביום חמישי ${getDeliveryDate(start, openedByClose)}`;
  };

  return { weekLabels: { supermarket: labelFor("supermarket"), large: labelFor("large") }, refreshWeeks: refresh };
}
