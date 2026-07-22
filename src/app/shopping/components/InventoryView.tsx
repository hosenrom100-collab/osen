"use client";

import { useState, useEffect } from "react";
import { Product, InventoryItem, InventoryLogEntry, ShoppingRequest } from "../types";
import { 
  Boxes, Plus, Minus, Settings, X, Search, ShoppingCart, 
  RotateCcw, History, AlertTriangle, Check, Layers, Sparkles, Filter, ListChecks 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getProductInventoryLogs } from "../lib/inventory-logger";

const CAT_COLOR: Record<string, string> = {
  "גבינות ומחלבה":       "text-amber-500 bg-amber-500/10 border-amber-500/20",
  "בשר ודגים":            "text-rose-500 bg-rose-500/10 border-rose-500/20",
  "פירות וירקות":         "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  "לחם ומאפים":           "text-orange-500 bg-orange-500/10 border-orange-500/20",
  "חומרי ניקוי":          "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
  "מוצרי נייר וחד פעמי": "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
  "טואלטיקה והיגיינה":   "text-teal-500 bg-teal-500/10 border-teal-500/20",
  "שימורים ובישול":       "text-slate-500 bg-slate-500/10 border-slate-500/20",
  "קפואים":               "text-sky-500 bg-sky-500/10 border-sky-500/20",
  "כללי":                 "text-slate-400 bg-slate-400/10 border-slate-400/20",
};

interface InventoryViewProps {
  pool: Product[];
  inventoryMap: Record<string, InventoryItem>;
  categories: string[];
  activeRequests: ShoppingRequest[];
  activeCategory: string | null;
  setActiveCategory: (cat: string | null) => void;
  onUpdateStock: (productId: string, name: string, category: string, currentVal: number, delta: number, unit?: string, minStock?: number, reason?: "manual" | "count") => void;
  onBatchUpdateStock: (updates: { productId: string; name: string; category: string; newStock: number; unit: string; minStock: number }[]) => void;
  onAddToShoppingList: (name: string, category: string, unit?: string) => void;
  onSmartReorder: () => void;
  onOpenManageTrackModal: () => void;
  onOpenCategoryModal: () => void;
  onOpenSettingsModal: (item: { productId: string; name: string; minStock: number; unit: string }) => void;
  onToggleTrackInventory: (productId: string, currentTrack?: boolean) => void;
}

