"use client";

import { useEffect, useState } from "react";
import { ShoppingRequest, TargetFramework } from "../types";
import { Flame, Trash2, Minus, Plus, ArrowRightLeft, User, ChevronDown, MessageSquare } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { TARGET_FRAMEWORKS, CAT_SOLID } from "../lib/constants";
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
        title="עריכת מוצר"
        zIndex={110}
        footer={
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 h-12 bg-[var(--fill-strong)] text-[var(--foreground)] text-[15px] font-semibold rounded-xl transition-colors hover:brightness-95 cursor-pointer border-none"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="flex-[2] h-12 bg-[var(--accent)] hover:brightness-110 !text-white text-[15px] font-bold rounded-xl transition-all active:scale-[0.98] cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
            >
              שמור שינויים
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* ── Identity: category, name, framework, who asked ── */}
          <div>
            {item.category && (
              <div className="flex items-center gap-2 mb-2 text-[13px] font-semibold text-[var(--muted)]">
                <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${CAT_SOLID[item.category] ?? CAT_SOLID["כללי"]}`} />
                {item.category}
              </div>
            )}
            <label htmlFor="item-edit-name" className="sr-only">שם המוצר</label>
            <input
              id="item-edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-14 bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 text-xl font-semibold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]"
            />

            <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
              <div className="relative inline-flex items-center">
                <span aria-hidden className={`absolute right-3 w-2 h-2 rounded-full pointer-events-none ${currentFwMeta.dot}`} />
                <select
                  value={selectedFramework}
                  onChange={(e) => setSelectedFramework(e.target.value as TargetFramework)}
                  aria-label="מסגרת מזמינה"
                  className="appearance-none h-9 pr-7 pl-8 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--foreground)] cursor-pointer outline-none focus:border-[var(--accent)]"
                >
                  {TARGET_FRAMEWORKS.map((fw) => (
                    <option key={fw.id} value={fw.id}>
                      {fw.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-[var(--muted)]" />
              </div>

              {item.requestedByName && (
                <span className="flex items-center gap-1.5 text-[13px] text-[var(--muted)] min-w-0">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    הוזמן ע״י <strong className="font-semibold text-[var(--foreground)]">{item.requestedByName}</strong>
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* ── Quantity: one card — big stepper, unit, quick picks ── */}
          <div className="rounded-2xl bg-[var(--fill)] p-4">
            <div className="text-[13px] font-semibold text-[var(--muted)] mb-3">כמות</div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label="הפחת כמות"
                onClick={() => setQtyValue((v) => steppedQuantity(v, step, -1, min))}
                className="w-12 h-12 rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)] flex items-center justify-center transition-transform active:scale-90 cursor-pointer shrink-0"
              >
                <Minus className="w-5 h-5 stroke-[2.5] text-[var(--foreground)]" />
              </button>
              <input
                type="text"
                inputMode="decimal"
                aria-label="כמות"
                value={qtyValue}
                onChange={(e) => {
                  const v = parseFloat(e.target.value.replace(",", "."));
                  setQtyValue(Number.isNaN(v) ? 0 : v);
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="w-24 h-14 text-center bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-3xl font-bold tabular-nums focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]"
              />
              <button
                type="button"
                aria-label="הוסף כמות"
                onClick={() => setQtyValue((v) => steppedQuantity(v, step, 1))}
                className="w-12 h-12 rounded-full bg-[var(--accent)] hover:brightness-110 flex items-center justify-center transition-transform active:scale-90 cursor-pointer shrink-0"
              >
                <Plus className="w-5 h-5 stroke-[2.5] text-white" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <select
                value={qtyUnit}
                onChange={(e) => handleUnitChange(e.target.value)}
                aria-label="יחידת מידה"
                className="h-9 px-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)] shrink-0 cursor-pointer"
              >
                {MEASUREMENT_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0">
                {getQuickQtyChips(qtyUnit).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQtyValue(q)}
                    className={`h-9 min-w-9 px-3 rounded-full text-[13px] font-semibold border transition-colors cursor-pointer shrink-0 tabular-nums ${
                      qtyValue === q
                        ? "bg-[var(--accent)] !text-white border-transparent"
                        : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--fill-strong)]"
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div>
            <label htmlFor="item-edit-notes" className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--muted)] mb-2">
              <MessageSquare className="w-3.5 h-3.5" />
              הערה
            </label>
            <textarea
              id="item-edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="סוג ספציפי, מותג, או תחליף מועדף…"
              rows={2}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-3 px-4 text-[15px] font-medium focus:outline-none focus:border-[var(--accent)] resize-none placeholder:text-[var(--muted)]/60 text-[var(--foreground)]"
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
              <span className="truncate">{item.listType === "large" ? "לסופר" : "לרכש"}</span>
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
