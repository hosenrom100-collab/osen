"use client";

import { useState, useEffect } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ConnectionStatusBanner } from "@/components/ui/ConnectionStatusBanner";
import { db } from "@/lib/firebase/config";
import {
  doc, updateDoc, deleteDoc, setDoc, collection, query, where, onSnapshot, getDoc
} from "firebase/firestore";
import {
  Loader2, ShoppingBag, Clock, Package, Plus, X, Truck
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

import { TargetFramework } from "./types";
import { TARGET_FRAMEWORKS } from "./lib/constants";
import { CycleClosureModal } from "./components/CycleClosureModal";
import { ShoppingListView } from "./components/ShoppingListView";
import { AddProductOverlay } from "./components/AddProductOverlay";
import { ShoppingModals } from "./components/ShoppingModals";
import { ShoppingHeader } from "./components/ShoppingHeader";
import { MenuSheet } from "./components/MenuSheet";
import { AdminProductRequestsModal } from "./components/AdminProductRequestsModal";
import { closeCycle } from "./lib/closeCycle";
import { CycleHistorySheet } from "./components/CycleHistorySheet";
import { useShoppingData } from "./hooks/useShoppingData";
import { useLastCycleItems } from "./hooks/useLastCycle";
import { useExport } from "./hooks/useExport";
import { useShoppingActions } from "./hooks/useShoppingActions";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { useAdminPasswordGate } from "./hooks/useAdminPasswordGate";
import { useConfirm } from "@/hooks/useConfirm";

export default function ShoppingPage() {
  const { user, role, isAdmin, isManager, isLogistics } = useAuth();

  const [listType, setListType] = useState<"supermarket" | "large">("supermarket");
  const [selectedFramework, setSelectedFramework] = useState<"all" | TargetFramework>("all");
  const [orderingFramework, setOrderingFramework] = useState<TargetFramework>("main");
  const [menuOpen, setMenuOpen] = useState(false);

  // Overlay state
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayInitialMode, setOverlayInitialMode] = useState<"favorites" | "search">("favorites");
  const [toast, setToast] = useState<{ message: string; type: "success" | "warning" } | null>(null);

  // Category State
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Initialize and persist framework selection from / to localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("shopping_selected_framework");
      if (saved && (saved === "all" || TARGET_FRAMEWORKS.some((f) => f.id === saved))) {
        setSelectedFramework(saved as "all" | TargetFramework);
        if (saved !== "all") {
          setOrderingFramework(saved as TargetFramework);
        }
        return;
      }
    } catch (e) {
      console.error("Error reading saved framework:", e);
    }

    // If no saved preference, default to assigned complex if available
    if (user) {
      getDoc(doc(db, "users", user.uid)).then((snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.assignedComplex === "lower") {
            setSelectedFramework("lower");
            setOrderingFramework("lower");
          }
        }
      }).catch((err) => console.error("Error checking user framework:", err));
    }
  }, [user]);

  const handleFrameworkChange = (fw: "all" | TargetFramework) => {
    setSelectedFramework(fw);
    try {
      localStorage.setItem("shopping_selected_framework", fw);
    } catch (e) {
      console.error("Error saving framework to localStorage:", e);
    }
    if (fw !== "all") {
      setOrderingFramework(fw);
    }
  };

  const handleOrderingFrameworkChange = (fw: TargetFramework) => {
    setOrderingFramework(fw);
    try {
      localStorage.setItem("shopping_ordering_framework", fw);
      if (selectedFramework !== "all") {
        setSelectedFramework(fw);
        localStorage.setItem("shopping_selected_framework", fw);
      }
    } catch (e) {
      console.error("Error saving ordering framework to localStorage:", e);
    }
  };

  const {
    requests, pool, loading, setLoading, pendingRequestsCount, categories, setCategories,
    cutoffConfig, setCutoffConfig,
    activeRequests, sessionPurchased, currentActiveItems, cutoffStatus, isListFrozen,
    refetchSettings,
  } = useShoppingData(user, isAdmin, listType);

  const lastCycleItems = useLastCycleItems(listType, overlayOpen);

  const { pullDistance, isRefreshing, handlers: pullToRefreshHandlers } = usePullToRefresh(refetchSettings);

  // Star Products State
  const [showManageStarModal, setShowManageStarModal] = useState(false);

  // Admin Product Requests Modal State
  const [showAdminRequestsModal, setShowAdminRequestsModal] = useState(false);
  const [showCycleClosureModal, setShowCycleClosureModal] = useState(false);
  const [showCycleHistory, setShowCycleHistory] = useState(false);

  const canPurchase = isAdmin || role === "manager" || role === "admin" || role === "logistics" || isManager;

  // Pending Store Authorization Requests Count
  const [pendingStoreAuthCount, setPendingStoreAuthCount] = useState(0);

  useEffect(() => {
    if (!canPurchase) return;
    const q = query(
      collection(db, "storeAuthorizationRequests"),
      where("status", "==", "pending")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setPendingStoreAuthCount(snapshot.size),
      (err) => console.error(err)
    );
    return () => unsubscribe();
  }, [canPurchase]);

  const showToast = (message: string, type: "success" | "warning") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const { verify: verifyAdminPasswordGate } = useAdminPasswordGate();

  const verifyAdminPassword = async (pass: string) => {
    const trimmed = pass.trim();
    if (!trimmed) return { success: false, error: "אנא הזן סיסמה" };
    const res = await verifyAdminPasswordGate(trimmed);
    if (res.success) return res;
    return { success: false, error: res.error || "סיסמת מנהל שגויה" };
  };

  const { confirm, ConfirmDialog } = useConfirm();

  const {
    requestNewProduct,
    addProduct, changeStatus, updateQuantity, moveToEquipment, moveToSupermarket,
    toggleStarProduct, updateItem,
    handleAddCategory, handleRenameCategory, handleDeleteCategory, handleSaveCutoffConfig,
  } = useShoppingActions(
    user, isAdmin, isLogistics, requests, pool, listType,
    categories, setCategories, setCutoffConfig, setLoading, showToast, confirm
  );

  const {
    exportProcurementList,
    exportOngoingList,
    exportSplitOngoingLists,
    exportSplitProcurementLists,
  } = useExport(requests, pool, showToast);

  const menuHasBadge =
    (canPurchase && pendingStoreAuthCount > 0) || (isAdmin && pendingRequestsCount > 0);

  // Auto-dismiss cutoff banner after 4.5s on mobile to maximize list real estate
  const [showCutoffBanner, setShowCutoffBanner] = useState(true);

  useEffect(() => {
    if (!cutoffStatus.isEnabled || isListFrozen) return;
    const timer = setTimeout(() => {
      setShowCutoffBanner(false);
    }, 4500);
    return () => clearTimeout(timer);
  }, [cutoffStatus.isEnabled, isListFrozen]);

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <ConnectionStatusBanner />
      <div dir="rtl" className="flex flex-col h-[100dvh] bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans relative">
        <ShoppingHeader
          listType={listType}
          setListType={setListType}
          setActiveCategory={setActiveCategory}
          hasMenuBadge={menuHasBadge}
          onOpenMenu={() => setMenuOpen(true)}
          cutoffStatus={cutoffStatus}
          isCutoffBannerVisible={showCutoffBanner}
          onToggleCutoffBanner={() => setShowCutoffBanner((prev) => !prev)}
        />

        {/* ── Weekly cutoff status (Auto-collapsible to save screen space) ── */}
        <AnimatePresence>
          {cutoffStatus.isEnabled && (isListFrozen || showCutoffBanner) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden px-2.5 sm:px-4 md:px-6 pt-1.5 shrink-0"
            >
              {isListFrozen ? (
                <div className="p-2.5 sm:p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between flex-wrap gap-2 text-right" dir="rtl">
                  <div className="flex items-center gap-2">
                    <span className="text-base shrink-0">🔒</span>
                    <div>
                      <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400">
                        מועד הקציבה השבועי חלף ({cutoffStatus.formattedTarget})
                      </h4>
                      <p className="text-xs font-bold text-[var(--foreground)]/70 mt-0.5">
                        {isAdmin || isLogistics
                          ? `הרשימה מוקפאת להזנות (${currentActiveItems.length} מוצרים).`
                          : `הרשימה הוקפאה להזנות לקראת ביצוע רכש.`}
                        {cutoffStatus.deliveryDayFormatted && ` (משלוח: ${cutoffStatus.deliveryDayFormatted})`}
                      </p>
                    </div>
                  </div>
                  {(isAdmin || isLogistics) && (
                    <button
                      onClick={() => setShowCycleClosureModal(true)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 !text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border-none shrink-0"
                    >
                      <Package className="w-3.5 h-3.5 text-white" />
                      <span>הפקת רשימה</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-line)] flex items-center justify-between text-xs font-bold text-[var(--accent-text)] gap-2" dir="rtl">
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    <Clock className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                    <span className="truncate">סגירת הזנות: <strong>{cutoffStatus.formattedTarget}</strong></span>
                    {cutoffStatus.deliveryDayFormatted && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                        <Truck className="w-3.5 h-3.5" />
                        <span>משלוח: <strong>{cutoffStatus.deliveryDayFormatted}</strong></span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-bold bg-indigo-500/20 px-2 py-0.5 rounded-full text-xs">
                      {cutoffStatus.timeLeftFormatted}
                    </span>
                    <button
                      onClick={() => setShowCutoffBanner(false)}
                      className="p-1 rounded-lg hover:bg-[var(--accent-soft-hover)] text-[var(--accent-text)] transition-colors border-none cursor-pointer bg-transparent"
                      aria-label="סגור הודעה"
                      title="סגור הודעה"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Body */}
        <main className="flex-1 overflow-hidden flex flex-col relative bg-[var(--background)]">
          <div className="flex-1 overflow-y-auto no-scrollbar" {...pullToRefreshHandlers}>
            {(pullDistance > 0 || isRefreshing) && (
              <div
                className="flex items-center justify-center overflow-hidden transition-[height]"
                style={{ height: isRefreshing ? 44 : Math.min(pullDistance, 80) }}
              >
                <Loader2 className={`w-5 h-5 text-[var(--accent-text)] ${isRefreshing ? "animate-spin" : ""}`} />
              </div>
            )}
            <div className="max-w-[700px] mx-auto pb-24">
              {/* Pending Store Authorization Requests */}
              {canPurchase && pendingStoreAuthCount > 0 && (
                <div className="my-3 mx-2 md:mx-0 p-3.5 rounded-2xl bg-[var(--accent)] text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/15 rounded-xl shrink-0">
                      <ShoppingBag className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">אישור קניות אד-הוק</span>
                        <span className="px-2 py-0.5 bg-white/20 text-xs font-bold rounded-full">
                          {pendingStoreAuthCount} ממתינות
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link href="/admin/store-requests">
                    <button className="px-3.5 py-1.5 bg-white text-indigo-700 font-bold rounded-xl text-xs hover:bg-indigo-50 transition shrink-0 cursor-pointer border-none">
                      סקור ואשר ←
                    </button>
                  </Link>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                  <Loader2 className="w-8 h-8 text-[var(--accent-text)] animate-spin" />
                </div>
              ) : (
                <ShoppingListView
                  requests={requests}
                  categories={categories}
                  listType={listType}
                  activeCategory={activeCategory}
                  setActiveCategory={setActiveCategory}
                  selectedFramework={selectedFramework}
                  setSelectedFramework={handleFrameworkChange}
                  canPurchase={canPurchase}
                  isAdmin={isAdmin}
                  isLogistics={isLogistics}
                  currentUser={user}
                  onChangeStatus={changeStatus}
                  onUpdateItem={updateItem}
                  onUpdateQuantity={updateQuantity}
                  onMoveToEquipment={moveToEquipment}
                  onMoveToSupermarket={moveToSupermarket}
                  onExportOngoingList={exportOngoingList}
                  onExportProcurementList={exportProcurementList}
                />
              )}
            </div>
          </div>
        </main>

        {/* ── Floating Action Button: opens the add sheet directly — the tabs inside it
             already cover favorites vs. search, so a menu in front of it was one extra
             decision with no payoff. ── */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            setOverlayInitialMode("favorites");
            setOverlayOpen(true);
          }}
          className="fixed bottom-24 md:bottom-8 left-6 z-[55] w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-xl shadow-indigo-600/30 flex items-center justify-center cursor-pointer border-none transition-all active:scale-95"
          aria-label="הוסף מוצר לרשימה"
          title="הוסף מוצר לרשימה"
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </motion.button>

        {/* Add Product Overlay */}
        <AddProductOverlay
          isOpen={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          initialMode={overlayInitialMode}
          pool={pool}
          categories={categories}
          requests={requests}
          lastCycleItems={lastCycleItems}
          targetFramework={orderingFramework}
          onTargetFrameworkChange={handleOrderingFrameworkChange}
          onAddProduct={addProduct}
          onRequestNewProduct={requestNewProduct}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={(id) => changeStatus(id, "deleted")}
          isAdmin={isAdmin}
          isManager={isManager}
          isLogistics={isLogistics}
          isFrozen={isListFrozen}
        />

        {/* Unified "⋯" Menu */}
        <MenuSheet
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          listType={listType}
          canPurchase={canPurchase}
          isAdmin={isAdmin}
          isManager={isManager}
          isLogistics={isLogistics}
          pendingStoreAuthCount={pendingStoreAuthCount}
          pendingRequestsCount={pendingRequestsCount}
          requests={requests}
          onOpenCategories={() => setIsAddingCat(true)}
          onOpenStarManager={() => setShowManageStarModal(true)}
          onOpenAdminRequests={() => setShowAdminRequestsModal(true)}
          onOpenCycleHistory={() => setShowCycleHistory(true)}
          onExportProcurementList={exportProcurementList}
          onExportOngoingList={exportOngoingList}
          onExportSplitOngoingLists={exportSplitOngoingLists}
          onExportSplitProcurementLists={exportSplitProcurementLists}
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
          onAddToShoppingList={async (name, cat, priority, qty, notes, requestedByOverride) => {
            await addProduct(name, cat, priority, qty, notes, requestedByOverride, orderingFramework);
          }}
        />

        {/* Cycle Closure & Pre-Flight Review Modal */}
        <CycleClosureModal
          isOpen={showCycleClosureModal}
          onClose={() => setShowCycleClosureModal(false)}
          listType={listType}
          requests={requests}
          pool={pool}
          categories={categories}
          onVerifyPassword={verifyAdminPassword}
          onAddProduct={async (name, cat, priority, qty, notes) => {
            await addProduct(name, cat, priority, qty, notes, undefined, orderingFramework);
          }}
          onExportList={async () => {
            if (listType === "large") {
              await exportSplitProcurementLists();
            } else {
              await exportSplitOngoingLists();
            }
          }}
          onCloseCycle={async ({ carryOver }) => {
            const { purchased, carriedOver, dropped } = await closeCycle({ listType, carryOver, user });
            showToast(
              carriedOver > 0
                ? `הסבב נסגר ונשמר בהיסטוריה (${purchased} נרכשו). ${carriedOver} מוצרים הועברו לסבב הבא.`
                : `הסבב נסגר ונשמר בהיסטוריה (${purchased} נרכשו, ${dropped} הוסרו). הרשימה מוכנה לשבוע הבא.`,
              "success"
            );
          }}
          onRemoveItem={async (id) => {
            await deleteDoc(doc(db, "shopping_requests", id));
          }}
          onUpdateQuantity={async (id, newQty) => {
            await updateDoc(doc(db, "shopping_requests", id), { quantity: newQty });
          }}
        />

        <CycleHistorySheet
          isOpen={showCycleHistory}
          onClose={() => setShowCycleHistory(false)}
          listType={listType}
        />

        {/* Settings sheets */}
        <ShoppingModals
          isAddingCat={isAddingCat}
          setIsAddingCat={setIsAddingCat}
          categories={categories}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          pool={pool}
          isAdmin={isAdmin}
          isLogistics={isLogistics}
          showManageStarModal={showManageStarModal}
          setShowManageStarModal={setShowManageStarModal}
          onToggleStarProduct={toggleStarProduct}
          cutoffConfig={cutoffConfig}
          onSaveCutoffConfig={handleSaveCutoffConfig}
        />

        {/* Global Toast Alert */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              role="status"
              aria-live={toast.type === "warning" ? "assertive" : "polite"}
              className={`fixed top-16 md:top-24 left-1/2 -translate-x-1/2 z-[150] px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 max-w-md w-[90%] border backdrop-blur-md ${
                toast.type === "success"
                  ? "bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                  : "bg-amber-50/95 dark:bg-amber-950/90 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200"
              }`}
            >
              <span className="text-xs font-bold leading-relaxed">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ConfirmDialog />
    </RoleGuard>
  );
}
