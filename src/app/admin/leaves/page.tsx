"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { 
  collection, getDocs, query, orderBy, doc, updateDoc, where, getDoc, setDoc 
} from "firebase/firestore";
import { AlertCircle, CheckCircle, XCircle, ArrowRight, Loader2, MessageSquare, User, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { sendPush } from "@/lib/notify";

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
      const reqSnap = await getDoc(requestDoc);
      const reqData = reqSnap.data();

      await updateDoc(requestDoc, { 
        status,
        handledAt: new Date().toISOString()
      });
      
      if (status === "approved" && reqData) {
        // Automatically add to schedule
        const date = reqData.date; // yyyy-MM-dd
        const schedRef = doc(db, "schedules", date);
        const schedSnap = await getDoc(schedRef);
        
        const newActivity = {
          id: Math.random().toString(36).slice(2, 9),
          title: `היעדרות: ${reqData.userName}`,
          startTime: "08:00",
          endTime: "16:00",
          locationId: "office",
          staffIds: [],
          groupId: "staff_only",
          notes: reqData.reason || "היעדרות מאושרת"
        };

        if (schedSnap.exists()) {
          const current = schedSnap.data().activities || [];
          await updateDoc(schedRef, {
            activities: [...current, newActivity]
          });
        } else {
          await setDoc(schedRef, {
            activities: [newActivity],
            dutyInstructorId: ""
          });
        }

        // Notify user
        await sendPush({
          userId: reqData.userId,
          title: "✅ בקשת ההיעדרות אושרה",
          body: `בקשתך ליום ${date} אושרה ונוספה ללו"ז.`,
          link: "/profile"
        });
      }
      
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
          <div className="max-w-7xl mx-auto space-y-4">
            
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden bg-white/5 border border-white/10 rounded-3xl">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-white/5 text-slate-400 text-xs font-bold uppercase tracking-widest border-b border-white/10">
                    <th className="px-6 py-4">עובד</th>
                    <th className="px-6 py-4">תאריך היעדרות</th>
                    <th className="px-6 py-4">סיבה</th>
                    <th className="px-6 py-4 text-left">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-rose-500/10 text-rose-400 rounded-xl flex items-center justify-center shrink-0">
                            <User className="w-5 h-5" />
                          </div>
                          <span className="font-bold">{req.userName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          {req.date}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-sm italic">
                        {req.reason ? (
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-slate-600" />
                            {req.reason}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            disabled={updatingId === req.id}
                            onClick={() => updateRequestStatus(req.id, "rejected")}
                            className="px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl font-bold hover:bg-rose-500/20 transition-all flex items-center gap-2 text-xs"
                          >
                            <XCircle className="w-4 h-4" />
                            דחייה
                          </button>
                          <button
                            disabled={updatingId === req.id}
                            onClick={() => updateRequestStatus(req.id, "approved")}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all flex items-center gap-2 text-xs shadow-lg shadow-emerald-600/20"
                          >
                            {updatingId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            אישור
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {requests.map((req, index) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col gap-6"
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
                      className="flex-1 px-6 py-2.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl font-bold hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      דחייה
                    </button>
                    <button
                      disabled={updatingId === req.id}
                      onClick={() => updateRequestStatus(req.id, "approved")}
                      className="flex-1 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                    >
                      {updatingId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      אישור
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

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
