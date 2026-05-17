"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, doc, getDoc, setDoc, getDocs,
  query, orderBy, where, onSnapshot, serverTimestamp
} from "firebase/firestore";
import {
  FileText, Shield, BarChart3, Clock, Loader2, Download,
  Calendar, Check, AlertCircle, Send, Info
} from "lucide-react";
import { format, parseISO, addMonths } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function DocumentsPage() {
  const { user } = useAuth();
  const [patientData, setPatientData] = useState<any>(null);
  const [swData, setSwData] = useState<any>(null);
  const [docRequests, setDocRequests] = useState<any[]>([]);
  const [myDocs, setMyDocs] = useState<any[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [docBusy, setDocBusy] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedReportMonth, setSelectedReportMonth] = useState(format(new Date(), "yyyy-MM"));
  const [groups, setGroups] = useState<any[]>([]);
  
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const gSnap = await getDocs(collection(db, "groups"));
      setGroups(gSnap.docs.map(d => ({id: d.id, ...(d.data() as any)})));

      const uSnap = await getDoc(doc(db, "users", user.uid));
      const pId = uSnap.data()?.patientId;
      if (!pId) return;

      const unsubPatient = onSnapshot(doc(db, "patients", pId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setPatientData({ id: snap.id, ...data });
          if (data.assignedWorkerId) {
             getDoc(doc(db, "users", data.assignedWorkerId)).then(s => s.exists() && setSwData({id: s.id, ...(s.data() as any)}));
          }
        }
      });

      const unsubAtt = onSnapshot(
        query(collection(db, "attendance"), where("patientId", "==", pId), orderBy("date", "desc")),
        (snap) => {
          const daily: Record<string, any> = {};
          snap.docs.forEach(d => {
            const data = d.data();
            if (!daily[data.date] || data.status === 'present') daily[data.date] = data;
          });
          setAttendanceHistory(Object.values(daily));
        }
      );

      const unsubRequests = onSnapshot(
        query(collection(db, "document_requests"), where("patientId", "==", pId), orderBy("createdAt", "desc")),
        (snap) => setDocRequests(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
      );

      const unsubDocs = onSnapshot(
        query(collection(db, "documents"), where("patientId", "==", pId), orderBy("createdAt", "desc")),
        (snap) => setMyDocs(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
      );

      setLoading(false);
      return () => { unsubPatient(); unsubAtt(); unsubRequests(); unsubDocs(); };
    };
    init();
  }, [user]);

  const requestDoc = async (type: "stay" | "attendance") => {
    if (!user || !patientData || docBusy) return;
    setDocBusy(true);
    try {
      await setDoc(doc(collection(db, "document_requests")), {
        patientId: patientData.id,
        patientName: `${patientData.firstName} ${patientData.lastName}`,
        assignedWorkerId: patientData.assignedWorkerId || null,
        type,
        month: type === 'attendance' ? selectedReportMonth : null,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      alert("בקשתך נשלחה לצוות.");
    } catch (e) { console.error(e); }
    finally { setDocBusy(false); }
  };

  const selfGenerateReport = async (type: 'stay' | 'attendance') => {
    if (!patientData || !reportRef.current) return;
    setReportLoading(true);
    try {
      await new Promise(r => setTimeout(r, 200));
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.addImage(imgData, "JPEG", 0, 0, 210, (canvas.height * 210) / canvas.width);
      pdf.save(`${type === 'stay' ? 'אישור_שהייה' : 'דו"ח_נוכחות'}_${patientData.firstName}.pdf`);
    } catch (err) { console.error(err); }
    finally { setReportLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-teal-500" /></div>;

  return (
    <div className="space-y-10 max-w-5xl">
      <div>
        <h2 className="text-3xl font-black mb-2">מסמכים ואישורים</h2>
        <p className="text-[var(--muted)]">הפקה עצמאית של אישורי השתתפות ודו״חות נוכחות</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Self Service Section */}
        <section className="space-y-6">
           <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-10 space-y-8 shadow-sm">
              <h3 className="text-xl font-black flex items-center gap-2">
                <Check className="w-6 h-6 text-teal-500" /> הפקה עצמאית (מהיר)
              </h3>

              <div className="grid grid-cols-1 gap-4">
                 <div className="bg-[var(--background)] border border-[var(--border)] rounded-3xl p-6 flex items-center justify-between group hover:border-teal-500/30 transition-all">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-500 flex items-center justify-center">
                          <Shield className="w-6 h-6" />
                       </div>
                       <div>
                          <p className="font-black text-sm">אישור השתתפות פעילה</p>
                          <p className="text-[10px] text-[var(--muted)]">אישור רשמי לצרכי בירוקרטיה</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => selfGenerateReport("stay")} 
                      disabled={reportLoading}
                      className="p-3 rounded-xl bg-teal-500 text-white shadow-lg shadow-teal-500/20 hover:bg-teal-600 transition-all"
                    >
                      {reportLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                 </div>

                 <div className="bg-[var(--background)] border border-[var(--border)] rounded-3xl p-6 space-y-6 group hover:border-sky-500/30 transition-all">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
                             <BarChart3 className="w-6 h-6" />
                          </div>
                          <div>
                             <p className="font-black text-sm">דו״ח נוכחות חודשי</p>
                             <p className="text-[10px] text-[var(--muted)]">פירוט ימי נוכחות והיעדרות</p>
                          </div>
                       </div>
                       <button 
                         onClick={() => selfGenerateReport("attendance")} 
                         disabled={reportLoading}
                         className="p-3 rounded-xl bg-sky-500 text-white shadow-lg shadow-sky-500/20 hover:bg-sky-600 transition-all"
                       >
                         {reportLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                       </button>
                    </div>
                    
                    <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
                       <Calendar className="w-4 h-4 text-[var(--muted)]" />
                       <select 
                         value={selectedReportMonth}
                         onChange={(e) => setSelectedReportMonth(e.target.value)}
                         className="flex-1 bg-transparent text-xs font-black focus:outline-none"
                       >
                         {(() => {
                            const months = [];
                            const start = patientData?.startDate ? parseISO(patientData.startDate) : new Date();
                            const curr = new Date();
                            let iter = new Date(curr.getFullYear(), curr.getMonth(), 1);
                            while (iter >= new Date(start.getFullYear(), start.getMonth(), 1)) {
                              months.push(new Date(iter));
                              iter = addMonths(iter, -1);
                            }
                            return months.map((m, i) => (
                              <option key={i} value={format(m, "yyyy-MM")}>{format(m, "MMMM yyyy", { locale: he })}</option>
                            ));
                         })()}
                       </select>
                    </div>
                 </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 flex gap-3 items-start">
                 <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                 <p className="text-[10px] text-amber-700/80 leading-relaxed font-bold">שימו לב: מסמכים אלו מופקים באופן ממוחשב ותקפים לרוב המוסדות. במידה ונדרשת חתימה ידנית - השתמשו באופציית "בקשה מיוחדת".</p>
              </div>
           </div>

           <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-10 shadow-sm">
              <h3 className="text-xl font-black mb-6 flex items-center gap-2 text-amber-500">
                <Send className="w-6 h-6" /> בקשה מיוחדת מהצוות
              </h3>
              <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => requestDoc("stay")} disabled={docBusy} className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl border-2 border-[var(--border)] hover:border-amber-500/30 hover:bg-amber-500/[0.02] transition-all">
                    <Shield className="w-8 h-8 text-amber-500" />
                    <span className="text-[11px] font-black">אישור חתום ידנית</span>
                 </button>
                 <button onClick={() => requestDoc("attendance")} disabled={docBusy} className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl border-2 border-[var(--border)] hover:border-amber-500/30 hover:bg-amber-500/[0.02] transition-all">
                    <BarChart3 className="w-8 h-8 text-amber-500" />
                    <span className="text-[11px] font-black">דו״ח היסטורי מורכב</span>
                 </button>
              </div>
           </div>
        </section>

        {/* Status & Archive Section */}
        <section className="space-y-6">
           <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-10 min-h-[400px] shadow-sm">
              <h3 className="text-xl font-black mb-8 flex items-center gap-2">
                 <Clock className="w-6 h-6 text-teal-500" /> היסטוריה וסטטוס בקשות
              </h3>
              
              <div className="space-y-4">
                 {/* Pending */}
                 {docRequests.filter(r => r.status === 'pending').map((r, i) => (
                    <div key={i} className="bg-[var(--background)] border border-amber-500/20 rounded-2xl p-5 flex items-center justify-between animate-pulse">
                       <div className="flex items-center gap-4">
                          <Clock className="w-5 h-5 text-amber-500" />
                          <div>
                             <p className="text-sm font-black">{r.type === 'stay' ? 'אישור שהייה' : 'דו״ח נוכחות'}</p>
                             <p className="text-[10px] text-[var(--muted)]">נשלח ב-{format(r.createdAt?.toDate() || new Date(), "dd/MM/yyyy")}</p>
                          </div>
                       </div>
                       <span className="text-[10px] font-black bg-amber-500/10 text-amber-500 px-3 py-1.5 rounded-full">בטיפול צוות</span>
                    </div>
                 ))}

                 {/* Ready Documents */}
                 {myDocs.map((doc, i) => (
                    <div key={i} className="bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 flex items-center justify-between group hover:border-teal-500/30 transition-all">
                       <div className="flex items-center gap-4">
                          <FileText className="w-5 h-5 text-teal-500" />
                          <div>
                             <p className="text-sm font-black">{doc.title}</p>
                             <p className="text-[10px] text-[var(--muted)]">{format(doc.createdAt?.toDate() || new Date(), "dd/MM/yyyy")}</p>
                          </div>
                       </div>
                       <button 
                         onClick={() => window.open(doc.url, "_blank")}
                         className="p-2.5 rounded-xl bg-teal-500/10 text-teal-500 hover:bg-teal-500 hover:text-white transition-all"
                       >
                         <Download className="w-5 h-5" />
                       </button>
                    </div>
                 ))}

                 {docRequests.length === 0 && myDocs.length === 0 && (
                   <div className="text-center py-20 opacity-20">
                      <FileText className="w-12 h-12 mx-auto mb-4" />
                      <p className="text-sm font-black">אין מסמכים בארכיון</p>
                   </div>
                 )}
              </div>
           </div>
        </section>
      </div>

      {/* ── PDF Template — offscreen ── */}
      {patientData && (
        <div style={{ position: "fixed", left: -9999, top: -9999 }}>
          <div ref={reportRef} style={{
            width: "794px", padding: "80px", backgroundColor: "#ffffff",
            color: "#000000", fontFamily: "Arial, sans-serif", lineHeight: 1.6, direction: "rtl"
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #059669", paddingBottom: "32px", marginBottom: "48px" }}>
              <div>
                <h1 style={{ fontSize: "32px", fontWeight: 900, color: "#059669", margin: "0 0 8px 0" }}>מרכז חוסן</h1>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#64748b", margin: 0 }}>חוות רום</h2>
              </div>
              <div style={{ textAlign: "left", fontSize: "13px", color: "#94a3b8", fontFamily: "monospace" }}>
                <p style={{ margin: "0 0 4px 0" }}>{format(new Date(), "dd/MM/yyyy")}</p>
                <p style={{ margin: 0 }}>סימוכין: {patientData.id?.slice(-6).toUpperCase()}</p>
              </div>
            </div>

            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: "64px" }}>
              <h3 style={{ fontSize: "26px", fontWeight: 900, margin: "0 0 16px 0" }}>אישור השתתפות בתוכנית</h3>
              <div style={{ width: "96px", height: "4px", backgroundColor: "#10b981", margin: "0 auto", borderRadius: "9999px" }} />
            </div>

            {/* Body */}
            <div style={{ fontSize: "17px" }}>
              <p style={{ marginBottom: "24px" }}>לכל המעוניין,</p>
              <p style={{ marginBottom: "24px", lineHeight: 2 }}>
                הרינו לאשר כי המטופל/ת <strong>{patientData.firstName} {patientData.lastName}</strong>, ת.ז <strong>{patientData.idNumber}</strong>, משתתף/ת באופן פעיל בתוכנית המרכז במסגרת קבוצת <strong>{groups.find(g => g.id === patientData.hosenType)?.name || "—"}</strong>.
              </p>
              <p style={{ marginBottom: "24px" }}>
                המטופל/ת החל/ה את פעילותו/ה בתוכנית בתאריך {patientData.startDate ? format(new Date(patientData.startDate), "dd/MM/yyyy") : "—"}.
              </p>

              {/* Stats box */}
              <div style={{ backgroundColor: "#f8fafc", padding: "32px", borderRadius: "24px", border: "1px solid #f1f5f9", margin: "48px 0" }}>
                <h4 style={{ fontWeight: 900, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", marginBottom: "16px" }}>סיכום נוכחות תקופתי</h4>
                <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "28px", fontWeight: 900, color: "#059669", margin: "0 0 4px 0" }}>{attendanceHistory.filter(h => h.status === 'present').length}</p>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", margin: 0 }}>ימי נוכחות</p>
                  </div>
                  <div style={{ width: "1px", height: "48px", backgroundColor: "#e2e8f0" }} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "28px", fontWeight: 900, color: "#e11d48", margin: "0 0 4px 0" }}>{attendanceHistory.filter(h => h.status === 'absent').length}</p>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", margin: 0 }}>ימי היעדרות</p>
                  </div>
                </div>
              </div>

              <p style={{ marginTop: "48px", marginBottom: "8px" }}>בברכה,</p>
              <p style={{ fontWeight: 900, margin: "0 0 4px 0" }}>הנהלת מרכז חוסן</p>
              <p style={{ fontSize: "13px", color: "#64748b", fontStyle: "italic", margin: 0 }}>חוות רום - שיקום חקלאי וקהילתי</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

