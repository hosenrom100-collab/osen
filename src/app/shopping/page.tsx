"use client";

import { useState, useEffect } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ConnectionStatusBanner } from "@/components/ui/ConnectionStatusBanner";
import { db } from "@/lib/firebase/config";
import {
  doc, updateDoc, deleteDoc, setDoc, collection, query, where, onSnapshot
} from "firebase/firestore";
import {
  Loader2, ShoppingBag, Clock, Package, Plus, Star, Search, X
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

import { CycleClosureModal } from "./components/CycleClosureModal";
import { ShoppingListView } from "./components/ShoppingListView";
import { AddProductOverlay } from "./components/AddProductOverlay";
import { ShoppingModals } from "./components/ShoppingModals";
import { ShoppingHeader } from "./components/ShoppingHeader";
import { MenuSheet } from "./components/MenuSheet";
import { AdminProductRequestsModal } from "./components/AdminProductRequestsModal";
import { useShoppingData } from "./hooks/useShoppingData";
import { useExport } from "./hooks/useExport";
import { useShoppingActions } from "./hooks/useShoppingActions";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { useConfirm } from "@/hooks/useConfirm";

export default function ShoppingPage() {
  const { user, role, isAdmin, isManager, isLogistics } = useAuth();

  const [listType, setListType] = useState<"supermarket" | "large">("supermarket");
  const [menuOpen, setMenuOpen] = useState(false);

  // Overlay state
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayInitialMode, setOverlayInitialMode] = useState<"favorites" | "search">("favorites");
  const [fabOpen, setFabOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "warning" } | null>(null);

  // Category State
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const {
    requests, pool, loading, setLoading, pendingRequestsCount, categories, setCategories,
    cutoffConfig, setCutoffConfig,
    activeRequests, sessionPurchased, currentActiveItems, cutoffStatus, isListFrozen,
    refetchSettings,
  } = useShoppingData(user, isAdmin, listType);

  const { pullDistance, isRefreshing, handlers: pullToRefreshHandlers } = usePullToRefresh(refetchSettings);

  // Star Products State
  const [showManageStarModal, setShowManageStarModal] = useState(false);

  // Admin Product Requests Modal State
  const [showAdminRequestsModal, setShowAdminRequestsModal] = useState(false);
  const [showCycleClosureModal, setShowCycleClosureModal] = useState(false);

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

  const verifyAdminPassword = async (pass: string) => {
    if (pass === "1234" || pass === "admin") return { success: true };
    return { success: false, error: "סיסמה שגויה" };
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

  const { exportProcurementList, exportOngoingList } = useExport(requests, pool, showToast);

  const menuHasBadge =
    (canPurchase && pendingStoreAuthCount > 0) || (isAdmin && pendingRequestsCount > 0);

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
        />

        {/* ── Weekly cutoff status ── */}
        {cutoffStatus.isEnabled && (
          <div className="px-3 md:px-6 pt-2 shrink-0">
            {isListFrozen ? (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between flex-wrap gap-2.5 text-right" dir="rtl">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg shrink-0">🔒</span>
                  <div>
                    <h4 className="text-xs font-black text-amber-700 dark:text-amber-400">
                      מועד הקציבה השבועי חלף ({cutoffStatus.formattedTarget})
                    </h4>
                    <p className="text-[11px] font-bold text-[var(--foreground)]/70 mt-0.5">
                      {isAdmin || isLogistics
                        ? `הרשימה מוקפאת להזנות. קיימים ${currentActiveItems.length} מוצרים הממתינים לרכש.`
                        : `הרשימה הוקפאה להזנות לקראת ביצוע רכש.`}
                    </p>
                  </div>
                </div>
                {(isAdmin || isLogistics) && (
                  <button
                    onClick={() => setShowCycleClosureModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 !text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border-none shrink-0"
                  >
                    <Package className="w-4 h-4 text-white" />
                    <span>הפקת רשימה להדפסה</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300" dir="rtl">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  סגירת הזנות: <strong>{cutoffStatus.formattedTarget}</strong>
                </span>
                <span className="font-black bg-indigo-500/20 px-2 py-0.5 rounded-full">
                  {cutoffStatus.timeLeftFormatted}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Main Content Body */}
        <main className="flex-1 overflow-hidden flex flex-col relative bg-[var(--background)]">
          <div className="flex-1 overflow-y-auto no-scrollbar" {...pullToRefreshHandlers}>
            {(pullDistance > 0 || isRefreshing) && (
              <div
                className="flex items-center justify-center overflow-hidden transition-[height]"
                style={{ height: isRefreshing ? 44 : Math.min(pullDistance, 80) }}
              >
                <Loader2 className={`w-5 h-5 text-indigo-500 ${isRefreshing ? "animate-spin" : ""}`} />
              </div>
            )}
            <div className="max-w-[700px] mx-auto pb-24">
              {/* Pending Store Authorization Requests */}
              {canPurchase && pendingStoreAuthCount > 0 && (
                <div className="my-3 mx-2 md:mx-0 p-3.5 rounded-2xl bg-indigo-600 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/15 rounded-xl shrink-0">
                      <ShoppingBag className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm">אישור קניות אד-הוק</span>
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
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
              ) : (
                <ShoppingListView
                  requests={requests}
                  categories={categories}
                  listType={listType}
                  activeCategory={activeCategory}
                  setActiveCategory={setActiveCategory}
                  onChangeStatus={changeStatus}
                  onUpdateItem={updateItem}
                  onUpdateQuantity={updateQuantity}
                  onMoveToEquipment={moveToEquipment}
                  onMoveToSupermarket={moveToSupermarket}
                />
              )}
            </div>
          </div>
        </main>

        {/* ── Floating Action Button (FAB) Speed Dial - Listonic style ── */}
        <div className="fixed bottom-24 md:bottom-8 left-6 z-[55] flex flex-col items-start gap-2.5">
          <AnimatePresence>
            {fabOpen && (
              <>
                {/* Backdrop to dismiss speed dial on click outside */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setFabOpen(false)}
                  className="fixed inset-0 z-[-1] bg-slate-950/20 backdrop-blur-[2px]"
                />

                {/* Search option button */}
                <motion.button
                  initial={{ opacity: 0, y: 15, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => {
                    setFabOpen(false);
                    setOverlayInitialMode("search");
                    setOverlayOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] shadow-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-all cursor-pointer font-black text-xs group"
                >
                  <span className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Search className="w-4 h-4" />
                  </span>
                  <span>חיפוש בהקלדה</span>
                </motion.button>

                {/* Favorites option button */}
                <motion.button
                  initial={{ opacity: 0, y: 15, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.8 }}
                  transition={{ duration: 0.15, delay: 0.05 }}
                  onClick={() => {
                    setFabOpen(false);
                    setOverlayInitialMode("favorites");
                    setOverlayOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] shadow-xl hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-all cursor-pointer font-black text-xs group"
                >
                  <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Star className="w-4 h-4 fill-amber-500" />
                  </span>
                  <span>מוצרים נפוצים</span>
                </motion.button>
              </>
            )}
          </AnimatePresence>

          {/* Main FAB Toggle */}
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setFabOpen((prev) => !prev)}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-xl shadow-indigo-600/30 flex items-center justify-center cursor-pointer border-none transition-all active:scale-95"
            aria-label="הוסף מוצר לרשימה"
            title="הוסף מוצר לרשימה"
          >
            <motion.div
              animate={{ rotate: fabOpen ? 45 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <Plus className="w-7 h-7 stroke-[2.5]" />
            </motion.div>
          </motion.button>
        </div>

        {/* Add Product Overlay */}
        <AddProductOverlay
          isOpen={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          initialMode={overlayInitialMode}
          pool={pool}
          categories={categories}
          requests={requests}
          onAddProduct={addProduct}
          onRequestNewProduct={requestNewProduct}
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
          onOpenCategories={() => setIsAddingCat(true)}
          onOpenStarManager={() => setShowManageStarModal(true)}
          onOpenAdminRequests={() => setShowAdminRequestsModal(true)}
          onExportProcurementList={exportProcurementList}
          onExportOngoingList={exportOngoingList}
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
            await addProduct(name, cat, priority, qty, notes, requestedByOverride);
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
            await addProduct(name, cat, priority, qty, notes);
          }}
          onExportList={async () => {
            if (listType === "large") {
              await exportProcurementList();
            } else {
              await exportOngoingList();
            }
          }}
          onRemoveItem={async (id) => {
            await deleteDoc(doc(db, "shopping_requests", id));
          }}
          onUpdateQuantity={async (id, newQty) => {
            await updateDoc(doc(db, "shopping_requests", id), { quantity: newQty });
          }}
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
              <span className="text-xs font-black leading-relaxed">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ConfirmDialog />
    </RoleGuard>
  );
}
