"use client";

import { useState, useEffect, useRef } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ConnectionStatusBanner } from "@/components/ui/ConnectionStatusBanner";
import { db } from "@/lib/firebase/config";
import {
  doc, updateDoc, deleteDoc, setDoc, collection, query, where, onSnapshot
} from "firebase/firestore";
import {
  Loader2, ShoppingBag, Trash2, AlertTriangle, X, Clock, Package,
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
import { DeleteArchiveDayModal } from "./components/DeleteArchiveDayModal";
import { useShoppingData } from "./hooks/useShoppingData";
import { useExport } from "./hooks/useExport";
import { useReceiptUpload } from "./hooks/useReceiptUpload";
import { useShoppingActions } from "./hooks/useShoppingActions";
import { useArchiveManagement } from "./hooks/useArchiveManagement";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { useConfirm } from "@/hooks/useConfirm";

export default function ShoppingPage() {
  const { user, role, isAdmin, isManager, isLogistics } = useAuth();

  const [view, setView] = useState<"list" | "archive">("list");
  const [listType, setListType] = useState<"supermarket" | "large">("supermarket");
  const [isEditingRecurring, setIsEditingRecurring] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Receipt Modal State
  const [receiptScanOpen, setReceiptScanOpen] = useState(false);

  // Add Bar State
  const [inputVal, setInputVal] = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "warning" } | null>(null);

  // Category State
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Only admin/logistics ever see the Archive tab or the full-archive export button
  // (the header tab and the menu's export/reset actions are both gated the same way),
  // so only their sessions need to keep the (unboundedly growing) archive streamed live.
  const {
    requests, pool, loading, setLoading, pendingRequestsCount, categories, setCategories,
    cutoffConfig, setCutoffConfig,
    activeRequests, sessionPurchased, archiveByDate, currentActiveItems, cutoffStatus, isListFrozen,
    refetchSettings,
  } = useShoppingData(user, isAdmin, listType, isAdmin || isLogistics);

  const { pullDistance, isRefreshing, handlers: pullToRefreshHandlers } = usePullToRefresh(refetchSettings);

  // Star Products State
  const [showManageStarModal, setShowManageStarModal] = useState(false);

  // Admin Product Requests Modal State
  const [showAdminRequestsModal, setShowAdminRequestsModal] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

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

  const {
    showArchivePrompt, setShowArchivePrompt,
    showResetArchiveModal, setShowResetArchiveModal,
    archivePassword, setArchivePassword,
    passwordError, setPasswordError,
    isClearingArchive,
    showDeleteArchiveDayModal, setShowDeleteArchiveDayModal,
    showCycleClosureModal, setShowCycleClosureModal,
    triggerClearArchiveModal, handleConfirmResetArchive, handleDeleteArchiveDay,
    verifyAdminPassword,
  } = useArchiveManagement(requests, showToast);

  const { confirm, ConfirmDialog } = useConfirm();

  const {
    requestNewProduct,
    addProduct, changeStatus, updateQuantity, moveToEquipment, moveToSupermarket, archiveCurrentSession,
    toggleRecurring, updateRecurringQuantity, importRecurringList, toggleStarProduct, updateItem,
    handleAddCategory, handleRenameCategory, handleDeleteCategory, handleSaveCutoffConfig,
  } = useShoppingActions(
    user, isAdmin, isLogistics, requests, pool, listType,
    categories, setCategories, setCutoffConfig, setLoading, setShowArchivePrompt, showToast, confirm
  );

  const { exportProcurementList, exportOngoingList, exportXlsx } = useExport(requests, pool, showToast);

  const { handleSaveReceipt } = useReceiptUpload(user, showToast);

  const canSeeArchive = isAdmin || isLogistics;
  const menuHasBadge =
    (canPurchase && pendingStoreAuthCount > 0) || (isAdmin && pendingRequestsCount > 0);

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <ConnectionStatusBanner />
      <div dir="rtl" className="flex flex-col h-[100dvh] bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans">
        <ShoppingHeader
          view={view}
          setView={setView}
          listType={listType}
          setListType={setListType}
          setActiveCategory={setActiveCategory}
          canSeeArchive={canSeeArchive}
          hasMenuBadge={menuHasBadge}
          onOpenMenu={() => setMenuOpen(true)}
          inputVal={inputVal}
          setInputVal={setInputVal}
          onFocusAdd={() => setOverlayOpen(true)}
          inputRef={inputRef}
        />

        {/* ── Weekly cutoff status ── */}
        {cutoffStatus.isEnabled && view === "list" && (
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
                        ? `הרשימה מוקפאת להזנות. קיימים ${currentActiveItems.length} מוצרים הממתינים לרכש וסגירה.`
                        : `הרשימה הוקפאה להזנות לקראת ביצוע רכש. הזנות חדשות יתאפשרו לאחר פתיחת סבב חדש.`}
                    </p>
                  </div>
                </div>
                {(isAdmin || isLogistics) && (
                  <button
                    onClick={() => setShowCycleClosureModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 !text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border-none shrink-0"
                  >
                    <Package className="w-4 h-4 text-white" />
                    <span>אכסן וסגור סבב</span>
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
            <div className="max-w-[700px] mx-auto pb-10">
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
              ) : view === "list" ? (
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
                  onShowArchivePrompt={() => setShowArchivePrompt(true)}
                />
              ) : (
                /* Archive View */
                <div className="p-4 space-y-5">
                  <div>
                    <h2 className="text-xl font-black text-[var(--foreground)]">ארכיון רכישות</h2>
                    <p className="text-xs text-[var(--muted)] font-semibold">היסטוריית קניות שנסגרו ונשמרו</p>
                  </div>

                  {Object.keys(archiveByDate).length === 0 ? (
                    <div className="py-20 text-center opacity-40">
                      <ShoppingBag className="w-12 h-12 mx-auto mb-2 text-[var(--muted)]" />
                      <p className="text-sm font-black">ארכיון הקניות ריק</p>
                    </div>
                  ) : (
                    Object.entries(archiveByDate)
                      .sort((a, b) => b[0].localeCompare(a[0]))
                      .map(([date, items]) => (
                        <div key={date} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                          <div className="px-4 py-3 bg-[var(--foreground)]/5 border-b border-[var(--border)] flex items-center justify-between">
                            <span className="text-sm font-bold text-[var(--foreground)]">{date}</span>
                            <span className="text-xs font-black opacity-40">{items.length} מוצרים</span>
                          </div>
                          <div className="divide-y divide-[var(--border)]">
                            {items.map((item) => (
                              <div key={item.id} className="px-4 py-2.5 flex items-center justify-between">
                                <span className="text-sm font-bold text-[var(--muted)]">{item.name}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--foreground)]/5 text-[var(--muted)]">
                                  {item.category}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Add Product Overlay */}
        <AddProductOverlay
          isOpen={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          pool={pool}
          categories={categories}
          requests={requests}
          inputVal={inputVal}
          setInputVal={setInputVal}
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
          onImportRecurringList={importRecurringList}
          onOpenRecurringEditor={() => setIsEditingRecurring(true)}
          onOpenCategories={() => setIsAddingCat(true)}
          onOpenStarManager={() => setShowManageStarModal(true)}
          onOpenReceiptScan={() => setReceiptScanOpen(true)}
          onOpenAdminRequests={() => setShowAdminRequestsModal(true)}
          onExportProcurementList={exportProcurementList}
          onExportOngoingList={exportOngoingList}
          onExportXlsx={exportXlsx}
          onDeleteArchiveDay={() => setShowDeleteArchiveDayModal(true)}
          onClearAllArchive={triggerClearArchiveModal}
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
          onExportAndArchive={async () => {
            if (listType === "large") {
              exportProcurementList();
            } else {
              exportOngoingList();
            }
            await archiveCurrentSession();
            showToast("סבב הקניות יוצא בהצלחה והועבר לארכיון!", "success");
          }}
          onArchiveOnly={async () => {
            await archiveCurrentSession();
            showToast("סבב הקניות הועבר לארכיון והרשימה נוקתה לסבב חדש!", "success");
          }}
          onRemoveItem={async (id) => {
            await deleteDoc(doc(db, "shopping_requests", id));
          }}
          onUpdateQuantity={async (id, newQty) => {
            await updateDoc(doc(db, "shopping_requests", id), { quantity: newQty });
          }}
        />

        {/* Settings sheets: categories/cutoff, recurring list, receipt scan, star products, archive prompt */}
        <ShoppingModals
          isAddingCat={isAddingCat}
          setIsAddingCat={setIsAddingCat}
          categories={categories}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          isEditingRecurring={isEditingRecurring}
          setIsEditingRecurring={setIsEditingRecurring}
          pool={pool}
          onToggleRecurring={toggleRecurring}
          onUpdateRecurringQuantity={updateRecurringQuantity}
          showArchivePrompt={showArchivePrompt}
          setShowArchivePrompt={setShowArchivePrompt}
          sessionPurchasedCount={sessionPurchased.length}
          hasRemainingActiveItems={activeRequests.length > 0}
          onArchiveCurrentSession={() => archiveCurrentSession(true)}
          isAdmin={isAdmin}
          isLogistics={isLogistics}
          receiptScanOpen={receiptScanOpen}
          setReceiptScanOpen={setReceiptScanOpen}
          currentUser={user}
          onSaveReceipt={handleSaveReceipt}
          showManageStarModal={showManageStarModal}
          setShowManageStarModal={setShowManageStarModal}
          onToggleStarProduct={toggleStarProduct}
          cutoffConfig={cutoffConfig}
          onSaveCutoffConfig={handleSaveCutoffConfig}
        />

        {/* Delete Single Archive Day Modal */}
        <DeleteArchiveDayModal
          isOpen={showDeleteArchiveDayModal}
          onClose={() => setShowDeleteArchiveDayModal(false)}
          archivedRequests={requests.filter((r) => r.status === "archived")}
          onDeleteDay={handleDeleteArchiveDay}
        />

        {/* Reset Archive Modal */}
        <AnimatePresence>
          {showResetArchiveModal && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowResetArchiveModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-md p-6 shadow-2xl flex flex-col text-right"
                dir="rtl"
              >
                <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
                  <h3 className="text-lg font-black text-rose-500 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                    <span>ניקוי ואיפוס ארכיון הקניות</span>
                  </h3>
                  <button
                    onClick={() => setShowResetArchiveModal(false)}
                    className="p-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-xs text-[var(--foreground)]/80 font-medium leading-relaxed mb-4">
                  פעולה זו תאפס ותמחוק לצמיתות את כל <strong>{requests.filter((r) => r.status === "archived").length}</strong> המוצרים שנשמרו בארכיון הקניות.
                  <br />
                  <span className="text-rose-500 font-bold">לא ניתן לשחזר פריטים שנמחקו לאחר המחיקה!</span>
                </p>

                <div className="mb-4">
                  <label className="text-xs font-bold text-[var(--foreground)] mb-1.5 block">
                    אנא הזן סיסמת מנהל לאישור:
                  </label>
                  <input
                    type="password"
                    value={archivePassword}
                    onChange={(e) => {
                      setArchivePassword(e.target.value);
                      setPasswordError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmResetArchive();
                    }}
                    placeholder="הזן סיסמת מנהל..."
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none text-center tracking-widest text-[var(--foreground)]"
                  />
                  {passwordError && (
                    <span className="text-xs text-rose-500 font-bold mt-1.5 block">{passwordError}</span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                  <button
                    onClick={() => setShowResetArchiveModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--foreground)]/5 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleConfirmResetArchive}
                    disabled={isClearingArchive}
                    className="px-4 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 !text-white transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 border-none"
                  >
                    {isClearingArchive ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-white" />
                    )}
                    <span>אפס ומחק ארכיון</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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
