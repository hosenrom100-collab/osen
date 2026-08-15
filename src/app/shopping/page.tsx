"use client";

import { useState, useEffect, useRef } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ConnectionStatusBanner } from "@/components/ui/ConnectionStatusBanner";
import { db } from "@/lib/firebase/config";
import {
  doc, updateDoc, deleteDoc, setDoc,
} from "firebase/firestore";
import { 
  ShoppingCart, Plus, Search, Loader2, ArrowRight, Download, 
  Settings, Boxes, Star, ShoppingBag, Edit3, Receipt, RotateCcw, Database,
  ChevronDown, FileText, FileSpreadsheet, Trash2, AlertTriangle, X, Clock, AlertCircle, PackageCheck, Package
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

import { ShoppingRequest } from "./types";
import { CycleClosureModal } from "./components/CycleClosureModal";
import { InventoryView } from "./components/InventoryView";
import { ShoppingListView } from "./components/ShoppingListView";
import { AddProductOverlay } from "./components/AddProductOverlay";
import { ShoppingModals } from "./components/ShoppingModals";
import { AdminProductRequestsModal } from "./components/AdminProductRequestsModal";
import { DeleteArchiveDayModal } from "./components/DeleteArchiveDayModal";
import { SmartReorderModal } from "./components/SmartReorderModal";
import { useShoppingData } from "./hooks/useShoppingData";
import { useExport } from "./hooks/useExport";
import { useReceiptUpload } from "./hooks/useReceiptUpload";
import { useInventoryActions } from "./hooks/useInventoryActions";
import { useShoppingActions } from "./hooks/useShoppingActions";
import { useArchiveManagement } from "./hooks/useArchiveManagement";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { useConfirm } from "@/hooks/useConfirm";

export default function ShoppingPage() {
  const { user, role, isAdmin, isManager, isLogistics } = useAuth();
  const router = useRouter();

  const [view, setView] = useState<"list" | "archive" | "inventory">("list");
  const [listType, setListType] = useState<"supermarket" | "large">("supermarket");
  const [isEditingRecurring, setIsEditingRecurring] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

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

  const {
    requests, pool, loading, setLoading, pendingRequestsCount, inventoryMap, categories, setCategories,
    cutoffConfig, setCutoffConfig,
    activeRequests, sessionPurchased, archiveByDate, currentActiveItems, cutoffStatus, isListFrozen,
    refetchSettings,
  } = useShoppingData(user, isAdmin, listType);

  const { pullDistance, isRefreshing, handlers: pullToRefreshHandlers } = usePullToRefresh(refetchSettings);

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

  // Inventory Stock Updates with Firestore & Logging
  const {
    editingInvItem, setEditingInvItem,
    showManageTrackModal, setShowManageTrackModal,
    showSmartReorderModal, setShowSmartReorderModal,
    smartReorderItems,
    updateInventoryStock, batchUpdateStock,
    openSmartReorderReview, confirmSmartReorder,
    toggleTrackInventory, toggleStarProduct, saveInventorySettings,
  } = useInventoryActions(user, pool, requests, inventoryMap, showToast);

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

  // User request a new product to be added to the pool by admin
  const {
    requestNewProduct,
    addProduct, changeStatus, updateQuantity, moveToEquipment, moveToSupermarket, archiveCurrentSession,
    toggleRecurring, updateRecurringQuantity, importRecurringList,
    handleAddCategory, handleRenameCategory, handleDeleteCategory, handleSaveCutoffConfig,
  } = useShoppingActions(
    user, isAdmin, isLogistics, requests, pool, inventoryMap, listType,
    categories, setCategories, setCutoffConfig, setLoading, setShowArchivePrompt, showToast, confirm
  );

  const { exportProcurementList, exportOngoingList, exportXlsx } = useExport(requests, pool, showToast);

  const { handleSaveReceipt } = useReceiptUpload(user, showToast);

  const clearAllArchive = triggerClearArchiveModal;


  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <ConnectionStatusBanner />
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

        {/* ── Top Status Banner (Weekly Cutoff & Freeze Notice) ── */}
        {cutoffStatus.isEnabled && (
          <div className="px-4 md:px-8 pt-3 shrink-0 z-10">
            {isListFrozen ? (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border border-amber-500/30 flex items-center justify-between flex-wrap gap-3 shadow-sm text-right" dir="rtl">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-lg shrink-0">
                    🔒
                  </span>
                  <div>
                    <h4 className="text-xs font-black text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                      <span>מועד הקציבה השבועי חלף ({cutoffStatus.formattedTarget})</span>
                    </h4>
                    <p className="text-[11px] font-bold text-[var(--foreground)]/80 mt-0.5">
                      {isAdmin || isLogistics
                        ? `הרשימה מוקפאת להזנות. קיימים ${currentActiveItems.length} מוצרים ב-${listType === "large" ? "ציוד ורכש" : "קניות סופר"} הממתינים לביצוע רכש וסגירה.`
                        : `הרשימה הוקפאה להזנות לקראת ביצוע רכש. הזנות חדשות יתאפשרו מחדש לאחר פתיחת סבב חדש.`}
                    </p>
                  </div>
                </div>

                {(isAdmin || isLogistics) && (
                  <button
                    onClick={() => setShowCycleClosureModal(true)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 !text-white text-xs font-black transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95 border-none shrink-0"
                  >
                    <Package className="w-4 h-4 text-white" />
                    <span>אכסן וסגור סבב קניות</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300 text-right" dir="rtl">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500 animate-pulse" />
                  <span>מועד סגירת הזנות לשבוע זה ({listType === "large" ? "ציוד ורכש" : "קניות סופר"}): <strong>{cutoffStatus.formattedTarget}</strong></span>
                </div>
                <span className="text-[11px] font-black bg-indigo-500/20 px-2.5 py-0.5 rounded-full text-indigo-800 dark:text-indigo-200">
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
                  onSmartReorder={openSmartReorderReview}
                  onOpenManageTrackModal={() => setShowManageTrackModal(true)}
                  onOpenCategoryModal={() => setIsAddingCat(true)}
                  onOpenSettingsModal={setEditingInvItem}
                  onToggleTrackInventory={toggleTrackInventory}
                />
              ) : (
                /* Archive View */
                <div className="p-4 space-y-6">
                  <div className="flex items-center justify-between px-2 flex-wrap gap-3">
                    <div>
                      <h2 className="text-2xl font-black text-[var(--foreground)]">ארכיון רכישות</h2>
                      <p className="text-xs text-[var(--muted)] font-semibold">היסטוריית קניות שנסגרו ונשמרו</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <button
                          onClick={exportXlsx}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                          <span>יצוא Excel</span>
                        </button>
                      )}
                      {(isAdmin || isLogistics) && (
                        <button
                          onClick={() => {
                            setArchivePassword("");
                            setPasswordError("");
                            setShowResetArchiveModal(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border-none"
                        >
                          <Trash2 className="w-4 h-4 text-rose-500" />
                          <span>איפוס וניקוי ארכיון</span>
                        </button>
                      )}
                    </div>
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
                      ))
                  )}
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
          isLogistics={isLogistics}
          isFrozen={isListFrozen}
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

        <SmartReorderModal
          isOpen={showSmartReorderModal}
          onClose={() => setShowSmartReorderModal(false)}
          items={smartReorderItems}
          onConfirm={confirmSmartReorder}
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
          hasRemainingActiveItems={activeRequests.length > 0}
          onArchiveCurrentSession={() => archiveCurrentSession(true)}
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
          onClearAllArchive={triggerClearArchiveModal}
          onDeleteArchiveDay={() => setShowDeleteArchiveDayModal(true)}
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