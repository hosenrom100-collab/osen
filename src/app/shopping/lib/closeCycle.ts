import {
  addDoc, collection, getDocs, limit, orderBy, query, where, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { CycleItemSnapshot, CycleRecord, ShoppingRequest } from "../types";
import { toDateOrNull } from "./dateUtils";

// Firestore batches cap at 500 writes; stay well under so one oversized cycle can't fail whole.
const BATCH_SIZE = 400;

const STATUSES_TO_CLEAR: ShoppingRequest["status"][] = ["pending", "approved", "purchased", "deleted"];

interface CloseCycleParams {
  listType: "supermarket" | "large";
  /**
   * Runs on the open (unbought) items exactly as they were read, before anything is archived or
   * deleted. It produces the PDF; if it throws, the list is left untouched.
   */
  beforeClear?: (openItems: ShoppingRequest[]) => Promise<void>;
  user: { uid: string; displayName?: string | null; email?: string | null } | null;
}

export interface CloseCycleResult {
  purchased: number;
  unpurchased: number;
}

/**
 * Closes the current cycle for one list: the open items are handed to `beforeClear` (the PDF),
 * the cycle is saved to `shopping_cycles` (so it is never lost), and only then are the live
 * documents cleared. If either step fails this throws before deleting anything. Only the
 * documents read here are deleted, so an item added meanwhile survives into the next cycle.
 */
export async function closeCycle({ listType, beforeClear, user }: CloseCycleParams): Promise<CloseCycleResult> {
  const snap = await getDocs(
    query(collection(db, "shopping_requests"), where("status", "in", STATUSES_TO_CLEAR))
  );

  const docs = snap.docs.filter((d) => {
    const itemListType = d.data().listType || "supermarket";
    return listType === "large" ? itemListType === "large" : itemListType !== "large";
  });

  const isOpen = (status: string) => status === "pending" || status === "approved";
  const recorded = docs.filter((d) => d.data().status !== "deleted");
  const open = docs.filter((d) => isOpen(d.data().status));
  const purchasedCount = recorded.length - open.length;

  if (beforeClear) {
    await beforeClear(open.map((d) => ({ id: d.id, ...d.data() }) as ShoppingRequest));
  }

  if (recorded.length > 0) {
    const items: CycleItemSnapshot[] = recorded.map((d) => {
      const data = d.data();
      // Firestore rejects `undefined`, and older documents lack several of these fields.
      return {
        name: data.name || "",
        category: data.category || "כללי",
        quantity: data.quantity || "1",
        notes: data.notes || "",
        priority: data.priority || "normal",
        targetFramework: data.targetFramework || "main",
        requestedByName: data.requestedByName || "",
        purchased: data.status === "purchased",
      };
    });

    await addDoc(collection(db, "shopping_cycles"), {
      listType,
      closedAt: new Date(),
      closedBy: user?.uid ?? "",
      closedByName: user?.displayName || user?.email || "",
      purchasedCount,
      unpurchasedCount: open.length,
      carriedOverCount: 0,
      items,
    });
  }

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + BATCH_SIZE)) batch.delete(d.ref);
    await batch.commit();
  }

  return { purchased: purchasedCount, unpurchased: open.length };
}

/** Most recent closed cycles, newest first. Filtered by list client-side to avoid a composite index. */
export async function fetchRecentCycles(listType: "supermarket" | "large", max = 30): Promise<CycleRecord[]> {
  const snap = await getDocs(query(collection(db, "shopping_cycles"), orderBy("closedAt", "desc"), limit(max)));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        listType: data.listType === "large" ? "large" : "supermarket",
        closedAt: toDateOrNull(data.closedAt) ?? new Date(0),
        closedByName: data.closedByName || "",
        purchasedCount: data.purchasedCount ?? 0,
        unpurchasedCount: data.unpurchasedCount ?? 0,
        carriedOverCount: data.carriedOverCount ?? 0,
        items: (data.items || []) as CycleItemSnapshot[],
      } as CycleRecord;
    })
    .filter((c) => c.listType === listType);
}
