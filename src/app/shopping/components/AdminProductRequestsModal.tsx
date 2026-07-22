"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { NewProductRequest, Product } from "../types";
import { X, Check, Search, AlertCircle, AlertTriangle, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AdminProductRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: Product[];
  onAddProduct: (name: string, category: string) => Promise<void>;
}

export function AdminProductRequestsModal({ isOpen, onClose, pool, onAddProduct }: AdminProductRequestsModalProps) {
  const [requests, setRequests] = useState<NewProductRequest[]>([]);
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    const q = query(collection(db, "product_requests_queue"), where("status", "==", "pending"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: NewProductRequest[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as NewProductRequest);
      });
      list.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setRequests(list);
    });

    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApprove = async (req: NewProductRequest) => {
    setProcessing(req.id);
    try {
      // Create new product
      await onAddProduct(req.name, req.category);
      // Mark request as approved
      await updateDoc(doc(db, "product_requests_queue", req.id), {
        status: "approved"
      });
    } catch (err) {
      console.error(err);
      alert("שגיאה באישור המוצר");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (reqId: string) => {
    if (!confirm("האם למחוק בקשה זו?")) return;
    setProcessing(reqId);
    try {
      await updateDoc(doc(db, "product_requests_queue", reqId), {
        status: "rejected"
      });
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(null);
    }
  };

  const filtered = requests.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

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
          className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[85vh]"
          dir="rtl"
        >
          <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3 shrink-0">
            <h3 className="text-xl font-black flex items-center gap-2">
              <Database className="w-6 h-6 text-indigo-500" />
              <span>ניהול בקשות מוצרים חדשים</span>
              {requests.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
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

          <div className="mb-4 relative shrink-0">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש בקשות..."
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 no-scrollbar min-h-[250px]">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-[var(--muted)] font-bold text-sm">
                אין בקשות ממתינות לאישור.
              </div>
            ) : (
              filtered.map((req) => {
                const similarCount = pool.filter(p => p.name.includes(req.name) || req.name.includes(p.name)).length;
                return (
                  <div key={req.id} className="p-4 bg-[var(--background)] border border-[var(--border)] rounded-2xl flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-black text-[var(--foreground)]">{req.name}</h4>
                        <span className="text-[11px] text-[var(--muted)]">{req.category}</span>
                      </div>
                      <span className="text-[10px] bg-[var(--foreground)]/5 px-2 py-1 rounded-md text-[var(--muted)]">
                        ביקש: {req.requestedByName}
                      </span>
                    </div>

                    {similarCount > 0 && (
                      <div className="text-[10px] text-amber-500 bg-amber-500/10 p-2 rounded-lg flex gap-1 items-center font-bold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>שים לב: קיימים {similarCount} מוצרים דומים במאגר</span>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]/50">
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={processing === req.id}
                        className="px-4 py-2 rounded-xl text-xs font-black bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        דחה / מחק
                      </button>
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={processing === req.id}
                        className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>אשר והוסף למאגר</span>
                      </button>
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
