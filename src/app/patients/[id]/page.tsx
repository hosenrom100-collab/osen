"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/config";
import { 
  doc, getDoc, collection, query, where, orderBy, getDocs, limit 
} from "firebase/firestore";
import { 
  User, Calendar, Clock, ArrowRight, Loader2, 
  MapPin, Shield, Edit3, ClipboardList, CheckCircle,
  AlertCircle, ChevronLeft, FileDown, Printer, Download, FileText,
  X, Check, Info, History
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, isSameMonth } from "date-fns";
import { he } from "date-fns/locale";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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
  fullName?: string;
}

interface Group { id: string; name: string }
interface Attendance { id: string; date: string; status: "present" | "absent" | "late" }

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, isManager, role } = useAuth();
  const router = useRouter();
  const reportRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "reports">("overview");
  const [groups, setGroups] = useState<Group[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));

  useEffect(() => { if (id) fetchPatientData(); }, [id]);

  const fetchPatientData = async () => {
    try {
      const patientDoc = await getDoc(doc(db, "patients", id));
      if (!patientDoc.exists()) { router.push("/patients"); return; }
      setPatient({ id: patientDoc.id, ...patientDoc.data() } as Patient);

      const groupsSnap = await getDocs(collection(db, "groups"));
      setGroups(groupsSnap.docs.map(d => ({ id: d.id, name: d.data().name } as Group)));

      const attQuery = query(
        collection(db, "attendance"),
        where("patientId", "==", id),
        orderBy("date", "desc"),
        limit(50)
      );
      const attSnap = await getDocs(attQuery);
      setAttendance(attSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const generateReport = async (type: 'participation' | 'attendance') => {
    if (!patient || !reportRef.current) return;
    setReportLoading(true);
    
    try {
      // Small delay to ensure styles are applied
      await new Promise(r => setTimeout(r, 100));
      
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });
      
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
      pdf.save(`${type === 'participation' ? 'אישור_השתתפות' : 'דוח_נוכחות'}_${patient.firstName}_${patient.lastName}.pdf`);
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת הדוח");
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--background)] gap-4">
      <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      <p className="text-sm font-black text-[var(--foreground)]/30 uppercase tracking-[0.2em]">טוען תיק מטופל...</p>
    </div>
  );

  if (!patient) return null;

  const patientName = patient.firstName && patient.lastName ? `${patient.firstName} ${patient.lastName}` : (patient.fullName || "מטופל ללא שם");
  const groupName = groups.find(g => g.id === patient.hosenType)?.name || patient.hosenType || "כללי";

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker"]} redirectTo="/login">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        
        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]">
          <div className="max-w-6xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button onClick={() => router.push("/patients")} className="w-10 h-10 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center hover:bg-[var(--foreground)]/10 transition-all">
                <ChevronLeft className="w-5 h-5 rotate-180" />
              </button>
              <div className="flex flex-col">
                <h1 className="text-xl font-black tracking-tight leading-none mb-1">{patientName}</h1>
                <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest flex items-center gap-2">
                  <span className="text-emerald-500">{groupName}</span>
                  <span className="opacity-20">•</span>
                  <span>ת.ז: {patient.idNumber}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
               {(isAdmin || isManager) && (
                 <button className="hidden sm:flex items-center gap-2 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] px-4 py-2.5 rounded-2xl text-xs font-black transition-all">
                   <Edit3 className="w-4 h-4" />
                   <span>ערוך תיק</span>
                 </button>
               )}
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto p-4 md:p-8">
          
          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
             {[
               { label: "נוכחות החודש", value: `${attendance.filter(a => a.status === 'present').length}`, icon: CheckCircle, color: "text-emerald-500" },
               { label: "סטטוס טיפולי", value: patient.status === 'active' ? 'פעיל' : 'בטיפול', icon: Shield, color: "text-blue-500" },
               { label: "תאריך הצטרפות", value: patient.startDate ? format(new Date(patient.startDate), "dd/MM/yy") : "—", icon: Calendar, color: "text-purple-500" },
               { label: "ימי היעדרות", value: `${attendance.filter(a => a.status === 'absent').length}`, icon: AlertCircle, color: "text-rose-500" },
             ].map((stat, i) => (
               <div key={i} className="bg-[var(--card-bg)] border border-[var(--border)] p-4 rounded-[2rem] shadow-sm">
                 <div className={`w-8 h-8 rounded-xl bg-current/10 ${stat.color} flex items-center justify-center mb-3`}>
                    <stat.icon className="w-4 h-4" />
                 </div>
                 <p className="text-[10px] font-black text-[var(--foreground)]/30 uppercase tracking-widest mb-0.5">{stat.label}</p>
                 <p className="text-lg font-black">{stat.value}</p>
               </div>
             ))}
          </div>

          {/* ── Tabs ── */}
          <div className="flex bg-[var(--foreground)]/5 p-1.5 rounded-2xl border border-[var(--border)] mb-8 w-fit">
             {[
               { id: "overview", label: "סקירה כללית", icon: Info },
               { id: "attendance", label: "נוכחות", icon: History },
               { id: "reports", label: "דוחות ומסמכים", icon: FileText },
             ].map((tab) => (
               <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === tab.id ? 'bg-emerald-600 text-white shadow-lg' : 'text-[var(--foreground)]/40 hover:text-[var(--foreground)]'}`}
               >
                 <tab.icon className="w-3.5 h-3.5" />
                 {tab.label}
               </button>
             ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "overview" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="overview" className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="md:col-span-2 space-y-6">
                    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-sm">
                      <h3 className="text-lg font-black mb-6">מידע אישי וקשר</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                         <div>
                            <p className="text-[10px] font-black text-[var(--foreground)]/30 uppercase tracking-widest mb-1.5">מספר תעודת זהות</p>
                            <p className="text-sm font-bold font-mono">{patient.idNumber}</p>
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-[var(--foreground)]/30 uppercase tracking-widest mb-1.5">קבוצת השתייכות</p>
                            <p className="text-sm font-bold">{groupName}</p>
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-[var(--foreground)]/30 uppercase tracking-widest mb-1.5">טלפון</p>
                            <p className="text-sm font-bold">{patient.phone || "—"}</p>
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-[var(--foreground)]/30 uppercase tracking-widest mb-1.5">דוא״ל</p>
                            <p className="text-sm font-bold">{patient.email || "—"}</p>
                         </div>
                      </div>
                    </div>
                 </div>
                 <div className="space-y-6">
                    <div className="bg-emerald-600/5 border border-emerald-500/10 rounded-[2.5rem] p-8">
                       <h4 className="text-emerald-500 text-xs font-black uppercase tracking-[0.2em] mb-4">סיכום סטטוס</h4>
                       <p className="text-sm font-bold leading-relaxed opacity-80">
                         המטופל משובץ כרגע בקבוצת {groupName}. סטטוס נוכחות מצטבר עומד על {Math.round((attendance.filter(a => a.status === 'present').length / (attendance.length || 1)) * 100)}% החודש.
                       </p>
                    </div>
                 </div>
              </motion.div>
            )}

            {activeTab === "attendance" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="attendance" className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] overflow-hidden shadow-sm">
                <div className="p-6 border-b border-[var(--border)] bg-[var(--foreground)]/[0.02]">
                  <h3 className="font-black">יומן נוכחות אחרון</h3>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {attendance.length === 0 ? (
                    <div className="py-20 text-center opacity-20 italic">אין רישומי נוכחות זמינים</div>
                  ) : attendance.map((att) => (
                    <div key={att.id} className="p-5 flex items-center justify-between hover:bg-[var(--foreground)]/[0.01] transition-colors">
                      <div className="flex items-center gap-4">
                        <Calendar className="w-4 h-4 text-[var(--foreground)]/20" />
                        <span className="text-sm font-bold">{format(new Date(att.date + "T12:00:00"), "EEEE, dd/MM/yyyy", { locale: he })}</span>
                      </div>
                      <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border uppercase tracking-tighter ${
                        att.status === "present" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                      }`}>
                        {att.status === "present" ? "נוכח" : "נעדר"}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === "reports" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="reports" className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                    <div className="bg-[var(--card-bg)] border border-[var(--border)] p-6 rounded-[2rem] shadow-sm flex flex-col items-center text-center transition-all hover:border-emerald-500/30 group">
                       <div className="w-12 h-12 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
                          <FileText className="w-6 h-6" />
                       </div>
                       <h4 className="text-base font-black mb-1">אישור השתתפות בתוכנית</h4>
                       <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mb-6">מסמך רשמי המעיד על פעילות המטופל</p>
                       <button 
                        onClick={() => generateReport('participation')}
                        disabled={reportLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-2"
                       >
                         {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                         הפק דוח השתתפות
                       </button>
                    </div>

                    <div className="bg-[var(--card-bg)] border border-[var(--border)] p-6 rounded-[2rem] shadow-sm flex flex-col items-center text-center transition-all hover:border-blue-500/30 group">
                       <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                          <ClipboardList className="w-6 h-6" />
                       </div>
                       <h4 className="text-base font-black mb-1">דוח נוכחות חודשי</h4>
                       <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mb-6">פירוט ימי נוכחות והיעדרות לפי חודש</p>
                       
                       <div className="flex gap-2 w-full mb-3">
                         <select 
                          value={selectedMonth} 
                          onChange={(e) => setSelectedMonth(e.target.value)}
                          className="flex-1 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-lg px-3 py-2 text-[10px] font-bold outline-none focus:border-blue-500/50"
                         >
                            {Array.from({ length: 12 }).map((_, i) => {
                              const d = subMonths(new Date(), i);
                              return (
                                <option key={i} value={format(d, "yyyy-MM")}>
                                  {format(d, "MMMM yyyy", { locale: he })}
                                </option>
                              );
                            })}
                         </select>
                       </div>

                       <button 
                        onClick={() => generateReport('attendance')}
                        disabled={reportLoading}
                        className="w-full bg-[var(--foreground)] text-[var(--background)] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90 flex items-center justify-center gap-2"
                       >
                         {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                         הפק דוח נוכחות חודשי
                       </button>
                    </div>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ── PDF Template (Hidden from UI but visible to html2canvas) ── */}
        <div className="fixed left-[-9999px] top-[-9999px]">
          <div ref={reportRef} className="w-[210mm] p-[20mm] bg-white text-black font-sans leading-relaxed">
            <div className="flex justify-between items-start border-b-2 border-emerald-600 pb-8 mb-12">
              <div>
                <h1 className="text-4xl font-black text-emerald-600 mb-2">מרכז חוסן</h1>
                <h2 className="text-xl font-bold text-slate-500">חוות רום</h2>
              </div>
              <div className="text-left text-sm text-slate-400 font-mono">
                <p>{format(new Date(), "dd/MM/yyyy")}</p>
                <p>סימוכין: {id?.slice(-6).toUpperCase()}</p>
              </div>
            </div>

            <div className="text-center mb-16">
              <h3 className="text-3xl font-black mb-4">אישור השתתפות בתוכנית</h3>
              <div className="w-24 h-1 bg-emerald-500 mx-auto rounded-full" />
            </div>

            <div className="space-y-8 text-lg">
              <p>לכל המעוניין,</p>
              <p className="leading-loose">
                הרינו לאשר כי המטופל/ת <strong>{patientName}</strong>, ת.ז <strong>{patient.idNumber}</strong>, משתתף/ת באופן פעיל בתוכנית המרכז במסגרת קבוצת <strong>{groupName}</strong>.
              </p>
              <p>המטופל/ת החל/ה את פעילותו/ה בתוכנית בתאריך {patient.startDate ? format(new Date(patient.startDate), "dd/MM/yyyy") : "—"}.</p>
              
              <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 my-12">
                <h4 className="font-black text-sm uppercase tracking-widest text-slate-400 mb-4">סיכום נוכחות תקופתי</h4>
                <div className="flex justify-around items-center">
                  <div className="text-center">
                    <p className="text-3xl font-black text-emerald-600">{attendance.filter(a => a.status === 'present').length}</p>
                    <p className="text-xs font-bold text-slate-500">ימי נוכחות</p>
                  </div>
                  <div className="w-px h-12 bg-slate-200" />
                  <div className="text-center">
                    <p className="text-3xl font-black text-rose-600">{attendance.filter(a => a.status === 'absent').length}</p>
                    <p className="text-xs font-bold text-slate-500">ימי היעדרות</p>
                  </div>
                </div>
              </div>

              <p className="mt-12">בברכה,</p>
              <div className="mt-8">
                <p className="font-black">הנהלת מרכז חוסן</p>
                <p className="text-sm text-slate-500 italic">חוות רום - שיקום חקלאי וקהילתי</p>
              </div>
            </div>

            <div className="mt-24 pt-8 border-t border-slate-100 text-[10px] text-slate-400 text-center">
              מסמך זה הופק באופן ממוחשב ואינו דורש חתימה | מרכז חוסן - חוות רום
            </div>
          </div>
        </div>

      </div>
    </RoleGuard>
  );
}
