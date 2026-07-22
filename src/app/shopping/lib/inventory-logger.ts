import { db } from "@/lib/firebase/config";
import { collection, addDoc, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { InventoryLogEntry } from "../types";

export async function logInventoryChange(entry: Omit<InventoryLogEntry, "timestamp">): Promise<void> {
  try {
    await addDoc(collection(db, "inventory_log"), {
      ...entry,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error logging inventory change:", error);
  }
}

export async function getProductInventoryLogs(productId: string, maxResults = 15): Promise<InventoryLogEntry[]> {
  try {
    const q = query(
      collection(db, "inventory_log"),
      where("productId", "==", productId),
      orderBy("timestamp", "desc"),
      limit(maxResults)
    );
    const snap = await getDocs(q);
    const logs: InventoryLogEntry[] = [];
    snap.forEach((d) => logs.push({ id: d.id, ...d.data() } as InventoryLogEntry));
    return logs;
  } catch (error) {
    console.error("Error fetching inventory logs:", error);
    return [];
  }
}
