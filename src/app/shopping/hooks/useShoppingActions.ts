"use client";

import { useCallback } from "react";
import { User } from "firebase/auth";
import { collection, addDoc, doc, updateDoc, deleteDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { sendPush } from "@/lib/notify";
import { ShoppingRequest, Product, CutoffConfig } from "../types";
import { findSimilarRequestStrict } from "../lib/stringUtils";
import { parseQuantity, buildQuantityString, getMinQuantity } from "../lib/quantityUtils";

export function useShoppingActions(
  user: User | null,
  isAdmin: boolean,
  isLogistics: boolean,
  requests: ShoppingRequest[],
  pool: Product[],
  listType: "supermarket" | "large",
  categories: string[],
  setCategories: (next: string[]) => void,
  setCutoffConfig: (next: CutoffConfig) => void,
  setLoading: (next: boolean) => void,
  showToast: (message: string, type: "success" | "warning") => void,
  confirmDialog: (options: { title: string; message: string; type?: "danger" | "info" | "success" }) => Promise<boolean>
) {
  // User request a new product to be added to the pool by admin.
  // Returns whether the request was actually submitted, so callers (the add
  // overlay) know whether it's safe to clear their input and close.
  const requestNewProduct = async (
    name: string,
    category = "כללי",
    priority: "normal" | "urgent" = "normal",
    quantity = "1"
  ): Promise<boolean> => {
    const cleanName = name.trim();
    if (!cleanName) return false;

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
      return true;
    } catch (e) {
      console.error("Error submitting new product request:", e);
      showToast("שגיאה בשליחת הבקשה. נסה שוב.", "warning");
      return false;
    }
  };

  // Add Item to Shopping List. Returns whether the item was actually added, so
  // callers know whether it's safe to clear their input and close the overlay.
  const addProduct = async (
    name: string,
    category = "כללי",
    priority: "low" | "normal" | "urgent" = "normal",
    quantity = "1",
    notes = "",
    requestedByOverride?: { uid: string; name: string }
  ): Promise<boolean> => {
    const cleanName = name.trim();
    if (!cleanName) return false;

    if (cleanName.includes(",") || cleanName.includes("،")) {
      showToast("יש להוסיף כל מוצר בנפרד ולא כמחרוזת של כמה מוצרים.", "warning");
      return false;
    }
    if (cleanName.length > 60) {
      showToast("שם המוצר ארוך מדי. אנא קצר את שם המוצר.", "warning");
      return false;
    }

    const activeRequestsList = requests;
    const similarName = findSimilarRequestStrict(cleanName, activeRequestsList);
    if (similarName) {
      showToast(`המוצר כבר הוזמן לרשימה בשם דומה: "${similarName}"!`, "warning");
      return false;
    }

    const norm = cleanName.toLowerCase();
    const poolMatch = pool.find((p) => p.name.trim().toLowerCase() === norm);
    const finalNotes = notes || poolMatch?.defaultNotes || "";
    const requesterUid = requestedByOverride?.uid ?? user?.uid;
    const requesterName = requestedByOverride?.name ?? (user?.displayName || user?.email || "משתמש");

    try {
      await addDoc(collection(db, "shopping_requests"), {
        name: cleanName,
        category,
        quantity,
        notes: finalNotes,
        priority,
        status: "approved",
        requestedBy: requesterUid,
        requestedByName: requesterName,
        createdAt: new Date(),
        listType,
      });

      if (priority === "urgent") {
        sendPush({
          role: ["admin", "manager", "logistics"],
          title: "🔥 בקשת רכש דחופה",
          body: `${requesterName}: ${cleanName}`,
          link: "/shopping",
        });
      }

      // A name with no pool match is a genuinely new product (only shopping managers
      // ever reach this with a new name — everyone else is routed to requestNewProduct).
      // Save it to the pool too, so it shows up in search/autocomplete next time.
      // Non-shopping-managers are rejected here by Firestore rules; that failure is
      // harmless since the list item above was already added successfully.
      if (!poolMatch) {
        try {
          await setDoc(
            doc(db, "product_pool", cleanName.replace(/\//g, "-")),
            { name: cleanName, category, isActive: true },
            { merge: true }
          );
        } catch (poolError) {
          console.error("Could not add new product to pool:", poolError);
        }
      }

      showToast("המוצר הוזמן בהצלחה!", "success");
      return true;
    } catch (e) {
      console.error("Error adding product:", e);
      showToast("שגיאה בהוספת המוצר. נסה שוב.", "warning");
      return false;
    }
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

          if (next === "purchased") {
            const changedItem = requests.find((r) => r.id === id);
            const itemListType = changedItem?.listType;
            const sameList = (r: ShoppingRequest) =>
              itemListType === "large" ? r.listType === "large" : r.listType !== "large";

            const remainingApproved = requests.filter(
              (r) => (r.status === "approved" || r.status === "pending") && r.id !== id && sameList(r)
            );

            if (remainingApproved.length === 0) {
              sendPush({
                role: ["admin", "manager", "logistics"],
                title: "🛍️ הקניות הסתיימו!",
                body: "כל הפריטים המאושרים נרכשו בהצלחה",
                link: "/shopping",
              });

              const purchasedItems = requests.filter(
                (r) => (r.status === "purchased" || r.id === id) && sameList(r)
              );
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
        showToast("שגיאה בעדכון הפריט. נסה שוב.", "warning");
      }
    },
    [requests, user, showToast]
  );

  const updateQuantity = async (id: string, currentQtyStr: string, increment: number) => {
    const { value, unit } = parseQuantity(currentQtyStr);
    const nextVal = Math.max(getMinQuantity(unit), value + increment);
    const nextQty = buildQuantityString(nextVal, unit);
    try {
      await updateDoc(doc(db, "shopping_requests", id), {
        quantity: nextQty,
        updatedAt: new Date(),
        updatedBy: user?.uid,
      });
    } catch (e) {
      console.error(e);
      showToast("שגיאה בעדכון הכמות. נסה שוב.", "warning");
    }
  };

  const moveToEquipment = async (id: string) => {
    try {
      await updateDoc(doc(db, "shopping_requests", id), { listType: "large", updatedAt: new Date(), updatedBy: user?.uid });
      showToast("המוצר הועבר לרשימת ציוד ורכש", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בהעברת המוצר. נסה שוב.", "warning");
    }
  };

  const moveToSupermarket = async (id: string) => {
    try {
      await updateDoc(doc(db, "shopping_requests", id), { listType: "supermarket", updatedAt: new Date(), updatedBy: user?.uid });
      showToast("המוצר הועבר לרשימת הסופר", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בהעברת המוצר. נסה שוב.", "warning");
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
      setCategories(categories);
      showToast("שגיאה בהוספת הקטגוריה. נסה שוב.", "warning");
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
      setCategories(categories);
      showToast("שגיאה בעדכון הקטגוריה. נסה שוב.", "warning");
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
      setCategories(categories);
      showToast("שגיאה במחיקת הקטגוריה. נסה שוב.", "warning");
    }
  };

  const handleSaveCutoffConfig = async (newConfig: CutoffConfig) => {
    try {
      await setDoc(doc(db, "settings", "shopping"), { cutoffConfig: newConfig }, { merge: true });
      setCutoffConfig(newConfig);
      showToast("הגדרות מועד הקציבה השבועי עודכנו בהצלחה!", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בשמירת הגדרות מועד הקציבה. נסה שוב.", "warning");
    }
  };

  const toggleStarProduct = async (productId: string, currentIsStar?: boolean) => {
    try {
      await setDoc(doc(db, "product_pool", productId), { isStar: !currentIsStar }, { merge: true });
      showToast(!currentIsStar ? "המוצר סומן כמוצר כוכב ⭐" : "המוצר הוסר ממוצרי הכוכב", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בעדכון מוצר הכוכב. נסה שוב.", "warning");
    }
  };

  const updateItem = async (
    id: string,
    name: string,
    category: string,
    quantity: string,
    notes: string,
    priority: "low" | "normal" | "urgent"
  ) => {
    try {
      await updateDoc(doc(db, "shopping_requests", id), { name, category, quantity, notes, priority });
      showToast("הפריט עודכן בהצלחה!", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בעדכון הפריט. נסה שוב.", "warning");
    }
  };

  return {
    requestNewProduct,
    addProduct, changeStatus, updateQuantity, moveToEquipment, moveToSupermarket,
    toggleStarProduct, updateItem,
    handleAddCategory, handleRenameCategory, handleDeleteCategory, handleSaveCutoffConfig,
  };
}
