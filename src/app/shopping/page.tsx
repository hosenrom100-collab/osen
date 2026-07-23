"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db, storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection, addDoc, getDocs, query, orderBy, doc,
  updateDoc, deleteDoc, onSnapshot, setDoc, getDoc, writeBatch, where,
} from "firebase/firestore";
import { 
  ShoppingCart, Plus, Search, Loader2, ArrowRight, Download, 
  Settings, Boxes, Star, ShoppingBag, Edit3, Receipt, RotateCcw, Database,
  ChevronDown, FileText, FileSpreadsheet
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { sendPush } from "@/lib/notify";
import { generateShoppingListWord, generateDocxWithLetterhead } from "@/lib/word-generator";
import { format } from "date-fns";

import { ShoppingRequest, Product, InventoryItem } from "./types";
import { logInventoryChange } from "./lib/inventory-logger";
import { InventoryView } from "./components/InventoryView";
import { ShoppingListView } from "./components/ShoppingListView";
import { AddProductOverlay } from "./components/AddProductOverlay";
import { ShoppingModals } from "./components/ShoppingModals";
import { AdminProductRequestsModal } from "./components/AdminProductRequestsModal";

const normalizeHebrewString = (str: string): string => {
  if (!str) return "";
  return str
    .trim()
    .replace(/["'׳״\-]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map(word => (word.startsWith("ה") && word.length > 3 ? word.substring(1) : word))
    .join(" ");
};

const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const findSimilarRequest = (name: string, activeRequestsList: { name: string }[]): string | null => {
  const normName = normalizeHebrewString(name);
  if (!normName) return null;

  for (const r of activeRequestsList) {
    const normActive = normalizeHebrewString(r.name);
    if (normName === normActive) return r.name;

    const distance = getLevenshteinDistance(normName, normActive);
    const minLength = Math.min(normName.length, normActive.length);
    const maxAllowedDistance = minLength >= 6 ? 2 : (minLength >= 4 ? 1 : 0);

    if (distance <= maxAllowedDistance && minLength > 2) {
      return r.name;
    }
  }
  return null;
};

export default function ShoppingPage() {
  const { user, role, isAdmin, isManager, isLogistics } = useAuth();
  const router = useRouter();

  const [requests, setRequests] = useState<ShoppingRequest[]>([]);
  const [pool, setPool] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "archive" | "inventory">("list");
  const [showArchivePrompt, setShowArchivePrompt] = useState(false);
  const [listType, setListType] = useState<"supermarket" | "large">("supermarket");
  const [isEditingRecurring, setIsEditingRecurring] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Inventory State
  const [inventoryMap, setInventoryMap] = useState<Record<string, InventoryItem>>({});
  const [editingInvItem, setEditingInvItem] = useState<{ productId: string; name: string; minStock: number; unit: string } | null>(null);
  const [showManageTrackModal, setShowManageTrackModal] = useState(false);

  // Receipt Modal State
  const [receiptScanOpen, setReceiptScanOpen] = useState(false);

  // Add Bar State
  const [inputVal, setInputVal] = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "warning" } | null>(null);

  // Quick edit item modal
  const [editItem, setEditItem] = useState<ShoppingRequest | null>(null);

  // Category State
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState([
    "גבינות ומחלבה", "לחם ומאפים", "חומרי ניקוי",
    "מוצרי נייר וחד פעמי", "שימורים ובישול", "פירות וירקות",
    "טואלטיקה והיגיינה", "בשר ודגים", "קפואים", "כללי",
  ]);

  // Star Products State
  const [showManageStarModal, setShowManageStarModal] = useState(false);
  
  // Admin Product Requests Modal State
  const [showAdminRequestsModal, setShowAdminRequestsModal] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const canPurchase = isAdmin || role === "manager" || role === "admin" || role === "logistics" || isManager;

  const showToast = (message: string, type: "success" | "warning") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Firebase Realtime Subscriptions
  useEffect(() => {
    if (!user) return;

    getDoc(doc(db, "settings", "shopping")).then((s) => {
      if (s.exists() && s.data().categories) setCategories(s.data().categories);
    });

    fetchPool();

    const q = query(collection(db, "shopping_requests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: ShoppingRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ShoppingRequest));
      setRequests(list);
      setLoading(false);
    });

    const unsubInv = onSnapshot(collection(db, "inventory"), (snap) => {
      const map: Record<string, InventoryItem> = {};
      snap.forEach((d) => {
        map[d.id] = { id: d.id, productId: d.id, ...d.data() } as InventoryItem;
      });
      setInventoryMap(map);
    });

    return () => {
      unsub();
      unsubInv();
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

  const fetchPool = async () => {
    const snap = await getDocs(collection(db, "product_pool"));
    const list: Product[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Product));
    list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    setPool(list);
  };

  // Inventory Stock Updates with Firestore & Logging
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

      // Log Inventory Change
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

  // Batch Inventory Count Update
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

  // Smart Reorder (Adds all items with stock <= minStock to Shopping List)
  const handleSmartReorder = async () => {
    const trackedProducts = pool.filter((p) => p.trackInventory === true);
    const lowOrOutItems = trackedProducts.filter((p) => {
      const s = inventoryMap[p.id]?.currentStock ?? 0;
      const m = inventoryMap[p.id]?.minStock ?? 1;
      return s <= m;
    });

    if (lowOrOutItems.length === 0) {
      showToast("כל המוצרים במעקב נמצאים ברמת מלאי תקינה!", "success");
      return;
    }

    const activeRequestsList = requests.filter((r) => r.status !== "archived" && r.status !== "deleted");

    let addedCount = 0;
    for (const item of lowOrOutItems) {
      const inv = inventoryMap[item.id];
      const unit = inv?.unit || item.defaultUnit || "יחידות";

      if (!findSimilarRequest(item.name, activeRequestsList)) {
        await addDoc(collection(db, "shopping_requests"), {
          name: item.name,
          category: item.category || "כללי",
          quantity: `1 ${unit}`,
          notes: `הוזמן אוטומטית (מלאי חסר: ${inv?.currentStock ?? 0}/${inv?.minStock ?? 1})`,
          priority: (inv?.currentStock ?? 0) === 0 ? "urgent" : "normal",
          status: "approved",
          requestedBy: user?.uid,
          requestedByName: user?.displayName || "Smart Reorder",
          createdAt: new Date(),
          listType: "supermarket",
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      showToast(`התווספו ${addedCount} מוצרים חסרים לרשימת הקניות! 🛒`, "success");
    } else {
      showToast("כל המוצרים החסרים כבר קיימים ברשימת הקניות.", "warning");
    }
  };

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
    priority: "normal" | "urgent" = "normal",
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
    const similarName = findSimilarRequest(cleanName, activeRequestsList);
    if (similarName) {
      showToast(`המוצר כבר הוזמן לרשימה בשם דומה: "${similarName}"!`, "warning");
      return;
    }

    // Check if item has stock in inventory
    const norm = cleanName.toLowerCase();
    const invMatch = Object.values(inventoryMap).find((i) => (i?.name || "").trim().toLowerCase() === norm);
    if (invMatch && invMatch.currentStock > 0) {
      if (!isAdmin && !isLogistics) {
        showToast(`למוצר "${cleanName}" יש כרגע ${invMatch.currentStock} ${invMatch.unit || "יחידות"} במלאי המחסן - לא ניתן להוסיף לרשימת הקניות.`, "warning");
        return;
      } else {
        showToast(`שים לב: למוצר "${cleanName}" יש כרגע ${invMatch.currentStock} ${invMatch.unit || "יחידות"} במלאי!`, "warning");
      }
    }

    const poolMatch = pool.find((p) => p.name.trim().toLowerCase() === norm);
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
    if (!pool.some((p) => p.name === cleanName) && canPurchase) fetchPool();
  };

  const changeStatus = useCallback(
    async (
      id: string,
      next: "pending" | "approved" | "purchased" | "archived" | "deleted" | "permanently_delete",
      extra: Record<string, any> = {}
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
              const normReqName = normalizeHebrewString(targetReq.name);
              const matchingProduct = pool.find((p) => normalizeHebrewString(p.name) === normReqName);
              if (matchingProduct) {
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
    [requests, pool, inventoryMap, user]
  );

  const updateQuantity = async (id: string, currentQtyStr: string, increment: number) => {
    const currentVal = parseFloat(currentQtyStr) || 1;
    const nextVal = Math.max(1, currentVal + increment);
    const nextQty = String(nextVal);
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
    const sessionPurchased = requests.filter(
      (r) => r.status === "purchased" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
    );
    if (sessionPurchased.length === 0) return;
    try {
      setLoading(true);
      await Promise.all(
        sessionPurchased.map((r) =>
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
      await fetchPool();
    } catch (e) {
      console.error(e);
    }
  };

  const updateRecurringQuantity = async (productId: string, currentQtyStr: string, increment: number) => {
    const currentVal = parseFloat(currentQtyStr) || 1;
    const nextVal = Math.max(1, currentVal + increment);
    try {
      await updateDoc(doc(db, "product_pool", productId), { recurringQuantity: String(nextVal) });
      await fetchPool();
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
      const itemsToImport = recurringItems.filter((item) => !findSimilarRequest(item.name, activeSupermarketRequests));

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

  const toggleTrackInventory = async (productId: string, currentTrack?: boolean) => {
    try {
      await setDoc(doc(db, "product_pool", productId), { trackInventory: !currentTrack }, { merge: true });
      await fetchPool();
      showToast(!currentTrack ? "המוצר סומן למעקב מלאי" : "המוצר הוסר ממעקב מלאי", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStarProduct = async (productId: string, currentIsStar?: boolean) => {
    try {
      await setDoc(doc(db, "product_pool", productId), { isStar: !currentIsStar }, { merge: true });
      await fetchPool();
      showToast(!currentIsStar ? "המוצר סומן כמוצר כוכב ⭐" : "המוצר הוסר ממוצרי הכוכב", "success");
    } catch (e) {
      console.error(e);
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
    if (!confirm(`האם ברצונך למחוק את הקטגוריה "${catName}"?`)) return;

    const next = categories.filter((c) => c !== catName);
    setCategories(next);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: next }, { merge: true });
      showToast("הקטגוריה נמחקה בהצלחה!", "success");
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

  const exportProcurementList = async () => {
    try {
      const activeSession = requests.filter((r) => r.status !== "archived" && r.listType === "large");
      const sortedItems = [...activeSession].sort((a, b) => a.category.localeCompare(b.category));
      const itemsToExport = sortedItems.map((r) => {
        const poolMatch = pool.find((p) => (p.name || "").trim().toLowerCase() === (r.name || "").trim().toLowerCase());
        return {
          name: r.name,
          category: r.category,
          quantity: r.quantity || "1",
          notes: r.notes || poolMatch?.defaultNotes || "",
          requestedByName: r.requestedByName || "",
        };
      });
      const dateStr = format(new Date(), "dd/MM/yyyy");
      const docx = generateShoppingListWord(itemsToExport, { date: dateStr, title: "רשימת רכש וציוד - חוות רום" });
      await generateDocxWithLetterhead(docx, `רשימת_רכש_${format(new Date(), "yyyy-MM-dd")}.docx`);
      showToast("הופקה רשימת רכש והורדה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const exportOngoingList = async () => {
    try {
      const activeSession = requests.filter((r) => r.status !== "archived" && r.listType !== "large");
      const sortedItems = [...activeSession].sort((a, b) => a.category.localeCompare(b.category));
      const itemsToExport = sortedItems.map((r) => {
        const poolMatch = pool.find((p) => (p.name || "").trim().toLowerCase() === (r.name || "").trim().toLowerCase());
        return {
          name: r.name,
          category: r.category,
          quantity: r.quantity || "1",
          notes: r.notes || poolMatch?.defaultNotes || "",
          requestedByName: r.requestedByName || "",
        };
      });
      const dateStr = format(new Date(), "dd/MM/yyyy");
      const docx = generateShoppingListWord(itemsToExport, { date: dateStr, title: "רשימת קניות שוטפת סופר - חוות רום" });
      await generateDocxWithLetterhead(docx, `רשימת_קניות_סופר_${format(new Date(), "yyyy-MM-dd")}.docx`);
      showToast("הופקה רשימה שוטפת והורדה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const exportXlsx = () => {
    const data = requests
      .filter((r) => r.status === "archived")
      .map((r) => {
        const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
        const poolMatch = pool.find((p) => (p.name || "").trim().toLowerCase() === (r.name || "").trim().toLowerCase());
        return {
          תאריך: d.toLocaleDateString("he-IL"),
          מוצר: r.name,
          קטגוריה: r.category,
          כמות: r.quantity || "1",
          הערות: r.notes || poolMatch?.defaultNotes || "",
          מבקש: r.requestedByName,
        };
      });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ארכיון רכש");
    XLSX.writeFile(wb, `ארכיון_רכש_${new Date().toLocaleDateString("he-IL").replace(/\//g, "-")}.xlsx`);
  };

  const handleSaveReceipt = async (file: File, notes: string) => {
    const fileId = `${Date.now()}_${user?.uid}`;
    const storageRef = ref(storage, `receipts/${fileId}.jpg`);
    await uploadBytes(storageRef, file, { contentType: "image/jpeg" });
    const imageUrl = await getDownloadURL(storageRef);

    await addDoc(collection(db, "receipts"), {
      userId: user?.uid || "",
      userName: user?.displayName || user?.email || "מערכת",
      notes: notes.trim(),
      imageUrl,
      createdAt: new Date(),
    });

    showToast("החשבונית נשמרה בהצלחה בארכיון הקבלות!", "success");
  };

  const clearAllArchive = async () => {
    if (!canPurchase) return;
    if (confirm("אזהרה: האם ברצונך למחוק ולאפס את כל ארכיון הקניות והבקשות הישנות?")) {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, "shopping_requests"));
        await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "shopping_requests", d.id))));
        showToast("ארכיון הקניות נוקה בהצלחה!", "success");
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  };

  const activeRequests = requests.filter(
    (r) =>
      (r.status === "approved" || r.status === "pending") &&
      (listType === "large" ? r.listType === "large" : r.listType !== "large")
  );
  const sessionPurchased = requests.filter(
    (r) => r.status === "purchased" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
  );
  const archived = requests.filter(
    (r) => r.status === "archived" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
  );

  const archiveByDate = archived.reduce((acc, item) => {
    const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
    const key = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {} as Record<string, ShoppingRequest[]>);

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <div dir="rtl" className="flex flex-col h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans">
        {/* ── Mobile Action Bar (Top) ── */}
        <div className="md:hidden pt-2 pb-2.5 px-3 bg-[var(--background)] border-b border-[var(--border)] z-40 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => router.push("/")}
                className="w-7 h-7 flex items-center justify-center rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] active:scale-95 transition-all shrink-0"
              >
                <ArrowRight className="w-4 h-4 text-[var(--muted)]" />
              </button>

              <div className="flex items-center gap-1 bg-[var(--foreground)]/[0.04] p-0.5 rounded-xl border border-[var(--border)] shrink-0">
                <button
                  onClick={() => setView("list")}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all border-none ${
                    view === "list" ? "bg-[var(--surface)] text-indigo-600 shadow-sm" : "text-[var(--muted)] bg-transparent"
                  }`}
                >
                  רשימה
                </button>
                {canPurchase && (
                  <button
                    onClick={() => setView("inventory")}
                    className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-0.5 border-none ${
                      view === "inventory" ? "bg-[var(--surface)] text-indigo-600 shadow-sm" : "text-[var(--muted)] bg-transparent"
                    }`}
                  >
                    <Boxes className="w-3 h-3" />
                    מלאי
                  </button>
                )}
                <button
                  onClick={() => setView("archive")}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all border-none ${
                    view === "archive" ? "bg-[var(--surface)] text-indigo-600 shadow-sm" : "text-[var(--muted)] bg-transparent"
                  }`}
                >
                  ארכיון
                </button>
              </div>

              {canPurchase && (
                <div className="flex bg-[var(--foreground)]/[0.04] p-0.5 rounded-xl border border-[var(--border)] relative shrink-0">
                  <button
                    onClick={() => {
                      setListType("supermarket");
                      setActiveCategory(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 border-none ${
                      listType === "supermarket" ? "bg-[var(--surface)] text-indigo-600 shadow-sm" : "text-[var(--muted)] bg-transparent"
                    }`}
                  >
                    <ShoppingCart className="w-3 h-3" />
                    סופר
                  </button>
                  <button
                    onClick={() => {
                      setListType("large");
                      setActiveCategory(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 border-none ${
                      listType === "large" ? "bg-[var(--surface)] text-indigo-600 shadow-sm" : "text-[var(--muted)] bg-transparent"
                    }`}
                  >
                    <Boxes className="w-3 h-3" />
                    רכש
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {canPurchase && (
                <button
                  onClick={() => setActionsMenuOpen(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] active:scale-95 transition-all"
                  title="פעולות נוספות"
                >
                  <Settings className="w-3.5 h-3.5 text-[var(--muted)]" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 group shadow-sm">
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-indigo-500 font-bold border-l border-[var(--border)] pl-2 ml-1">
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <Search className="w-3 h-3 opacity-60" />
              </div>
              <input
                ref={mobileInputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onFocus={() => setOverlayOpen(true)}
                placeholder="הוסף או חפש מוצר..."
                className="w-full bg-[var(--surface-raised)] border-2 border-indigo-600/20 rounded-xl py-2 pr-14 pl-3 text-xs font-black focus:outline-none focus:border-indigo-600 transition-all text-[var(--foreground)]"
              />
            </div>
          </div>
        </div>

        {/* ── Desktop Header ── */}
        <header className="hidden md:flex items-center justify-between px-8 h-20 shrink-0 border-b border-[var(--border)] bg-[var(--surface)]/60 backdrop-blur-xl z-30">
          {/* Right: Title & Search */}
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-black flex items-center gap-2 text-[var(--foreground)] shrink-0">
              <span className="text-xl">💗🥒</span> קניות וניהול מלאי
            </h1>

            <div className="relative w-[340px]">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onFocus={() => setOverlayOpen(true)}
                placeholder="חיפוש או הוספת מוצר לרשימה..."
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-2.5 pr-11 pl-4 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-[var(--foreground)] shadow-xs"
              />
            </div>
          </div>

          {/* Left: Action Toolbar & Dropdowns */}
          <div className="flex items-center gap-3">
            {canPurchase && (
              <>
                {/* Export Options Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                    className="px-3.5 py-2 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--border)] hover:bg-[var(--foreground)]/[0.06] text-[var(--foreground)] transition-all flex items-center gap-2 text-xs font-bold cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-indigo-500" />
                    <span>ייצוא קבצים</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {exportMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        className="absolute left-0 top-full mt-2 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl p-2 z-50 flex flex-col gap-1 text-right"
                      >
                        <button
                          onClick={() => {
                            exportOngoingList();
                            setExportMenuOpen(false);
                          }}
                          className="w-full text-right px-3 py-2 rounded-xl text-xs font-bold hover:bg-[var(--foreground)]/5 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 cursor-pointer border-none bg-transparent"
                        >
                          <FileText className="w-4 h-4 text-emerald-500" />
                          <span>יצוא רשימה שוטפת (Word)</span>
                        </button>
                        <button
                          onClick={() => {
                            exportProcurementList();
                            setExportMenuOpen(false);
                          }}
                          className="w-full text-right px-3 py-2 rounded-xl text-xs font-bold hover:bg-[var(--foreground)]/5 flex items-center gap-2 text-blue-600 dark:text-blue-400 cursor-pointer border-none bg-transparent"
                        >
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span>יצוא רשימת רכש (Word)</span>
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              exportXlsx();
                              setExportMenuOpen(false);
                            }}
                            className="w-full text-right px-3 py-2 rounded-xl text-xs font-bold hover:bg-[var(--foreground)]/5 flex items-center gap-2 text-slate-700 dark:text-slate-300 border-t border-[var(--border)]/40 pt-2 cursor-pointer bg-transparent"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                            <span>יצוא ארכיון מלא (Excel)</span>
                          </button>
                        )}
                      </motion.div>
                    </>
                  )}
                </div>

                {/* Admin Product Requests Direct Button */}
                {isAdmin && (
                  <button
                    onClick={() => setShowAdminRequestsModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all flex items-center gap-2 text-xs font-black cursor-pointer relative shadow-xs border-none"
                  >
                    <Database className="w-4 h-4 text-amber-500" />
                    <span>בקשות מוצרים</span>
                    {pendingRequestsCount > 0 && (
                      <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-pulse shadow-xs">
                        {pendingRequestsCount}
                      </span>
                    )}
                  </button>
                )}

                {/* Tools & Admin Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
                    className="px-3.5 py-2 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--border)] hover:bg-[var(--foreground)]/[0.06] text-[var(--foreground)] transition-all flex items-center gap-2 text-xs font-bold cursor-pointer relative"
                  >
                    <Settings className="w-4 h-4 text-indigo-500" />
                    <span>כלים וניהול</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${toolsMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {toolsMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setToolsMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        className="absolute left-0 top-full mt-2 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl p-2 z-50 flex flex-col gap-1 text-right"
                      >
                        <button
                          onClick={() => {
                            setIsAddingCat(true);
                            setToolsMenuOpen(false);
                          }}
                          className="w-full text-right px-3 py-2 rounded-xl text-xs font-bold hover:bg-[var(--foreground)]/5 flex items-center gap-2 text-[var(--foreground)] cursor-pointer border-none bg-transparent"
                        >
                          <Edit3 className="w-4 h-4 text-indigo-500" />
                          <span>ניהול קטגוריות</span>
                        </button>
                        {(isAdmin || isLogistics) && (
                          <button
                            onClick={() => {
                              setIsEditingRecurring(true);
                              setToolsMenuOpen(false);
                            }}
                            className="w-full text-right px-3 py-2 rounded-xl text-xs font-bold hover:bg-[var(--foreground)]/5 flex items-center gap-2 text-[var(--foreground)] border-t border-[var(--border)]/40 pt-2 cursor-pointer bg-transparent"
                          >
                            <Settings className="w-4 h-4 text-purple-500" />
                            <span>עריכת רשימה קבועה</span>
                          </button>
                        )}
                      </motion.div>
                    </>
                  )}
                </div>

                {/* Receipt Scan Primary Button */}
                <button
                  onClick={() => setReceiptScanOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-600 !text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 border-none"
                >
                  <Receipt className="w-4 h-4 text-white" />
                  <span>סריקת קבלה</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* ── Desktop Sub-Header Navigation Toolbar ── */}
        <div className="hidden md:flex items-center justify-between px-8 py-2.5 bg-[var(--surface)] border-b border-[var(--border)] shrink-0 z-20">
          {/* Views Segmented Switcher */}
          <div className="flex bg-[var(--foreground)]/[0.04] p-1 rounded-xl border border-[var(--border)] gap-1">
            <button
              onClick={() => setView("list")}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                view === "list" ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-[var(--muted)] bg-transparent"
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>רשימה פעילה</span>
            </button>

            {canPurchase && (
              <button
                onClick={() => setView("inventory")}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                  view === "inventory" ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-[var(--muted)] bg-transparent"
                }`}
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>ניהול מלאי</span>
              </button>
            )}

            {(isAdmin || isLogistics) && (
              <button
                onClick={() => setView("archive")}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                  view === "archive" ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-[var(--muted)] bg-transparent"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>ארכיון קניות</span>
              </button>
            )}
          </div>

          {/* Sub-List Selector & Action */}
          {view === "list" && !loading && (
            <div className="flex items-center gap-3">
              <div className="flex bg-[var(--foreground)]/[0.04] p-1 rounded-xl border border-[var(--border)]">
                <button
                  onClick={() => {
                    setListType("supermarket");
                    setActiveCategory(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border-none ${
                    listType === "supermarket"
                      ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm font-black"
                      : "text-[var(--muted)] bg-transparent"
                  }`}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>קניות סופר</span>
                </button>
                <button
                  onClick={() => {
                    setListType("large");
                    setActiveCategory(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border-none ${
                    listType === "large"
                      ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm font-black"
                      : "text-[var(--muted)] bg-transparent"
                  }`}
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>ציוד ורכש</span>
                </button>
              </div>

              {listType === "supermarket" && canPurchase && (
                <button
                  onClick={importRecurringList}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300 hover:bg-purple-500/20 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-purple-500" />
                  <span>שאיבת רשימה קבועה לסופר</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Main Content Body */}
        <main className="flex-1 overflow-hidden flex flex-col relative bg-[var(--background)]">
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <div className="max-w-[950px] mx-auto pb-36">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
              ) : view === "list" ? (
                <ShoppingListView
                  requests={requests}
                  inventoryMap={inventoryMap}
                  pool={pool}
                  categories={categories}
                  listType={listType}
                  activeCategory={activeCategory}
                  setActiveCategory={setActiveCategory}
                  canPurchase={canPurchase}
                  isAdmin={isAdmin}
                  isLogistics={isLogistics}
                  currentUser={user}
                  onChangeStatus={changeStatus}
                  onEditItem={setEditItem}
                  onUpdateQuantity={updateQuantity}
                  onMoveToEquipment={moveToEquipment}
                  onMoveToSupermarket={moveToSupermarket}
                  onShowArchivePrompt={() => setShowArchivePrompt(true)}
                  onSwitchToInventoryView={() => setView("inventory")}
                />
              ) : view === "inventory" ? (
                <InventoryView
                  pool={pool}
                  inventoryMap={inventoryMap}
                  categories={categories}
                  activeRequests={activeRequests}
                  activeCategory={activeCategory}
                  setActiveCategory={setActiveCategory}
                  onUpdateStock={updateInventoryStock}
                  onBatchUpdateStock={batchUpdateStock}
                  onAddToShoppingList={(name, category, unit) => addProduct(name, category, "normal", unit ? `1 ${unit}` : "1")}
                  onSmartReorder={handleSmartReorder}
                  onOpenManageTrackModal={() => setShowManageTrackModal(true)}
                  onOpenCategoryModal={() => setIsAddingCat(true)}
                  onOpenSettingsModal={setEditingInvItem}
                  onToggleTrackInventory={toggleTrackInventory}
                />
              ) : (
                /* Archive View */
                <div className="p-4 space-y-6">
                  <h2 className="text-2xl font-black px-2 text-[var(--foreground)]">ארכיון רכישות</h2>
                  {Object.entries(archiveByDate)
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([date, items]) => (
                      <div key={date} className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-sm">
                        <div className="px-6 py-4 bg-[var(--foreground)]/5 border-b border-[var(--border)] flex items-center justify-between">
                          <span className="text-sm font-bold text-[var(--foreground)]">{date}</span>
                          <span className="text-xs font-black opacity-40">{items.length} מוצרים</span>
                        </div>
                        <div className="divide-y divide-[var(--border)]">
                          {items.map((item) => (
                            <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                              <span className="text-sm font-bold text-[var(--muted)]">{item.name}</span>
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[var(--foreground)]/5 text-[var(--muted)]">
                                {item.category}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Add Product Overlay Modal */}
        <AddProductOverlay
          isOpen={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          pool={pool}
          categories={categories}
          inventoryMap={inventoryMap}
          requests={requests}
          inputVal={inputVal}
          setInputVal={setInputVal}
          onAddProduct={addProduct}
          onRequestNewProduct={requestNewProduct}
          isAdmin={isAdmin}
        />

        {/* Admin Product Requests Modal */}
        <AdminProductRequestsModal
          isOpen={showAdminRequestsModal}
          onClose={() => setShowAdminRequestsModal(false)}
          pool={pool}
          categories={categories}
          onAddProduct={async (name, cat, unit, notes) => {
            const docId = name.replace(/\//g, "-");
            await setDoc(
              doc(db, "product_pool", docId),
              {
                name,
                category: cat,
                defaultUnit: unit || "",
                defaultNotes: notes || "",
                isActive: true,
              },
              { merge: true }
            );
          }}
          onAddToShoppingList={async (name, cat, priority, qty, notes) => {
            await addProduct(name, cat, priority, qty, notes);
          }}
        />

        {/* Application Modals */}
        <ShoppingModals
          editItem={editItem}
          setEditItem={setEditItem}
          onUpdateItem={(id, name, cat, qty, notes, priority) => {
            updateDoc(doc(db, "shopping_requests", id), { name, category: cat, quantity: qty, notes, priority });
          }}
          isAddingCat={isAddingCat}
          setIsAddingCat={setIsAddingCat}
          categories={categories}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          editingInvItem={editingInvItem}
          setEditingInvItem={setEditingInvItem}
          onSaveInventorySettings={saveInventorySettings}
          isEditingRecurring={isEditingRecurring}
          setIsEditingRecurring={setIsEditingRecurring}
          pool={pool}
          onToggleRecurring={toggleRecurring}
          onUpdateRecurringQuantity={updateRecurringQuantity}
          showArchivePrompt={showArchivePrompt}
          setShowArchivePrompt={setShowArchivePrompt}
          sessionPurchasedCount={sessionPurchased.length}
          onArchiveCurrentSession={archiveCurrentSession}
          actionsMenuOpen={actionsMenuOpen}
          setActionsMenuOpen={setActionsMenuOpen}
          listType={listType}
          canPurchase={canPurchase}
          isAdmin={isAdmin}
          isManager={isManager}
          isLogistics={isLogistics}
          onImportRecurringList={importRecurringList}
          onExportProcurementList={exportProcurementList}
          onExportOngoingList={exportOngoingList}
          onExportXlsx={exportXlsx}
          onClearAllArchive={clearAllArchive}
          receiptScanOpen={receiptScanOpen}
          setReceiptScanOpen={setReceiptScanOpen}
          currentUser={user}
          onSaveReceipt={handleSaveReceipt}
          showManageStarModal={showManageStarModal}
          setShowManageStarModal={setShowManageStarModal}
          onToggleStarProduct={toggleStarProduct}
          showManageTrackModal={showManageTrackModal}
          setShowManageTrackModal={setShowManageTrackModal}
          onToggleTrackInventory={toggleTrackInventory}
        />

        {/* Global Toast Alert */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className={`fixed top-16 md:top-24 left-1/2 -translate-x-1/2 z-[150] px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 max-w-md w-[90%] border backdrop-blur-md ${
                toast.type === "success"
                  ? "bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                  : "bg-amber-50/95 dark:bg-amber-950/90 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200"
              }`}
            >
              <span className="text-xs font-black leading-relaxed">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}