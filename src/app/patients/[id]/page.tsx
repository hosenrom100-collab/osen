"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { 
  doc, getDoc, collection, query, where, orderBy, getDocs, limit 
} from "firebase/firestore";
import { 
  User, Calendar, Clock, ArrowRight, Loader2, 
  MapPin, Shield, Edit3, ClipboardList, CheckCircle,
  AlertCircle, ChevronLeft
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  hosenType?: string;
  status: string;
  assignedWorkerId?: string;
  startDate?: string;
  phone?: string;
  email?: string;
}

interface Attendance {
  id: string;
  date: string;
  status: "present" | "absent" | "late";
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, isManager } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "attendance">("overview");

  useEffect(() => {
    if (id) fetchPatientData();
  }, [id]);

  const fetchPatientData = async () => {
    try {
      const patientDoc = await getDoc(doc(db, "patients", id));
      if (!patientDoc.exists()) {
        router.push("/patients");
        return;
      }
      setPatient({ id: patientDoc.id, ...patientDoc.data() } as Patient);

      const attQuery = query(
        collection(db, "attendance"),
        where("patientId", "==", id),
        orderBy("date", "desc"),
        limit(20)
      );
      const attSnap = await getDocs(attQuery);
      setAttendance(attSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
    } catch (err) {
      console.error("Error fetching patient:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!patient) return null;

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white pb-24">
        
        {/* Header */}
        <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-6 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            <button 
              onClick={() => router.push("/patients")}
              className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{patient.firstName} {patient.lastName}</h1>
              <p className="text-[11px] text-slate-500">מזהה: {patient.idNumber || "—"}</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
              patient.status === 'active' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-slate-500/10 text-slate-400 border-white/10'
            }`}>
              {patient.status === 'active' ? 'פעיל' : 'לא פעיל'}
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-6 pt-8 space-y-8">
          
          {/* Action Tabs */}
          <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === "overview" ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-white"
              }`}
            >
              <User className="w-4 h-4" /> סקירה
            </button>
            <button
              onClick={() => setActiveTab("attendance")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === "attendance" ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-white"
              }`}
            >
              <CheckCircle className="w-4 h-4" /> נוכחות
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Details Card */}
                <section className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                  <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-400" />
                    פרטים אישיים
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">שם מלא</p>
                      <p className="font-bold text-[15px]">{patient.firstName} {patient.lastName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">תעודת זהות</p>
                      <p className="font-bold text-[15px]">{patient.idNumber || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">סוג חוסן</p>
                      <p className="font-bold text-[15px] text-blue-400">{patient.hosenType || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">תאריך הצטרפות</p>
                      <p className="font-bold text-[15px]">{patient.startDate ? format(new Date(patient.startDate), "dd/MM/yyyy") : "—"}</p>
                    </div>
                  </div>
                </section>

                {/* Contact Info (if any) */}
                <section className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                  <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-400" />
                    פרטי קשר
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
                      <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-slate-500">טלפון</p>
                        <p className="font-bold text-sm">{patient.phone || "לא הוזן"}</p>
                      </div>
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === "attendance" && (
              <motion.div
                key="attendance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-emerald-400" />
                    היסטוריית נוכחות (20 אחרונים)
                  </h3>
                </div>

                <div className="space-y-2">
                  {attendance.length === 0 ? (
                    <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center">
                      <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm">לא נמצאו רישומי נוכחות עבור מטופל זה</p>
                    </div>
                  ) : (
                    attendance.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl">
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${
                            att.status === 'present' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                            att.status === 'late' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
                            'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                          }`} />
                          <div>
                            <p className="font-bold text-sm">
                              {format(new Date(att.date), "EEEE, d בMMMM", { locale: he })}
                            </p>
                            <p className="text-[10px] text-slate-500">{att.date}</p>
                          </div>
                        </div>
                        <div className={`text-[11px] font-bold ${
                          att.status === 'present' ? 'text-emerald-400' :
                          att.status === 'late' ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {att.status === 'present' ? 'נוכח' :
                           att.status === 'late' ? 'איחר' :
                           'נעדר'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>
    </RoleGuard>
  );
}
