"use client";

import { useCallback } from "react";
import { User } from "firebase/auth";
import { collection, addDoc, doc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { sendPush } from "@/lib/notify";
import { ShoppingRequest, Product, InventoryItem, CutoffConfig } from "../types";
import { logInventoryChange } from "../lib/inventory-logger";
import { normalizeHebrewStrict, findSimilarRequestStrict } from "../lib/stringUtils";
import { parseQuantity, buildQuantityString } from "../lib/quantityUtils";

export function useShoppingActions(
  user: User | null,
  isAdmin: boolean,
  isLogistics: boolean,
  requests: ShoppingRequest[],
  pool: Product[],
  inventoryMap: Record<string, InventoryItem>,
  listType: "supermarket" | "large",
  categories: string[],
  setCategories: (next: string[]) => void,
  setCutoffConfig: (next: CutoffConfig) => void,
  setLoading: (next: boolean) => void,
  setShowArchivePrompt: (next: boolean) => void,
  showToast: (message: string, type: "success" | "warning") => void,
  confirmDialog: (options: { title: string; message: string; type?: "danger" | "info" | "success" }) => Promise<boolean>
) {
  // User request a new product to be added to the pool by admin
  const requestNewProduct = async (
    name: string,
    category = "כללי",
    priority: "normal" | "urgent" = "normal",
    quantity = "1"
  ) => {
    const cleanName = name.trim();
    if (!cleanName) return;

    try {
      await addDoc(collection(db, "product_requests_queue"), {
        name: cleanName,
        category,
        quantity,
        priority,
        status: "pending",
        requestedBy: user?.uid,
        requestedByName: user?.displayName || user?.email || "משתמש",
        createdAt: new Date(),
        listType,
      });

      sendPush({
        role: ["admin"],
        title: "📦 בקשה להוספת מוצר חדש",
        body: `${user?.displayName || "משתמש"} מבקש להוסיף את "${cleanName}" למאגר המוצרים.`,
        link: "/shopping",
      });

      showToast("הבקשה להוספת המוצר נשלחה למנהל. תודה!", "success");
    } catch (e) {
      console.error("Error submitting new product request:", e);
      showToast("שגיאה בשליחת הבקשה.", "warning");
    }
  };

  // Add Item to Shopping List (with Inventory duplicate stock check)
  const addProduct = async (
    name: string,
    category = "כללי",
    priority: "low" | "normal" | "urgent" = "normal",
    quantity = "1",
    notes = ""
  ) => {
    const cleanName = name.trim();
    if (!cleanName) return;

    if (cleanName.includes(",") || cleanName.includes("،")) {
      showToast("יש להוסיף כל מוצר בנפרד ולא כמחרוזת של כמה מוצרים.", "warning");
      return;
    }
    if (cleanName.length > 60) {
      showToast("שם המוצר ארוך מדי. אנא קצר את שם המוצר.", "warning");
      return;
    }

    const activeRequestsList = requests.filter((r) => r.status !== "archived");
    const similarName = findSimilarRequestStrict(cleanName, activeRequestsList);
    if (similarName) {
      showToast(`המוצר כבר הוזמן לרשימה בשם דומה: "${similarName}"!`, "warning");
      return;
    }

    // Check if item has stock in inventory (only relevant for products still marked for tracking)
    const norm = cleanName.toLowerCase();
    const poolMatch = pool.find((p) => p.name.trim().toLowerCase() === norm);
    const invMatch = Object.values(inventoryMap).find((i) => (i?.name || "").trim().toLowerCase() === norm);
    if (poolMatch?.trackInventory === true && invMatch && invMatch.currentStock > 0) {
      if (!isAdmin && !isLogistics) {
        showToast(`למוצר "${cleanName}" יש כרגע ${invMatch.currentStock} ${invMatch.unit || "יחידות"} במלאי המחסן - לא ניתן להוסיף לרשימת הקניות.`, "warning");
        return;
      } else {
        showToast(`שים לב: למוצר "${cleanName}" יש כרגע ${invMatch.currentStock} ${invMatch.unit || "יחידות"} במלאי!`, "warning");
      }
    }

    const finalNotes = notes || poolMatch?.defaultNotes || "";

    await addDoc(collection(db, "shopping_requests"), {
      name: cleanName,
      category,
      quantity,
      notes: finalNotes,
      priority,
      status: "approved",
      requestedBy: user?.uid,
      requestedByName: user?.displayName || user?.email || "משתמש",
      createdAt: new Date(),
      listType,
    });

    if (priority === "urgent") {
      sendPush({
        role: ["admin", "manager", "logistics"],
        title: "🔥 בקשת רכש דחופה",
        body: `${user?.displayName || "משתמש"}: ${cleanName}`,
        link: "/shopping",
      });
    }

    showToast("המוצר הוזמן בהצלחה!", "success");
  };

  const changeStatus = useCallback(
    async (
      id: string,
      next: "pending" | "approved" | "purchased" | "archived" | "deleted" | "permanently_delete",
      extra: Record<string, unknown> = {}
    ) => {
      try {
        if (next === "permanently_delete") {
          await deleteDoc(doc(db, "shopping_requests", id));
        } else {
          await updateDoc(doc(db, "shopping_requests", id), {
            status: next,
            updatedAt: new Date(),
            updatedBy: user?.uid,
            ...extra,
          });

          // AUTO INVENTORY STOCK UPDATE ON PURCHASE
          if (next === "purchased") {
            const targetReq = requests.find((r) => r.id === id);
            if (targetReq) {
              const normReqName = normalizeHebrewStrict(targetReq.name);
              const matchingProduct = pool.find((p) => normalizeHebrewStrict(p.name) === normReqName);
              // Only auto-update inventory for products actively marked for inventory tracking
              if (matchingProduct && matchingProduct.trackInventory === true) {
                const invItem = inventoryMap[matchingProduct.id];
                const currStock = invItem?.currentStock ?? 0;
                const parsedQty = parseFloat(targetReq.quantity) || 1;
                const newStock = currStock + parsedQty;

                await setDoc(
                  doc(db, "inventory", matchingProduct.id),
                  {
                    productId: matchingProduct.id,
                    name: matchingProduct.name,
                    category: matchingProduct.category,
                    currentStock: newStock,
                    minStock: invItem?.minStock ?? 1,
                    unit: invItem?.unit ?? "יחידות",
                    lastUpdated: new Date(),
                    lastUpdatedBy: user?.uid,
                    lastUpdatedByName: user?.displayName || user?.email || "מערכת",
                  },
                  { merge: true }
                );

                logInventoryChange({
                  productId: matchingProduct.id,
                  productName: matchingProduct.name,
                  previousStock: currStock,
                  newStock,
                  delta: parsedQty,
                  reason: "purchased",
                  updatedBy: user?.uid || "",
                  updatedByName: user?.displayName || user?.email || "מערכת",
                });

                showToast(`מלאי "${matchingProduct.name}" עודכן אוטומטית: ${currStock} ← ${newStock} ${invItem?.unit ?? "יחידות"}`, "success");
              }
            }

            const remainingApproved = requests.filter(
              (r) => (r.status === "approved" || r.status === "pending") && r.id !== id
            );

            if (remainingApproved.length === 0) {
              sendPush({
                role: ["admin", "manager", "logistics"],
                title: "🛍️ הקניות הסתיימו!",
                body: "כל הפריטים המאושרים נרכשו בהצלחה",
                link: "/shopping",
              });

              setShowArchivePrompt(true);

              const purchasedItems = requests.filter((r) => r.status === "purchased" || r.id === id);
              const requesters = Array.from(new Set(purchasedItems.map((r) => r.requestedBy).filter(Boolean)));

              requesters.forEach((reqUserId) => {
                if (reqUserId === user?.uid) return;
                const userItems = purchasedItems.filter((r) => r.requestedBy === reqUserId);
                const itemsList = userItems.map((r) => r.name).join(", ");
                sendPush({
                  userId: reqUserId,
                  title: "🛍️ הפריטים שביקשת נרכשו!",
                  body: `הפריטים הבאים נרכשו עבורך: ${itemsList}`,
                  link: "/shopping",
                });
              });
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    },
    [requests, pool, inventoryMap, user, setShowArchivePrompt, showToast]
  );

  const updateQuantity = async (id: string, currentQtyStr: string, increment: number) => {
    const { value, unit } = parseQuantity(currentQtyStr);
    const nextVal = Math.max(1, value + increment);
    const nextQty = buildQuantityString(nextVal, unit);
    try {
      await updateDoc(doc(db, "shopping_requests", id), {
        quantity: nextQty,
        updatedAt: new Date(),
        updatedBy: user?.uid,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const moveToEquipment = async (id: string) => {
    try {
      await updateDoc(doc(db, "shopping_requests", id), { listType: "large", updatedAt: new Date(), updatedBy: user?.uid });
      showToast("המוצר הועבר לרשימת ציוד ורכש", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const moveToSupermarket = async (id: string) => {
    try {
      await updateDoc(doc(db, "shopping_requests", id), { listType: "supermarket", updatedAt: new Date(), updatedBy: user?.uid });
      showToast("המוצר הועבר לרשימת הסופר", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const archiveCurrentSession = async () => {
    const sessionItemsToArchive = requests.filter(
      (r) =>
        (r.status === "purchased" || r.status === "approved" || r.status === "pending" || r.status === "deleted") &&
        (listType === "large" ? r.listType === "large" : r.listType !== "large")
    );
    if (sessionItemsToArchive.length === 0) return;
    try {
      setLoading(true);
      await Promise.all(
        sessionItemsToArchive.map((r) =>
          updateDoc(doc(db, "shopping_requests", r.id), {
            status: "archived",
            archivedAt: new Date(),
            archivedBy: user?.uid,
          })
        )
      );
      setShowArchivePrompt(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleRecurring = async (productId: string, name: string, category: string, shouldBeRecurring: boolean) => {
    try {
      await setDoc(
        doc(db, "product_pool", productId),
        {
          name,
          category,
          isRecurring: shouldBeRecurring,
          recurringQuantity: shouldBeRecurring ? "1" : "",
        },
        { merge: true }
      );
    } catch (e) {
      console.error(e);
    }
  };

  const updateRecurringQuantity = async (productId: string, currentQtyStr: string, increment: number) => {
    const currentVal = parseFloat(currentQtyStr) || 1;
    const nextVal = Math.max(1, currentVal + increment);
    try {
      await updateDoc(doc(db, "product_pool", productId), { recurringQuantity: String(nextVal) });
    } catch (e) {
      console.error(e);
    }
  };

  const importRecurringList = async () => {
    const recurringItems = pool.filter((p) => p.isRecurring);
    if (recurringItems.length === 0) {
      showToast("לא הוגדרו מוצרים ברשימה הקבועה.", "warning");
      return;
    }

    setLoading(true);
    try {
      const activeSupermarketRequests = requests.filter((r) => r.status !== "archived" && r.listType !== "large");
      const itemsToImport = recurringItems.filter((item) => !findSimilarRequestStrict(item.name, activeSupermarketRequests));

      if (itemsToImport.length === 0) {
        showToast("כל פריטי הרשימה הקבועה כבר קיימים ברשימת הסופר.", "warning");
        return;
      }

      await Promise.all(
        itemsToImport.map((item) =>
          addDoc(collection(db, "shopping_requests"), {
            name: item.name,
            category: item.category || "כללי",
            quantity: item.recurringQuantity || "1",
            notes: "",
            priority: "normal",
            status: "approved",
            requestedBy: user?.uid,
            requestedByName: "רשימה קבועה",
            createdAt: new Date(),
            listType: "supermarket",
          })
        )
      );

      showToast(`שאיבת הרשימה הקבועה הושלמה! התווספו ${itemsToImport.length} פריטים.`, "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בשאיבת הרשימה הקבועה.", "warning");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (name: string) => {
    if (categories.includes(name)) return;
    const next = [...categories, name];
    setCategories(next);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: next }, { merge: true });
      showToast("קטגוריה נוספה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    if (!newName || newName === oldName || categories.includes(newName)) return;
    const next = categories.map((c) => (c === oldName ? newName : c));
    setCategories(next);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: next }, { merge: true });

      const activeToUpdate = requests.filter((r) => r.category === oldName);
      await Promise.all(activeToUpdate.map((r) => updateDoc(doc(db, "shopping_requests", r.id), { category: newName })));

      const poolToUpdate = pool.filter((p) => p.category === oldName);
      await Promise.all(poolToUpdate.map((p) => updateDoc(doc(db, "product_pool", p.id), { category: newName })));

      showToast("הקטגוריה עודכנה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    if (categories.length <= 1) return;
    const ok = await confirmDialog({
      title: "מחיקת קטגוריה",
      message: `האם ברצונך למחוק את הקטגוריה "${catName}"?`,
      type: "danger",
    });
    if (!ok) return;

    const next = categories.filter((c) => c !== catName);
    setCategories(next);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: next }, { merge: true });
      showToast("הקטגוריה נמחקה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCutoffConfig = async (newConfig: CutoffConfig) => {
    await setDoc(doc(db, "settings", "shopping"), { cutoffConfig: newConfig }, { merge: true });
    setCutoffConfig(newConfig);
    showToast("הגדרות מועד הקציבה השבועי עודכנו בהצלחה!", "success");
  };

  return {
    requestNewProduct,
    addProduct, changeStatus, updateQuantity, moveToEquipment, moveToSupermarket, archiveCurrentSession,
    toggleRecurring, updateRecurringQuantity, importRecurringList,
    handleAddCategory, handleRenameCategory, handleDeleteCategory, handleSaveCutoffConfig,
  };
}
