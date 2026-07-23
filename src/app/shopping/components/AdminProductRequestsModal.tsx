"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { NewProductRequest, Product } from "../types";
import { X, Check, Search, AlertTriangle, Database, Edit3, ShoppingCart, Lightbulb, ArrowRight, CornerDownLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AdminProductRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: Product[];
  categories?: string[];
  onAddProduct: (name: string, category: string, defaultUnit?: string, defaultNotes?: string) => Promise<void>;
  onAddToShoppingList?: (name: string, category: string, priority?: "normal" | "urgent", quantity?: string, notes?: string) => Promise<void>;
}

export function AdminProductRequestsModal({
  isOpen,
  onClose,
  pool,
  categories = [],
  onAddProduct,
  onAddToShoppingList,
}: AdminProductRequestsModalProps) {
  const [requests, setRequests] = useState<NewProductRequest[]>([]);
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  // Editable fields per request
  const [editForms, setEditForms] = useState<Record<string, { name: string; category: string; defaultNotes: string; addToShoppingList: boolean }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, "product_requests_queue"), where("status", "==", "pending"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: NewProductRequest[] = [];
      const forms: Record<string, { name: string; category: string; defaultNotes: string; addToShoppingList: boolean }> = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Omit<NewProductRequest, "id">;
        const item: NewProductRequest = { id: docSnap.id, ...data };
        list.push(item);
        forms[docSnap.id] = {
          name: data.name || "",
          category: data.category || "כללי",
          defaultNotes: data.notes || "",
          addToShoppingList: true,
        };
      });

      list.sort((a, b) => (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0));
      setRequests(list);
      setEditForms(forms);
    });

    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFieldChange = (reqId: string, field: string, value: any) => {
    setEditForms((prev) => ({
      ...prev,
      [reqId]: {
        ...prev[reqId],
        [field]: value,
      },
    }));
  };

  const getSimilarProducts = (term: string) => {
    if (!term || !term.trim()) return [];
    const normTerm = term.trim().toLowerCase();
    const termWords = normTerm.split(/\s+/).filter(w => w.length >= 2);

    return pool.filter((p) => {
      const normP = (p.name || "").trim().toLowerCase();
      if (normP === normTerm) return true;
      if (normP.includes(normTerm) || normTerm.includes(normP)) return true;
      
      const pWords = normP.split(/\s+/);
      return termWords.some((w) => pWords.includes(w));
    });
  };

  const handleApprove = async (req: NewProductRequest) => {
    const form = editForms[req.id] || { name: req.name, category: req.category, defaultNotes: "", addToShoppingList: true };
    const finalName = form.name.trim() || req.name;
    const finalCategory = form.category || req.category || "כללי";
    const finalNotes = form.defaultNotes.trim();

    setProcessing(req.id);
    try {
      // 1. Add/Update product in pool
      await onAddProduct(finalName, finalCategory, undefined, finalNotes);

      // 2. Add to active shopping list if selected
      if (form.addToShoppingList && onAddToShoppingList) {
        await onAddToShoppingList(finalName, finalCategory, "normal", "1", finalNotes);
      }

      // 3. Mark request in queue as approved
      await updateDoc(doc(db, "product_requests_queue", req.id), {
        status: "approved",
        approvedName: finalName,
        approvedCategory: finalCategory,
      });
    } catch (err) {
      console.error(err);
      alert("שגיאה באישור המוצר");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (reqId: string) => {
    if (!confirm("האם למחוק/לדחות בקשה זו?")) return;
    setProcessing(reqId);
    try {
      await updateDoc(doc(db, "product_requests_queue", reqId), {
        status: "rejected",
      });
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(null);
    }
  };

  const handleSendExistingAlternative = async (reqId: string, existingProduct: Product) => {
    setProcessing(reqId);
    try {
      // Add existing product to shopping list
      if (onAddToShoppingList) {
        await onAddToShoppingList(existingProduct.name, existingProduct.category, "normal", "1", existingProduct.defaultNotes || "");
      }
      // Resolve/reject the new product request
      await updateDoc(doc(db, "product_requests_queue", reqId), {
        status: "rejected",
        handledWithExisting: existingProduct.name,
      });
    } catch (err) {
      console.error(err);
      alert("שגיאה בשליחת המוצר הקיים לרשימה");
    } finally {
      setProcessing(null);
    }
  };

  const filtered = requests.filter((r) => {
    const form = editForms[r.id];
    const nameToMatch = form?.name || r.name;
    return nameToMatch.toLowerCase().includes(search.toLowerCase());
  });

  const categoryList = Array.from(new Set(["כללי", "גבינות ומחלבה", "בשר ודגים", "פירות וירקות", "לחם ומאפים", "חומרי ניקוי", "מוצרי נייר וחד פעמי", "טואלטיקה והיגיינה", "שימורים ובישול", "קפואים", ...categories]));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-xl p-6 shadow-2xl flex flex-col max-h-[85vh] text-right"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3 shrink-0">
            <h3 className="text-xl font-black flex items-center gap-2">
              <Database className="w-6 h-6 text-indigo-500" />
              <span>ניהול בקשות מוצרים חדשים</span>
              {requests.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] px-2.5 py-0.5 rounded-full font-extrabold shadow-xs">
                  {requests.length} ממתינים
                </span>
              )}
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="mb-4 relative shrink-0">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש בקשות..."
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 pr-10 pl-4 text-sm font-bold focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Request Cards List */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar min-h-[280px]">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-[var(--muted)] font-bold text-sm">
                אין בקשות ממתינות לאישור.
              </div>
            ) : (
              filtered.map((req) => {
                const form = editForms[req.id] || { name: req.name, category: req.category, defaultNotes: "", addToShoppingList: true };
                const similarProducts = getSimilarProducts(form.name);
                const isEditing = editingId === req.id;

                return (
                  <div
                    key={req.id}
                    className="p-4 bg-[var(--background)] border border-[var(--border)] rounded-2xl flex flex-col gap-3.5 shadow-sm transition-all"
                  >
                    {/* Header line & Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {!isEditing ? (
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base font-black text-[var(--foreground)]">{form.name}</h4>
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                                {form.category}
                              </span>
                            </div>
                            <span className="text-[11px] text-[var(--muted)] mt-0.5 block">
                              מבקש/ת: <span className="font-bold text-[var(--foreground)]/80">{req.requestedByName}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2.5 bg-[var(--surface)] p-3 rounded-xl border border-indigo-500/30">
                            <div>
                              <label className="text-[10px] font-bold text-[var(--muted)] mb-1 block">שם המוצר:</label>
                              <input
                                type="text"
                                value={form.name}
                                onChange={(e) => handleFieldChange(req.id, "name", e.target.value)}
                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-[var(--muted)] mb-1 block">קטגוריה:</label>
                              <select
                                value={form.category}
                                onChange={(e) => handleFieldChange(req.id, "category", e.target.value)}
                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                              >
                                {categoryList.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-[var(--muted)] mb-1 block">הערה קבועה (אופציונלי):</label>
                              <input
                                type="text"
                                value={form.defaultNotes}
                                onChange={(e) => handleFieldChange(req.id, "defaultNotes", e.target.value)}
                                placeholder="הערה קבועה לפול המוצרים..."
                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => setEditingId(isEditing ? null : req.id)}
                        className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                          isEditing
                            ? "bg-indigo-600 text-white"
                            : "bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)]"
                        }`}
                        title="ערוך בקשה"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isEditing ? "סיום עריכה" : "ערוך בקשה"}</span>
                      </button>
                    </div>

                    {/* Default notes preview if not in editing mode */}
                    {!isEditing && form.defaultNotes && (
                      <div className="text-xs bg-amber-500/10 text-amber-800 dark:text-amber-200 p-2.5 rounded-xl border border-amber-500/20 font-medium">
                        <span className="font-bold">הערה קבועה:</span> {form.defaultNotes}
                      </div>
                    )}

                    {/* Advisor Section - Similar Existing Products */}
                    {similarProducts.length > 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-black text-xs">
                          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>יועץ מוצרים: נמצאו מוצרים דומים שכבר קיימים במערכת!</span>
                        </div>
                        <div className="space-y-1.5">
                          {similarProducts.map((p) => (
                            <div
                              key={p.id}
                              className="bg-[var(--surface)] p-2.5 rounded-xl border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="font-bold text-[var(--foreground)]">{p.name}</span>
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-[var(--foreground)]/5 text-[var(--muted)]">
                                  {p.category}
                                </span>
                                {p.defaultNotes && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 italic">({p.defaultNotes})</span>
                                )}
                              </div>

                              <button
                                onClick={() => handleSendExistingAlternative(req.id, p)}
                                disabled={processing === req.id}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                                title="שלח מוצר קיים זה לרשימת הקניות וסגור את הבקשה"
                              >
                                <ShoppingCart className="w-3 h-3 text-indigo-500" />
                                <span>שלח מוצר קיים זה לרשימה</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bottom Actions & Checkbox */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[var(--border)]/50">
                      <label className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]/80 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.addToShoppingList}
                          onChange={(e) => handleFieldChange(req.id, "addToShoppingList", e.target.checked)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                        />
                        <span>הוסף מוצר זה גם לרשימת הקניות העכשווית</span>
                      </label>

                      <div className="flex items-center justify-end gap-2 shrink-0">
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={processing === req.id}
                          className="px-3.5 py-2 rounded-xl text-xs font-black bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          דחה בקשה
                        </button>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={processing === req.id}
                          className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 !text-white transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-4 h-4" />
                          <span>אשר והוסף לפול</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
