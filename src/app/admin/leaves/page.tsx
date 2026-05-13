"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, orderBy, doc, updateDoc, where } from "firebase/firestore";
import { AlertCircle, CheckCircle, XCircle, ArrowRight, Loader2, MessageSquare, User, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function LeaveManagementPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "absences"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const list: any[] = [];
      querySnapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setRequests(list);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateRequestStatus = async (requestId: string, status: "approved" | "rejected") => {
    setUpdatingId(requestId);
    try {
      const requestDoc = doc(db, "absences", requestId);
      await updateDoc(requestDoc, { 
        status,
        handledAt: new Date().toISOString()
      });
      
      // Optionally notify user via /api/notify if implemented
      
      setRequests(prev => prev.filter(r => r.id !== requestId));
      alert(`הבקשה ${status === "approved" ? "אושרה" : "נדחתה"} בהצלחה`);
    } catch (error) {
      console.error("Error updating request:", error);
      alert("שגיאה בעדכון הבקשה");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <header className="flex items-center gap-4 mb-10">
          <button 
            onClick={() => router.push("/admin")}
            className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-rose-400" />
              ניהול בקשות היעדרות
            </h1>
            <p className="text-slate-400 text-sm">אישור או דחיית בקשות צוות המרכז</p>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center p-20">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {requests.map((req, index) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center shrink-0">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{req.userName}</h3>
                    <div className="flex items-center gap-4 mt-1 text-slate-400 text-sm">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {req.date}
                      </span>
                      {req.reason && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-4 h-4" />
                          {req.reason}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    disabled={updatingId === req.id}
                    onClick={() => updateRequestStatus(req.id, "rejected")}
                    className="flex-1 md:flex-none px-6 py-2.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl font-bold hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    דחייה
                  </button>
                  <button
                    disabled={updatingId === req.id}
                    onClick={() => updateRequestStatus(req.id, "approved")}
                    className="flex-1 md:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    {updatingId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    אישור
                  </button>
                </div>
              </motion.div>
            ))}

            {requests.length === 0 && (
              <div className="text-center py-20 bg-white/5 border border-white/10 border-dashed rounded-[3rem]">
                <CheckCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-500">אין בקשות היעדרות הממתינות לטיפול</p>
              </div>
            )}
          </div>
        )}
      </main>
    </RoleGuard>
  );
}
