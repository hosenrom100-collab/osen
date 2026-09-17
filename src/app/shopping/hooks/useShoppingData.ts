"use client";

import { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import {
  collection, query, where, doc, onSnapshot, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ShoppingRequest, Product, CutoffConfig } from "../types";
import { getCutoffStatus } from "../lib/cutoffUtils";
import { DEFAULT_CATEGORIES } from "../lib/constants";
import { toDateOrNull } from "../lib/dateUtils";

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
  const [cutoffConfig, setCutoffConfig] = useState<CutoffConfig>({ enabled: true, day: 2, time: "12:00" });

  const refetchSettings = async () => {
    const s = await getDoc(doc(db, "settings", "shopping"));
    if (s.exists()) {
      if (s.data().categories) setCategories(s.data().categories);
      if (s.data().cutoffConfig) setCutoffConfig(s.data().cutoffConfig);
    }
  };

  useEffect(() => {
    if (!user) return;

    getDoc(doc(db, "settings", "shopping")).then((s) => {
      if (s.exists()) {
        if (s.data().categories) setCategories(s.data().categories);
        if (s.data().cutoffConfig) setCutoffConfig(s.data().cutoffConfig);
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
          (listType === "large" ? r.listType === "large" : r.listType !== "large")
      ),
    [liveRequests, listType]
  );

  const sessionPurchased = useMemo(
    () =>
      liveRequests.filter(
        (r) => r.status === "purchased" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
      ),
    [liveRequests, listType]
  );

  const currentActiveItems = useMemo(
    () =>
      liveRequests.filter(
        (r) =>
          (r.status === "approved" || r.status === "pending" || r.status === "purchased") &&
          (listType === "large" ? r.listType === "large" : r.listType !== "large")
      ),
    [liveRequests, listType]
  );

  const cutoffStatus = useMemo(
    () => getCutoffStatus(cutoffConfig, currentActiveItems),
    [cutoffConfig, currentActiveItems]
  );

  const isListFrozen = cutoffStatus.isEnabled && cutoffStatus.isPassed && currentActiveItems.length > 0;

  return {
    requests, pool, loading, setLoading, pendingRequestsCount, categories, setCategories, cutoffConfig, setCutoffConfig,
    activeRequests, sessionPurchased, currentActiveItems, cutoffStatus, isListFrozen,
    refetchSettings,
  };
}
