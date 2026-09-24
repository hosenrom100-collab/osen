"use client";

import { useEffect, useState } from "react";
import { ShoppingRequest, TargetFramework } from "../types";
import { Flame, Trash2, Minus, Plus, ArrowRightLeft, Package, ShoppingCart } from "lucide-react";
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

  useEffect(() => {
    if (!item) return;
    const { value, unit } = parseQuantity(item.quantity);
    setName(item.name);
    setQtyValue(value);
    setQtyUnit(unit);
    setNotes(item.notes || "");
    setIsUrgent(item.priority === "urgent");
  }, [item]);

  if (!item) return null;

  const step = getQuantityStep(qtyUnit);
  const min = getMinQuantity(qtyUnit);
  const fwMeta = TARGET_FRAMEWORKS.find((f) => f.id === (item.targetFramework || "main")) || TARGET_FRAMEWORKS[0];

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
      item.targetFramework || "main"
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
        title="פרטי המוצר"
        zIndex={110}
        footer={
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--muted)] text-sm font-black rounded-2xl transition-all cursor-pointer border-none"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-md transition-all active:scale-[0.98] cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
            >
              שמור שינויים
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Assigned metadata indicator (Framework + Category - Read-only) */}
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--border)] text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--muted)] font-bold">מסגרת:</span>
              <span className={`w-2 h-2 rounded-full ${fwMeta.badgeActive.split(" ")[0] || "bg-indigo-500"}`} />
              <span className="font-black text-[var(--foreground)]">{fwMeta.name}</span>
            </div>
            {item.category && (
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--muted)] font-bold">קטגוריה:</span>
                <span className="font-black text-[var(--foreground)]">{item.category}</span>
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
              שם המוצר
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-base font-bold focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
              כמות
            </label>

            {/* Quick quantity chips according to active unit */}
            <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar">
              {getQuickQtyChips(qtyUnit).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQtyValue(q)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all cursor-pointer shrink-0 ${
                    qtyValue === q
                      ? "bg-indigo-600 !text-white border-transparent"
                      : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setQtyValue((v) => steppedQuantity(v, step, -1, min))}
                className="w-11 h-11 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
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
                className="flex-1 min-w-0 text-center bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 text-lg font-black focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
              />
              <button
                onClick={() => setQtyValue((v) => steppedQuantity(v, step, 1))}
                className="w-11 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[3] text-white" />
              </button>
              <select
                value={qtyUnit}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-2 text-sm font-bold focus:outline-none focus:border-indigo-500/40 text-[var(--foreground)] shrink-0"
              >
                {MEASUREMENT_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Urgent toggle */}
          <button
            onClick={() => setIsUrgent((v) => !v)}
            className={`w-full flex items-center justify-between border rounded-2xl p-3.5 transition-all cursor-pointer ${
              isUrgent ? "border-rose-500/40 bg-rose-500/10" : "border-[var(--border)] bg-[var(--background)]/30"
            }`}
          >
            <span className={`flex items-center gap-2 text-sm font-black ${isUrgent ? "text-rose-500" : "text-[var(--foreground)]"}`}>
              <Flame className="w-4 h-4" />
              דחוף
            </span>
            <span
              className={`w-10 h-6 rounded-full p-0.5 transition-all flex items-center ${
                isUrgent ? "bg-rose-500 justify-end" : "bg-[var(--foreground)]/15 justify-start"
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-sm block" />
            </span>
          </button>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
              הערה
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="סוג ספציפי, מותג, או תחליף מועדף..."
              rows={2}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:border-indigo-500/50 resize-none placeholder:text-[var(--muted)]/40 text-[var(--foreground)]"
            />
          </div>

          {/* Move between lists */}
          <button
            onClick={() => {
              if (item.listType === "large") onMoveToSupermarket(item.id);
              else onMoveToEquipment(item.id);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 py-3 px-3.5 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] text-sm font-bold text-[var(--foreground)] transition-all cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4 text-indigo-500 shrink-0" />
            {item.listType === "large" ? (
              <span className="flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5" /> העבר לרשימת הסופר</span>
            ) : (
              <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> העבר לרשימת ציוד ורכש</span>
            )}
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2.5 py-3 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-sm font-bold text-rose-500 transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            מחק מהרשימה
          </button>
        </div>
      </BottomSheet>
  );
}