export function InventoryView({
  pool,
  inventoryMap,
  categories,
  activeRequests,
  activeCategory,
  setActiveCategory,
  onUpdateStock,
  onBatchUpdateStock,
  onAddToShoppingList,
  onSmartReorder,
  onOpenManageTrackModal,
  onOpenCategoryModal,
  onOpenSettingsModal,
  onToggleTrackInventory,
}: InventoryViewProps) {
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "out" | "low" | "ok">("all");
  const [inventorySearch, setInventorySearch] = useState("");
  
  // Batch Stock Count Mode State
  const [batchCountMode, setBatchCountMode] = useState(false);
  const [batchCategoryFilter, setBatchCategoryFilter] = useState<string>("all");
  const [batchDraft, setBatchDraft] = useState<Record<string, number>>({});

  // History Log Modal State
  const [historyModalItem, setHistoryModalItem] = useState<{ productId: string; name: string } | null>(null);
  const [historyLogs, setHistoryLogs] = useState<InventoryLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const trackedProducts = pool.filter((p) => p.trackInventory === true);

  // Initialize batch count draft
  const startBatchCount = () => {
    const draft: Record<string, number> = {};
    trackedProducts.forEach((p) => {
      draft[p.id] = inventoryMap[p.id]?.currentStock ?? 0;
    });
    setBatchDraft(draft);
    setBatchCountMode(true);
  };

  const handleSaveBatchCount = () => {
    const updates = trackedProducts.map((p) => {
      const inv = inventoryMap[p.id];
      return {
        productId: p.id,
        name: p.name,
        category: p.category,
        newStock: batchDraft[p.id] ?? (inv?.currentStock ?? 0),
        unit: inv?.unit ?? "יחידות",
        minStock: inv?.minStock ?? 1,
      };
    });
    onBatchUpdateStock(updates);
    setBatchCountMode(false);
  };

  const openLogHistory = async (productId: string, name: string) => {
    setHistoryModalItem({ productId, name });
    setLoadingLogs(true);
    const logs = await getProductInventoryLogs(productId, 15);
    setHistoryLogs(logs);
    setLoadingLogs(false);
  };

  // Helper check if item is in active shopping requests
  const getItemOpenRequestQty = (productName: string): string | null => {
    if (!productName) return null;
    const norm = productName.trim().toLowerCase();
    const req = activeRequests.find((r) => (r.name || "").trim().toLowerCase() === norm);
    return req ? req.quantity || "1" : null;
  };

  const lowOrOutProducts = trackedProducts.filter((p) => {
    const s = inventoryMap[p.id]?.currentStock ?? 0;
    const m = inventoryMap[p.id]?.minStock ?? 1;
    return s <= m;
  });

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[950px] mx-auto" dir="rtl">
      {/* ── Inventory Header & Stats Summary ── */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2 text-[var(--foreground)]">
              <Boxes className="w-6 h-6 text-indigo-500" />
              <span>ניהול מלאי מחסן ומוצרים</span>
            </h2>
            <p className="text-xs text-[var(--muted)] font-bold mt-1">
              מעקב בזמן אמת, ספירת מלאי מרוכזת ועדכון אוטומטי מרכישות
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Smart Reorder Button */}
            {lowOrOutProducts.length > 0 && (
              <button
                onClick={onSmartReorder}
                className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
                title="הוסף לרשימת קניות את כל המוצרים שמלאי שלהם נמוך או אזל"
              >
                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                <span>הוסף חסרים לקניות ({lowOrOutProducts.length})</span>
              </button>
            )}

            {/* Batch Count Mode Toggle */}
            <button
              onClick={() => (batchCountMode ? setBatchCountMode(false) : startBatchCount())}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 ${
                batchCountMode
                  ? "bg-slate-700 text-white"
                  : "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
              }`}
            >
              <ListChecks className="w-4 h-4" />
              <span>{batchCountMode ? "יציאה מספירה" : "מצב ספירת מלאי"}</span>
            </button>

            <button
              onClick={onOpenManageTrackModal}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>בחירת מוצרים למלאי</span>
            </button>

            <button
              onClick={onOpenCategoryModal}
              className="px-3 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>קטגוריות</span>
            </button>
          </div>
        </div>

        {/* Stats Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => setInventoryFilter("all")}
            className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
              inventoryFilter === "all"
                ? "bg-indigo-500/10 border-indigo-500/40 ring-2 ring-indigo-500/20"
                : "bg-[var(--foreground)]/[0.02] border-[var(--border)] hover:bg-[var(--foreground)]/5"
            }`}
          >
            <span className="text-[10px] font-black text-[var(--muted)] block">במעקב מלאי</span>
            <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
              {trackedProducts.length}
            </span>
          </button>

          <button
            onClick={() => setInventoryFilter("out")}
            className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
              inventoryFilter === "out"
                ? "bg-rose-500/10 border-rose-500/40 ring-2 ring-rose-500/20"
                : "bg-[var(--foreground)]/[0.02] border-[var(--border)] hover:bg-[var(--foreground)]/5"
            }`}
          >
            <span className="text-[10px] font-black text-rose-500 block flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping" />
              אזל במלאי
            </span>
            <span className="text-xl font-black text-rose-600 dark:text-rose-400">
              {trackedProducts.filter((p) => (inventoryMap[p.id]?.currentStock ?? 0) === 0).length}
            </span>
          </button>

          <button
            onClick={() => setInventoryFilter("low")}
            className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
              inventoryFilter === "low"
                ? "bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500/20"
                : "bg-[var(--foreground)]/[0.02] border-[var(--border)] hover:bg-[var(--foreground)]/5"
            }`}
          >
            <span className="text-[10px] font-black text-amber-500 block">מלאי נמוך</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400">
              {
                trackedProducts.filter((p) => {
                  const s = inventoryMap[p.id]?.currentStock ?? 0;
                  const m = inventoryMap[p.id]?.minStock ?? 1;
                  return s > 0 && s <= m;
                }).length
              }
            </span>
          </button>

          <button
            onClick={() => setInventoryFilter("ok")}
            className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
              inventoryFilter === "ok"
                ? "bg-emerald-500/10 border-emerald-500/40 ring-2 ring-emerald-500/20"
                : "bg-[var(--foreground)]/[0.02] border-[var(--border)] hover:bg-[var(--foreground)]/5"
            }`}
          >
            <span className="text-[10px] font-black text-emerald-500 block">תקין</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              {
                trackedProducts.filter((p) => {
                  const s = inventoryMap[p.id]?.currentStock ?? 0;
                  const m = inventoryMap[p.id]?.minStock ?? 1;
                  return s > m;
                }).length
              }
            </span>
          </button>
        </div>

        {/* Search & Category Filter Controls */}
        <div className="flex items-center gap-2 pt-2">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none" />
            <input
              type="text"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder="חפש מוצר במלאי..."
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2 pr-10 pl-9 text-xs font-bold focus:outline-none focus:border-indigo-500 text-[var(--foreground)]"
            />
            {inventorySearch && (
              <button
                type="button"
                onClick={() => setInventorySearch("")}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none flex items-center justify-center"
                title="נקה חיפוש"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={activeCategory || ""}
            onChange={(e) => setActiveCategory(e.target.value || null)}
            className="h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-xs font-bold text-[var(--foreground)] focus:outline-none"
          >
            <option value="">כל הקטגוריות</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── BATCH STOCK COUNT MODE ── */}
      {batchCountMode ? (
        <div className="bg-[var(--surface)] border-2 border-indigo-500/40 rounded-[2rem] p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-indigo-500" />
              <h3 className="text-base font-black">ספירת מלאי מרוכזת</h3>
            </div>
            
            {/* Category Filter for Batch Count */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted)] font-bold">סינון לפי קטגוריה:</span>
              <select
                value={batchCategoryFilter}
                onChange={(e) => setBatchCategoryFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-bold"
              >
                <option value="all">כל הקטגוריות</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-[var(--border)]/60 max-h-[55vh] overflow-y-auto pr-1 space-y-1">
            {trackedProducts
              .filter((p) => batchCategoryFilter === "all" || p.category === batchCategoryFilter)
              .map((p) => {
                const inv = inventoryMap[p.id];
                const unit = inv?.unit ?? "יחידות";
                const currentDraftVal = batchDraft[p.id] ?? (inv?.currentStock ?? 0);

                return (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 px-2">
                    <div className="flex flex-col items-start">
                      <span className="text-xs font-bold text-[var(--foreground)]">{p.name}</span>
                      <span className="text-[10px] text-[var(--muted)]">{p.category}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-[var(--background)] border border-[var(--border)] rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() =>
                            setBatchDraft((prev) => ({
                              ...prev,
                              [p.id]: Math.max(0, (prev[p.id] ?? 0) - 1),
                            }))
                          }
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] transition-all cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={currentDraftVal}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setBatchDraft((prev) => ({
                              ...prev,
                              [p.id]: isNaN(val) ? 0 : Math.max(0, val),
                            }));
                          }}
                          className="w-14 text-center text-xs font-black bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setBatchDraft((prev) => ({
                              ...prev,
                              [p.id]: (prev[p.id] ?? 0) + 1,
                            }))
                          }
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[10px] text-[var(--muted)] font-bold min-w-[35px]">{unit}</span>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
            <button
              onClick={handleSaveBatchCount}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-indigo-600/20 active:scale-95"
            >
              שמור ספירת מלאי מרוכזת
            </button>
            <button
              onClick={() => setBatchCountMode(false)}
              className="py-3 px-5 bg-[var(--foreground)]/5 text-[var(--muted)] rounded-xl text-xs font-black transition-all cursor-pointer"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : (
        /* ── INVENTORY PRODUCT CARDS GRID ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {trackedProducts
            .filter((p) => {
              if (activeCategory && p.category !== activeCategory) return false;
              if (inventorySearch.trim()) {
                const q = inventorySearch.trim().toLowerCase();
                if (!p.name.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) return false;
              }
              const inv = inventoryMap[p.id];
              const stock = inv?.currentStock ?? 0;
              const minStock = inv?.minStock ?? 1;
              if (inventoryFilter === "out") return stock === 0;
              if (inventoryFilter === "low") return stock > 0 && stock <= minStock;
              if (inventoryFilter === "ok") return stock > minStock;
              return true;
            })
            .map((p) => {
              const inv = inventoryMap[p.id];
              const stock = inv?.currentStock ?? 0;
              const minStock = inv?.minStock ?? 1;
              const unit = inv?.unit ?? "יחידות";
              const isOut = stock === 0;
              const isLow = stock > 0 && stock <= minStock;

              // Progress percentage relative to threshold (max 100%, calculated as stock / (minStock * 2))
              const maxScale = Math.max(minStock * 2.5, 10);
              const progressPercent = Math.min(100, Math.round((stock / maxScale) * 100));

              const openReqQty = getItemOpenRequestQty(p.name);

              const statusBg = isOut
                ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                : isLow
                ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";

              const statusDot = isOut ? "bg-rose-500 animate-ping" : isLow ? "bg-amber-500" : "bg-emerald-500";
              const statusText = isOut ? "אזל במלאי" : isLow ? "מלאי נמוך" : "תקין במלאי";

              return (
                <div
                  key={p.id}
                  className={`bg-[var(--surface)] border rounded-2xl p-4 shadow-sm transition-all flex flex-col justify-between gap-3 relative overflow-hidden ${
                    isOut ? "border-rose-500/40 ring-1 ring-rose-500/20" : "border-[var(--border)]"
                  }`}
                >
                  {/* Visual Stock Progress Bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--foreground)]/5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isOut ? "bg-rose-500" : isLow ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="text-sm font-black text-[var(--foreground)] leading-snug">{p.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusBg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                          {statusText}
                        </span>

                        {/* Inventory Log History Trigger */}
                        <button
                          onClick={() => openLogHistory(p.id, p.name)}
                          className="p-1.5 rounded-lg hover:bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-indigo-500 transition-all cursor-pointer"
                          title="היסטוריית שינויי מלאי"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() =>
                            onOpenSettingsModal({ productId: p.id, name: p.name, minStock, unit })
                          }
                          className="p-1.5 rounded-lg hover:bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-[var(--foreground)] transition-all cursor-pointer"
                          title="הגדרות סף יחידות"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onToggleTrackInventory(p.id, p.trackInventory)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--muted)] hover:text-rose-500 transition-all cursor-pointer"
                          title="הסר מניהול מלאי"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${CAT_COLOR[p.category] || CAT_COLOR["כללי"]}`}>
                        {p.category}
                      </span>
                      <span className="text-[10px] text-[var(--muted)] font-bold">
                        סף מינימום: {minStock} {unit}
                      </span>

                      {/* Open Order Indicator Badge */}
                      {openReqQty && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                          <ShoppingCart className="w-3 h-3 text-indigo-500" />
                          <span>ברשימה: {openReqQty}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stepper + Quick Add Button */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]/60">
                    <div className="flex items-center gap-1 bg-[var(--foreground)]/[0.04] border border-[var(--border)] rounded-xl p-1 shadow-inner">
                      <button
                        onClick={() => onUpdateStock(p.id, p.name, p.category, stock, -1, unit, minStock, "manual")}
                        disabled={stock <= 0}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] disabled:opacity-30 disabled:hover:bg-transparent transition-all border border-[var(--border)] cursor-pointer active:scale-95"
                      >
                        <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                      <div className="px-2 text-center min-w-[50px]">
                        <span className="text-sm font-black block leading-none">{stock}</span>
                        <span className="text-[9px] font-bold text-[var(--muted)] block">{unit}</span>
                      </div>
                      <button
                        onClick={() => onUpdateStock(p.id, p.name, p.category, stock, 1, unit, minStock, "manual")}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] transition-all border border-[var(--border)] cursor-pointer active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    </div>

                    <button
                      onClick={() => onAddToShoppingList(p.name, p.category, unit)}
                      className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 ${
                        isOut || isLow
                          ? "bg-indigo-600 hover:bg-indigo-500 !text-white"
                          : "bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)] border border-[var(--border)]"
                      }`}
                      title="הוסף מוצר זה לרשימת הקניות"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>הוסף לקניות</span>
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Empty State Fallback */}
      {trackedProducts.length === 0 && (
        <div className="py-16 text-center space-y-3 bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-8">
          <Boxes className="w-12 h-12 mx-auto text-indigo-500/50" />
          <p className="text-base font-black">אין מוצרים במעקב מלאי כרגע</p>
          <p className="text-xs text-[var(--muted)] font-bold max-w-sm mx-auto">
            תוכל לבחור אילו מוצרים מהמאגר ברצונך לנהל לגביהם מלאי קבוע.
          </p>
          <button
            onClick={onOpenManageTrackModal}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>בחירת מוצרים למעקב מלאי</span>
          </button>
        </div>
      )}

      {/* ── INVENTORY LOG HISTORY MODAL ── */}
      <AnimatePresence>
        {historyModalItem && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryModalItem(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-md p-6 shadow-2xl text-right flex flex-col max-h-[85vh]"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3 shrink-0">
                <h3 className="text-base font-black flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-500" />
                  <span>היסטוריית מלאי: {historyModalItem.name}</span>
                </h3>
                <button
                  onClick={() => setHistoryModalItem(null)}
                  className="p-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar min-h-[200px]">
                {loadingLogs ? (
                  <div className="py-12 text-center text-xs font-bold text-[var(--muted)]">טוען יומן שינויים...</div>
                ) : historyLogs.length === 0 ? (
                  <div className="py-12 text-center text-xs font-bold text-[var(--muted)]">אין עדיין יומן שינויים למוצר זה</div>
                ) : (
                  historyLogs.map((log) => {
                    const dateStr = log.timestamp?.toDate
                      ? log.timestamp.toDate().toLocaleString("he-IL")
                      : new Date(log.timestamp).toLocaleString("he-IL");

                    const isPositive = log.delta > 0;

                    return (
                      <div
                        key={log.id}
                        className="p-3 bg-[var(--background)] border border-[var(--border)] rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-black px-1.5 py-0.5 rounded-md ${
                                isPositive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-500"
                              }`}
                            >
                              {isPositive ? `+${log.delta}` : log.delta}
                            </span>
                            <span className="font-bold text-[var(--foreground)]">
                              {log.previousStock} ← {log.newStock}
                            </span>
                          </div>
                          <span className="text-[10px] text-[var(--muted)] block mt-1">
                            {log.updatedByName || "משתמש"} • {dateStr}
                          </span>
                        </div>

                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[var(--foreground)]/5 text-[var(--muted)]">
                          {log.reason === "purchased"
                            ? "רכישה 🛍️"
                            : log.reason === "count"
                            ? "ספירה 📋"
                            : log.reason === "reorder"
                            ? "הזמנה 🛒"
                            : "ידני ✏️"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <button
                onClick={() => setHistoryModalItem(null)}
                className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                סגור
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
