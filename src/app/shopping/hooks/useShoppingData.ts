"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { User } from "firebase/auth";
import {
  collection, query, where, doc, onSnapshot, getDoc, setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ShoppingRequest, Product, CutoffConfig } from "../types";
import { getCutoffStatus } from "../lib/cutoffUtils";
import { DEFAULT_CATEGORIES } from "../lib/constants";
import { toDateOrNull } from "../lib/dateUtils";
import { belongsToList } from "../lib/listFilters";
import { computeFreezeAt, LIST_KEYS, listKeyOf, ListKey } from "../lib/freeze";
import { syncFreeze } from "../lib/syncFreeze";

const DEFAULT_CUTOFF: CutoffConfig = { enabled: true, day: 1, time: "16:00", deliveryDay: null };

function normalizeCutoff(saved?: CutoffConfig): { config: CutoffConfig; needsUpdate: boolean } {
  if (!saved) {
    return { config: DEFAULT_CUTOFF, needsUpdate: true };
  }
  // Only a config with no day at all is repaired. A day/time the admin saved (Thursday, 18:00...)
  // is always respected — it used to be silently reset to Monday 16:00 on the next load.
  if (saved.day === undefined) {
    return {
      config: {
        enabled: saved.enabled ?? true,
        day: DEFAULT_CUTOFF.day,
        time: saved.time || DEFAULT_CUTOFF.time,
        deliveryDay: saved.deliveryDay !== undefined ? saved.deliveryDay : null,
      },
      needsUpdate: true,
    };
  }
  return { config: saved, needsUpdate: false };
}

// `loadArchive`: the archive is the full purchase history and can grow indefinitely, so it's
// only streamed from Firestore once something actually needs it (the Archive tab is open),
// instead of every shopper's session tailing every archived item forever.
export function useShoppingData(
  user: User | null,
  isAdmin: boolean,
  listType: "supermarket" | "large"
) {
  const [liveRequests, setLiveRequests] = useState<ShoppingRequest[]>([]);
  const [pool, setPool] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [cutoffConfig, setCutoffConfig] = useState<CutoffConfig>(DEFAULT_CUTOFF);
  // `freezeAt` as stored in settings (ms, or null) — only meaningful once a saved cutoff config exists.
  const [storedFreezeAt, setStoredFreezeAt] = useState<Record<ListKey, number | null> | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const lastSyncAttempt = useRef(0);

  const applySettingsData = (data: any) => {
    if (!data) return;
    if (data.categories) setCategories(data.categories);
    if (data.cutoffConfig) {
      const ms = (v: { toMillis?: () => number } | null | undefined): number | null => v?.toMillis?.() ?? null;
      setStoredFreezeAt({ supermarket: ms(data.freezeAt?.supermarket), large: ms(data.freezeAt?.large) });
    }
    const { config, needsUpdate } = normalizeCutoff(data.cutoffConfig);
    setCutoffConfig(config);
    if (needsUpdate) {
      setDoc(doc(db, "settings", "shopping"), { cutoffConfig: config }, { merge: true }).catch(console.error);
    }
  };

  const refetchSettings = async () => {
    const s = await getDoc(doc(db, "settings", "shopping"));
    if (s.exists()) {
      applySettingsData(s.data());
    }
  };

  useEffect(() => {
    if (!user) return;

    const unsubSettings = onSnapshot(doc(db, "settings", "shopping"), (s) => {
      if (s.exists()) {
        applySettingsData(s.data());
      } else {
        setDoc(doc(db, "settings", "shopping"), { cutoffConfig: DEFAULT_CUTOFF }, { merge: true }).catch(console.error);
      }
    });

    const unsubPool = onSnapshot(collection(db, "product_pool"), (snap) => {
      const list: Product[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Product));
      list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      setPool(list);
    });

    const q = query(
      collection(db, "shopping_requests"),
      where("status", "in", ["pending", "approved", "purchased", "deleted"])
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: ShoppingRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ShoppingRequest));
      list.sort((a, b) => (toDateOrNull(b.createdAt)?.getTime() ?? 0) - (toDateOrNull(a.createdAt)?.getTime() ?? 0));
      setLiveRequests(list);
      setLoading(false);
    });

    return () => {
      unsubSettings();
      unsubPool();
      unsub();
    };
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    const qPending = query(collection(db, "product_requests_queue"), where("status", "==", "pending"));
    const unsubPending = onSnapshot(qPending, (snap) => {
      setPendingRequestsCount(snap.size);
    });
    return () => unsubPending();
  }, [isAdmin]);

  const requests = liveRequests;

  const activeRequests = useMemo(
    () =>
      liveRequests.filter(
        (r) =>
          (r.status === "approved" || r.status === "pending") &&
          belongsToList(r, listType)
      ),
    [liveRequests, listType]
  );

  const sessionPurchased = useMemo(
    () =>
      liveRequests.filter(
        (r) => r.status === "purchased" && belongsToList(r, listType)
      ),
    [liveRequests, listType]
  );

  const currentActiveItems = useMemo(
    () =>
      liveRequests.filter(
        (r) =>
          (r.status === "approved" || r.status === "pending" || r.status === "purchased") &&
          belongsToList(r, listType)
      ),
    [liveRequests, listType]
  );

  const cutoffStatus = useMemo(
    () => getCutoffStatus(cutoffConfig, currentActiveItems),
    [cutoffConfig, currentActiveItems]
  );

  // Firestore rules freeze a list for non-managers from `settings/shopping.freezeAt`. Rules cannot
  // inspect the items, so whenever what the lists say differs from what is stored (a list was
  // closed, the cutoff was edited, the cutoff passed on an empty list, first run), any open client
  // asks the server to recompute it. The route is idempotent, so concurrent clients are harmless.
  useEffect(() => {
    const t = setInterval(() => setClockTick((c) => c + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user || loading || storedFreezeAt === null) return;
    const now = new Date();
    const live = liveRequests.filter((r) => r.status !== "deleted");
    const inSync = LIST_KEYS.every((key) => {
      const expected = computeFreezeAt(cutoffConfig, live.filter((r) => listKeyOf(r) === key), now);
      return (expected?.getTime() ?? null) === storedFreezeAt[key];
    });
    if (inSync || now.getTime() - lastSyncAttempt.current < 15_000) return;
    lastSyncAttempt.current = now.getTime();
    void syncFreeze(user);
  }, [user, loading, liveRequests, cutoffConfig, storedFreezeAt, clockTick]);

  const isListFrozen = cutoffStatus.isEnabled && cutoffStatus.isPassed && currentActiveItems.length > 0;

  return {
    requests, pool, loading, setLoading, pendingRequestsCount, categories, setCategories, cutoffConfig, setCutoffConfig,
    activeRequests, sessionPurchased, currentActiveItems, cutoffStatus, isListFrozen,
    refetchSettings,
  };
}
