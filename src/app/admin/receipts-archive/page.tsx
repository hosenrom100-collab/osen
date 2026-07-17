"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { Receipt, Search, Calendar, User, Edit3, Trash2, X, Eye, Loader2, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface ReceiptItem {
  id: string;
  userId: string;
  userName: string;
  notes: string;
  imageUrl: string;
  createdAt: any;
}

export default function ReceiptsArchivePage() {
  const { user, isManager, isAdmin, isLogistics } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  
  // Lightbox & Edit States
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ReceiptItem | null>(null);
  const [editNotesText, setEditNotesText] = useState("");
  const [updatingNotes, setUpdatingNotes] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, "receipts"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as ReceiptItem[];
      setReceipts(items);
    } catch (err) {
      console.error("Error fetching receipts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateNotes = async () => {
    if (!editingItem) return;
    try {
      setUpdatingNotes(true);
      const docRef = doc(db, "receipts", editingItem.id);
      await updateDoc(docRef, { notes: editNotesText.trim() });
      
      setReceipts(prev => prev.map(item => 
        item.id === editingItem.id ? { ...item, notes: editNotesText.trim() } : item
      ));
      
      setEditingItem(null);
      setEditNotesText("");
      // Simple custom notification/alert could be triggered here
    } catch (err) {
      console.error("Error updating receipt notes:", err);
      alert("שגיאה בעדכון ההערות.");
    } finally {
      setUpdatingNotes(false);
    }
  };

  const handleDeleteReceipt = async (id: string) => {
    if (!window.confirm("האם אתה בטוח שברצונך למחוק קבלה זו לצמיתות?")) return;
    try {
      setDeletingId(id);
      await deleteDoc(doc(db, "receipts", id));
      setReceipts(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error("Error deleting receipt:", err);
      alert("שגיאה במחיקת הקבלה.");
    } finally {
      setDeletingId(null);
    }
  };

  // Filter receipts
  const filteredReceipts = receipts.filter(item => {
    const matchSearch = 
      item.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.notes.toLowerCase().includes(searchTerm.toLowerCase());
      
    let matchDate = true;
    if (dateFilter) {
      const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
      const formattedD = d.toISOString().split("T")[0]; // YYYY-MM-DD
      matchDate = formattedD === dateFilter;
    }
    
    return matchSearch && matchDate;
  });

  return (
    <RoleGuard allowedRoles={["admin", "manager", "logistics"]}>
      <div className="min-h-screen bg-[#f8fafc] text-right p-4 md:p-8 pb-24" dir="rtl">
        
        {/* Header */}
        <header className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push("/admin")} 
              className="p-2.5 rounded-2xl bg-white border border-slate-200/80 hover:bg-slate-50 transition-colors flex items-center justify-center"
            >
              <ArrowRight className="w-5 h-5 text-slate-500" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <Receipt className="w-6 h-6 text-indigo-600" />
                <span>ארכיון קבלות וחשבוניות</span>
              </h1>
              <p className="text-xs text-slate-500 font-bold mt-1">צפייה, חיפוש וניהול קבלות רכש של חוות רום</p>
            </div>
          </div>
        </header>

        {/* Filter Controls */}
        <div className="max-w-6xl mx-auto bg-white border border-slate-200/60 rounded-3xl p-5 mb-8 shadow-sm space-y-4">
          <h2 className="text-sm font-black text-slate-800">סינון וחיפוש קבלות</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search by user / notes */}
            <div className="relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="חפש לפי שם רוכש או הערות..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pr-11 pl-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-right"
              />
            </div>
            
            {/* Date filter */}
            <div className="relative">
              <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pr-11 pl-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-right"
              />
            </div>
          </div>
          {(searchTerm || dateFilter) && (
            <div className="flex justify-start">
              <button 
                onClick={() => { setSearchTerm(""); setDateFilter(""); }}
                className="text-xs font-black text-indigo-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>נקה סינונים</span>
              </button>
            </div>
          )}
        </div>

        {/* Receipts Grid */}
        <main className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
              <p className="text-sm font-bold">טוען ארכיון קבלות...</p>
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="bg-white border border-slate-200/60 rounded-3xl p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-4 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                <Receipt className="w-8 h-8 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-700">לא נמצאו קבלות</p>
                <p className="text-xs text-slate-400 font-bold mt-1">נסה לשנות את הסינון או העלה קבלה חדשה ממסך הקניות</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredReceipts.map((item) => {
                const dateObj = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
                const formattedDate = dateObj.toLocaleDateString("he-IL", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  <motion.div 
                    layout
                    key={item.id}
                    className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm flex flex-col h-[400px] group"
                  >
                    {/* Image Preview Container */}
                    <div className="relative h-[180px] bg-slate-900 overflow-hidden flex items-center justify-center">
                      <img 
                        src={item.imageUrl} 
                        alt="קבלה" 
                        className="object-cover w-full h-full opacity-90 group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      
                      {/* View Action overlay */}
                      <button 
                        onClick={() => setActiveImage(item.imageUrl)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity gap-2 text-white font-black text-xs cursor-pointer"
                      >
                        <Eye className="w-5 h-5" />
                        <span>הגדל תמונה</span>
                      </button>
                    </div>

                    {/* Receipt Details */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div className="space-y-3">
                        {/* User & Date */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-700 font-black">
                            <User className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{item.userName}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-bold">{formattedDate}</span>
                        </div>

                        {/* Notes */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">הערות ופירוט:</span>
                          <p className="text-xs text-slate-600 font-medium leading-relaxed line-clamp-3">
                            {item.notes || <span className="italic text-slate-400">אין הערות רשומות</span>}
                          </p>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setEditNotesText(item.notes);
                          }}
                          className="flex items-center gap-1 text-xs font-black text-indigo-600 hover:text-indigo-700 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>ערוך הערות</span>
                        </button>
                        
                        {(isAdmin || isManager) && (
                          <button
                            onClick={() => handleDeleteReceipt(item.id)}
                            disabled={deletingId === item.id}
                            className="flex items-center gap-1 text-xs font-black text-rose-500 hover:text-rose-600 disabled:opacity-50 cursor-pointer"
                          >
                            {deletingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>מחק קבלה</span>
                          </button>
                        )}
                      </div>

                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </main>

        {/* Zoom Lightbox Modal */}
        <AnimatePresence>
          {activeImage && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setActiveImage(null)} 
                className="absolute inset-0 bg-black/90 backdrop-blur-md" 
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center z-10"
              >
                <img 
                  src={activeImage} 
                  alt="קבלה מוגדלת" 
                  className="object-contain max-h-[85vh] rounded-2xl shadow-2xl"
                />
                <button 
                  onClick={() => setActiveImage(null)} 
                  className="absolute -top-12 left-0 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Notes Modal */}
        <AnimatePresence>
          {editingItem && (
            <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center p-0 md:p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => {
                  if (!updatingNotes) setEditingItem(null);
                }} 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ y: "100%", scale: 1 }} 
                animate={{ y: 0, scale: 1 }} 
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="relative bg-white border-t md:border border-slate-200 rounded-t-[2rem] md:rounded-[2rem] w-full max-w-md p-6 shadow-2xl text-right z-10" 
              >
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5 md:hidden" />
                
                <h3 className="text-lg font-black text-slate-800 mb-4">עריכת הערות חשבונית</h3>
                
                <textarea
                  value={editNotesText}
                  onChange={(e) => setEditNotesText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[120px] resize-none mb-4"
                  placeholder="רשום הערות חדשות..."
                />
                
                <div className="flex gap-3">
                  <button
                    onClick={handleUpdateNotes}
                    disabled={updatingNotes}
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-2"
                  >
                    {updatingNotes ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>עדכן הערות</span>
                    )}
                  </button>
                  <button
                    onClick={() => setEditingItem(null)}
                    disabled={updatingNotes}
                    className="py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-sm font-black transition-all"
                  >
                    <span>ביטול</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </RoleGuard>
  );
}
