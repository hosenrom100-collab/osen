"use client";

import { useEffect, useState } from "react";
import { ShoppingRequest, TargetFramework } from "../types";
import { Flame, Trash2, Minus, Plus, ArrowRightLeft, User, ChevronDown } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { TARGET_FRAMEWORKS } from "../lib/constants";
import { MEASUREMENT_UNITS } from "../lib/constants";
import { parseQuantity, buildQuantityString, getQuantityStep, getMinQuantity, steppedQuantity, getQuickQtyChips } from "../lib/quantityUtils";

interface ItemDetailSheetProps {
  item: ShoppingRequest | null;
  onClose: () => void;
  categories?: string[];
  onUpdateItem: (id: string, name: string, category: string, quantity: string, notes: string, priority: "low" | "normal" | "urgent", targetFramework?: TargetFramework) => void;
  onDelete: (id: string) => void;
  onMoveToEquipment: (id: string) => void;
  onMoveToSupermarket: (id: string) => void;
}

/**
 * Everything about one item lives here — quantity, unit, urgency, notes, category,
 * moving between lists, deleting. The row itself (ItemRow) stays a single line;
 * tapping it opens this sheet instead of spreading a button row across every card.
 */
export function ItemDetailSheet({
  item,
  onClose,
  categories,
  onUpdateItem,
  onDelete,
  onMoveToEquipment,
  onMoveToSupermarket,
}: ItemDetailSheetProps) {
  const [name, setName] = useState("");
  const [qtyValue, setQtyValue] = useState(1);
  const [qtyUnit, setQtyUnit] = useState("יחידות");
  const [notes, setNotes] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<TargetFramework>("main");

  useEffect(() => {
    if (!item) return;
    const { value, unit } = parseQuantity(item.quantity);
    setName(item.name);
    setQtyValue(value);
    setQtyUnit(unit);
    setNotes(item.notes || "");
    setIsUrgent(item.priority === "urgent");
    setSelectedFramework(item.targetFramework || "main");
  }, [item]);

  if (!item) return null;

  const step = getQuantityStep(qtyUnit);
  const min = getMinQuantity(qtyUnit);
  const currentFwMeta = TARGET_FRAMEWORKS.find((f) => f.id === selectedFramework) || TARGET_FRAMEWORKS[0];

  const handleUnitChange = (newUnit: string) => {
    setQtyUnit(newUnit);
    if ((newUnit === "גרם" || newUnit === "מ״ל") && qtyValue < 50) {
      setQtyValue(200);
    } else if ((newUnit === "יחידות" || newUnit === "ק״ג" || newUnit === "ליטר" || newUnit === "אריזות" || newUnit === "קופסאות" || newUnit === "בקבוקים") && qtyValue >= 50) {
      setQtyValue(1);
    }
  };

  const handleSave = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    onUpdateItem(
      item.id,
      cleanName,
      item.category,
      buildQuantityString(qtyValue, qtyUnit),
      notes.trim(),
      isUrgent ? "urgent" : "normal",
      selectedFramework
    );
    onClose();
  };

  // No confirmation dialog on purpose — delete is soft (status: "deleted") and the
  // parent list shows an undo snackbar right after, which is faster to act on than a
  // dialog and just as safe to reverse.
  const handleDelete = () => {
    onDelete(item.id);
    onClose();
  };

  return (
      <BottomSheet
        isOpen={!!item}
        onClose={onClose}
        title={item ? item.name : "פרטי המוצר"}
        zIndex={110}
        footer={
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 h-12 bg-[var(--fill-strong)] hover:bg-[var(--fill-strong)] text-[var(--foreground)] text-[15px] font-semibold rounded-xl transition-all cursor-pointer border-none"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="flex-1 h-12 bg-[var(--accent)] hover:brightness-110 !text-white text-[15px] font-bold rounded-xl transition-all active:scale-[0.98] cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
            >
              שמור שינויים
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Assigned metadata indicator (Clickable Framework + Category + Requester) */}
          <div className="p-3.5 rounded-2xl bg-[var(--fill)] border border-[var(--border)] space-y-2.5 text-[13px]">
            {/* Row 1: Framework selector & Category */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Clickable Framework Selector */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[var(--muted)] font-bold shrink-0">מסגרת:</span>
                <div className="relative inline-flex items-center">
                  <select
                    value={selectedFramework}
                    onChange={(e) => setSelectedFramework(e.target.value as TargetFramework)}
                    className={`appearance-none text-xs font-bold py-1 pr-6 pl-2.5 rounded-xl border transition-all cursor-pointer outline-none ${currentFwMeta.color} bg-opacity-20 hover:bg-opacity-30`}
                    title="לחץ לבחירת מסגרת מזמינה"
                  >
                    {TARGET_FRAMEWORKS.map((fw) => (
                      <option key={fw.id} value={fw.id} className="bg-[var(--surface)] text-[var(--foreground)] font-bold">
                        {fw.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                </div>
              </div>

              {/* Category */}
              {item.category && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[var(--muted)] font-bold">קטגוריה:</span>
                  <span className="font-bold text-[var(--foreground)] bg-[var(--fill)] px-2 py-0.5 rounded-lg">
                    {item.category}
                  </span>
                </div>
              )}
            </div>

            {/* Row 2: Requester Employee info */}
            {item.requestedByName && (
              <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--border)]/60 text-xs text-[var(--muted)]">
                <User className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                <span>הוזמן ע״י:</span>
                <strong className="font-bold text-[var(--foreground)]">{item.requestedByName}</strong>
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-bold text-[var(--muted)] mb-1.5 block">
              שם המוצר
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-base font-bold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs font-bold text-[var(--muted)] mb-1.5 block">
              כמות
            </label>

            {/* Quick quantity chips according to active unit */}
            <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar">
              {getQuickQtyChips(qtyUnit).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQtyValue(q)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                    qtyValue === q
                      ? "bg-[var(--accent)] !text-white border-transparent"
                      : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--fill)]"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setQtyValue((v) => steppedQuantity(v, step, -1, min))}
                className="w-11 h-11 rounded-xl bg-[var(--fill)] hover:bg-[var(--fill-strong)] border border-[var(--border)] flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
              >
                <Minus className="w-4 h-4 stroke-[3] text-[var(--foreground)]" />
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={qtyValue}
                onChange={(e) => {
                  const v = parseFloat(e.target.value.replace(",", "."));
                  setQtyValue(Number.isNaN(v) ? 0 : v);
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 text-center bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 text-lg font-bold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]"
              />
              <button
                onClick={() => setQtyValue((v) => steppedQuantity(v, step, 1))}
                className="w-11 h-11 rounded-xl bg-[var(--accent)] hover:brightness-110 flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[3] text-white" />
              </button>
              <select
                value={qtyUnit}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-2 text-sm font-bold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)] shrink-0"
              >
                {MEASUREMENT_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-[var(--muted)] mb-1.5 block">
              הערה
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="סוג ספציפי, מותג, או תחליף מועדף..."
              rows={2}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:border-[var(--accent)] resize-none placeholder:text-[var(--muted)]/40 text-[var(--foreground)]"
            />
          </div>

          {/* Three secondary actions in one row: urgency (a toggle, saved with "שמור"), move to the other
              list, and delete. Move and delete act immediately; delete is soft and offers undo. */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setIsUrgent((v) => !v)}
              aria-pressed={isUrgent}
              className={`h-11 px-2 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-semibold border transition-colors cursor-pointer ${
                isUrgent
                  ? "bg-rose-600 !text-white border-transparent"
                  : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--fill)]"
              }`}
            >
              <Flame className={`w-4 h-4 shrink-0 ${isUrgent ? "" : "text-rose-500"}`} />
              <span>דחוף</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (item.listType === "large") onMoveToSupermarket(item.id);
                else onMoveToEquipment(item.id);
                onClose();
              }}
              className="h-11 px-2 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-semibold border bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--fill)] transition-colors cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4 shrink-0 text-[var(--accent-text)]" />
              <span className="truncate">{item.listType === "large" ? "לסופר" : "לציוד ורכש"}</span>
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="h-11 px-2 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-semibold border bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>מחק</span>
            </button>
          </div>
        </div>
      </BottomSheet>
  );
}
