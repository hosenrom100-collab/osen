"use client";

import { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import {
  collection, query, orderBy, doc, onSnapshot, getDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ShoppingRequest, Product, CutoffConfig } from "../types";
import { getCutoffStatus } from "../lib/cutoffUtils";
import { DEFAULT_CATEGORIES } from "../lib/constants";
import { toDateOrNull } from "../lib/dateUtils";

export function useShoppingData(user: User | null, isAdmin: boolean, listType: "supermarket" | "large") {
  const [requests, setRequests] = useState<ShoppingRequest[]>([]);
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

    const q = query(collection(db, "shopping_requests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: ShoppingRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ShoppingRequest));
      setRequests(list);
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

  const activeRequests = useMemo(
    () =>
      requests.filter(
        (r) =>
          (r.status === "approved" || r.status === "pending") &&
          (listType === "large" ? r.listType === "large" : r.listType !== "large")
      ),
    [requests, listType]
  );

  const sessionPurchased = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "purchased" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
      ),
    [requests, listType]
  );

  const archived = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "archived" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
      ),
    [requests, listType]
  );

  const archiveByDate = useMemo(
    () =>
      archived.reduce((acc, item) => {
        const d = toDateOrNull(item.createdAt) ?? new Date(0);
        const key = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
        (acc[key] = acc[key] || []).push(item);
        return acc;
      }, {} as Record<string, ShoppingRequest[]>),
    [archived]
  );

  const currentActiveItems = useMemo(
    () =>
      requests.filter(
        (r) =>
          (r.status === "approved" || r.status === "pending" || r.status === "purchased") &&
          (listType === "large" ? r.listType === "large" : r.listType !== "large")
      ),
    [requests, listType]
  );

  const cutoffStatus = useMemo(
    () => getCutoffStatus(cutoffConfig, currentActiveItems),
    [cutoffConfig, currentActiveItems]
  );

  const isListFrozen = cutoffStatus.isEnabled && cutoffStatus.isPassed && currentActiveItems.length > 0;

  return {
    requests, pool, loading, setLoading, pendingRequestsCount, categories, setCategories, cutoffConfig, setCutoffConfig,
    activeRequests, sessionPurchased, archived, archiveByDate, currentActiveItems, cutoffStatus, isListFrozen,
    refetchSettings,
  };
}
