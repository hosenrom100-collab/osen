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
  /** Keep the still-unbought items on the list for the next cycle instead of dropping them. */
  carryOver: boolean;
  user: { uid: string; displayName?: string | null; email?: string | null } | null;
}

export interface CloseCycleResult {
  purchased: number;
  carriedOver: number;
  dropped: number;
}

/**
 * Closes the current cycle for one list: the cycle is first saved to `shopping_cycles`
 * (so it is never lost), and only then are the live documents cleared. If the archive
 * write fails this throws before touching anything — a failed close must never delete
 * items that were not recorded.
 */
export async function closeCycle({ listType, carryOver, user }: CloseCycleParams): Promise<CloseCycleResult> {
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
      carriedOverCount: carryOver ? open.length : 0,
      items,
    });
  }

  const keep = new Set(carryOver ? open.map((d) => d.id) : []);
  const now = new Date();
  let carriedOver = 0;
  let dropped = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + BATCH_SIZE)) {
      if (keep.has(d.id)) {
        // A fresh createdAt is required, not cosmetic: the cutoff check treats any open item
        // created before the cutoff as "this week's list is closed", so a carried-over item
        // with its old timestamp would leave the new cycle frozen from the start.
        batch.update(d.ref, { createdAt: now, updatedAt: now, updatedBy: user?.uid ?? "" });
        carriedOver++;
      } else {
        batch.delete(d.ref);
        dropped++;
      }
    }
    await batch.commit();
  }

  return { purchased: purchasedCount, carriedOver, dropped };
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
