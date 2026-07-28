"use client";

import { useState } from "react";
import { User } from "firebase/auth";
import { collection, addDoc, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ShoppingRequest, Product, InventoryItem } from "../types";
import { logInventoryChange } from "../lib/inventory-logger";
import { findSimilarProduct } from "../lib/stringUtils";
import { SmartReorderItem } from "../components/SmartReorderModal";

export function useInventoryActions(
  user: User | null,
  pool: Product[],
  requests: ShoppingRequest[],
  inventoryMap: Record<string, InventoryItem>,
  showToast: (message: string, type: "success" | "warning") => void
) {
  const [editingInvItem, setEditingInvItem] = useState<{ productId: string; name: string; minStock: number; unit: string } | null>(null);
  const [showManageTrackModal, setShowManageTrackModal] = useState(false);
  const [showSmartReorderModal, setShowSmartReorderModal] = useState(false);
  const [smartReorderItems, setSmartReorderItems] = useState<SmartReorderItem[]>([]);

  const updateInventoryStock = async (
    productId: string,
    name: string,
    category: string,
    currentVal: number,
    delta: number,
    unit = "יחידות",
    minStock = 1,
    reason: "manual" | "purchased" | "reorder" | "count" = "manual"
  ) => {
    const nextVal = Math.max(0, currentVal + delta);
    try {
      await setDoc(doc(db, "inventory", productId), {
        productId,
        name,
        category,
        currentStock: nextVal,
        minStock,
        unit,
        lastUpdated: new Date(),
        lastUpdatedBy: user?.uid,
        lastUpdatedByName: user?.displayName || user?.email || "מערכת",
      }, { merge: true });

      logInventoryChange({
        productId,
        productName: name,
        previousStock: currentVal,
        newStock: nextVal,
        delta,
        reason,
        updatedBy: user?.uid || "",
        updatedByName: user?.displayName || user?.email || "מערכת",
      });
    } catch (e) {
      console.error("Error updating inventory stock:", e);
      showToast("שגיאה בעדכון המלאי", "warning");
    }
  };

  const batchUpdateStock = async (
    updates: { productId: string; name: string; category: string; newStock: number; unit: string; minStock: number }[]
  ) => {
    try {
      const batch = writeBatch(db);
      updates.forEach((item) => {
        const ref = doc(db, "inventory", item.productId);
        const prev = inventoryMap[item.productId]?.currentStock ?? 0;
        batch.set(
          ref,
          {
            productId: item.productId,
            name: item.name,
            category: item.category,
            currentStock: item.newStock,
            minStock: item.minStock,
            unit: item.unit,
            lastUpdated: new Date(),
            lastUpdatedBy: user?.uid,
            lastUpdatedByName: user?.displayName || user?.email || "מערכת",
          },
          { merge: true }
        );

        if (prev !== item.newStock) {
          logInventoryChange({
            productId: item.productId,
            productName: item.name,
            previousStock: prev,
            newStock: item.newStock,
            delta: item.newStock - prev,
            reason: "count",
            updatedBy: user?.uid || "",
            updatedByName: user?.displayName || user?.email || "מערכת",
          });
        }
      });

      await batch.commit();
      showToast(`ספירת מלאי עודכנה בהצלחה (${updates.length} מוצרים)`, "success");
    } catch (e) {
      console.error("Error in batch stock update:", e);
      showToast("שגיאה בעדכון ספירת מלאי מרוכזת", "warning");
    }
  };

  // Smart Reorder — Step 1: build a review list (no writes yet). Items already
  // sitting in the active shopping list are excluded so they can't be duplicated.
  const buildSmartReorderReview = (): SmartReorderItem[] => {
    const trackedProducts = pool.filter((p) => p.trackInventory === true);
    const activeRequestsList = requests.filter((r) => r.status !== "archived" && r.status !== "deleted");

    return trackedProducts
      .filter((p) => {
        const s = inventoryMap[p.id]?.currentStock ?? 0;
        const m = inventoryMap[p.id]?.minStock ?? 1;
        return s <= m && !findSimilarProduct(p.name, activeRequestsList);
      })
      .map((p) => {
        const inv = inventoryMap[p.id];
        const currentStock = inv?.currentStock ?? 0;
        const minStock = inv?.minStock ?? 1;
        return {
          productId: p.id,
          name: p.name,
          category: p.category || "כללי",
          unit: inv?.unit || p.defaultUnit || "יחידות",
          currentStock,
          minStock,
          // Suggest restocking back up to the minimum threshold, not a flat "1"
          suggestedQty: Math.max(1, minStock - currentStock),
        };
      });
  };

  const openSmartReorderReview = () => {
    const reviewItems = buildSmartReorderReview();
    if (reviewItems.length === 0) {
      showToast("כל המוצרים במעקב נמצאים ברמת מלאי תקינה!", "success");
      return;
    }
    setSmartReorderItems(reviewItems);
    setShowSmartReorderModal(true);
  };

  // Smart Reorder — Step 2: user has reviewed/adjusted the list and confirmed it explicitly.
  const confirmSmartReorder = async (
    selected: { productId: string; name: string; category: string; unit: string; quantity: number; currentStock: number; minStock: number }[]
  ) => {
    for (const item of selected) {
      const isOut = item.currentStock === 0;
      await addDoc(collection(db, "shopping_requests"), {
        name: item.name,
        category: item.category,
        quantity: `${item.quantity} ${item.unit}`,
        notes: isOut
          ? `הוזמן אוטומטית (אזל במלאי)`
          : `הוזמן אוטומטית (מלאי נמוך: ${item.currentStock}/${item.minStock})`,
        priority: isOut ? "urgent" : "normal",
        status: "approved",
        requestedBy: user?.uid,
        requestedByName: user?.displayName || "Smart Reorder",
        createdAt: new Date(),
        listType: "supermarket",
      });
    }

    showToast(`התווספו ${selected.length} מוצרים לרשימת הקניות! 🛒`, "success");
  };

  const toggleTrackInventory = async (productId: string, currentTrack?: boolean) => {
    try {
      await setDoc(doc(db, "product_pool", productId), { trackInventory: !currentTrack }, { merge: true });
      showToast(!currentTrack ? "המוצר סומן למעקב מלאי" : "המוצר הוסר ממעקב מלאי", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStarProduct = async (productId: string, currentIsStar?: boolean) => {
    try {
      await setDoc(doc(db, "product_pool", productId), { isStar: !currentIsStar }, { merge: true });
      showToast(!currentIsStar ? "המוצר סומן כמוצר כוכב ⭐" : "המוצר הוסר ממוצרי הכוכב", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const saveInventorySettings = async (productId: string, minStockVal: number, unitVal: string) => {
    try {
      await setDoc(
        doc(db, "inventory", productId),
        {
          minStock: minStockVal,
          unit: unitVal,
          lastUpdated: new Date(),
          lastUpdatedBy: user?.uid,
        },
        { merge: true }
      );
      showToast("הגדרות המוצר עודכנו בהצלחה", "success");
    } catch (e) {
      console.error(e);
    }
  };

  return {
    editingInvItem, setEditingInvItem,
    showManageTrackModal, setShowManageTrackModal,
    showSmartReorderModal, setShowSmartReorderModal,
    smartReorderItems, setSmartReorderItems,
    updateInventoryStock, batchUpdateStock,
    buildSmartReorderReview, openSmartReorderReview, confirmSmartReorder,
    toggleTrackInventory, toggleStarProduct, saveInventorySettings,
  };
}
