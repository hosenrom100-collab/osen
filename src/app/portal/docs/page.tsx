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
  Calendar, Check, AlertCircle, Send, Info, X
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
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqType, setReqType] = useState<"stay" | "attendance" | "custom">("stay");
  const [customType, setCustomType] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [requestMonth, setRequestMonth] = useState(format(new Date(), "yyyy-MM"));
  const stayReportRef = useRef<HTMLDivElement>(null);
  const attendanceReportRef = useRef<HTMLDivElement>(null);

  const getDayName = (dateStr: string) => {
    const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    try {
      const d = new Date(dateStr);
      return `יום ${days[d.getDay()]}`;
    } catch (e) {
      return "";
    }
  };

  const getHebrewMonthName = (monthStr: string) => {
    if (!monthStr) return "";
    const [year, month] = monthStr.split("-");
    const months = [
      "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
      "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
    ];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  const monthlyAttendance = attendanceHistory.filter(h => h.date.startsWith(selectedReportMonth));
  const sortedMonthlyAttendance = [...monthlyAttendance].sort((a, b) => a.date.localeCompare(b.date));

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

  const requestDoc = async (type: "stay" | "attendance" | "custom", customTitle?: string, notes?: string, month?: string) => {
    if (!user || !patientData || docBusy) return;
    setDocBusy(true);
    try {
      await setDoc(doc(collection(db, "document_requests")), {
        patientId: patientData.id,
        patientName: `${patientData.firstName} ${patientData.lastName}`,
        assignedWorkerId: patientData.assignedWorkerId || null,
        type,
        customType: type === 'custom' ? (customTitle || "בקשה מיוחדת") : null,
        notes: notes || null,
        month: type === 'attendance' ? (month || selectedReportMonth) : null,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      alert("בקשתך נשלחה לצוות בהצלחה.");
      setShowRequestModal(false);
      setCustomType("");
      setRequestNotes("");
    } catch (e) {
      console.error(e);
      alert("שגיאה בשליחת הבקשה.");
    } finally {
      setDocBusy(false);
    }
  };

  const selfGenerateReport = async (type: 'stay' | 'attendance') => {
    if (!patientData) return;
    const ref = type === 'stay' ? stayReportRef.current : attendanceReportRef.current;
    if (!ref) return;
    setReportLoading(true);
    try {
      await new Promise(r => setTimeout(r, 200));
      const canvas = await html2canvas(ref, { scale: 2, useCORS: true });
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <button onClick={() => { setReqType("stay"); setShowRequestModal(true); }} disabled={docBusy} className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl border-2 border-[var(--border)] hover:border-amber-500/30 hover:bg-amber-500/[0.02] transition-all text-center">
                    <Shield className="w-8 h-8 text-amber-500" />
                    <span className="text-[11px] font-black">אישור שהייה חתום</span>
                 </button>
                 <button onClick={() => { setReqType("attendance"); setShowRequestModal(true); }} disabled={docBusy} className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl border-2 border-[var(--border)] hover:border-amber-500/30 hover:bg-amber-500/[0.02] transition-all text-center">
                    <BarChart3 className="w-8 h-8 text-amber-500" />
                    <span className="text-[11px] font-black">דו״ח נוכחות מורכב</span>
                 </button>
                 <button onClick={() => { setReqType("custom"); setShowRequestModal(true); }} disabled={docBusy} className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl border-2 border-[var(--border)] hover:border-amber-500/30 hover:bg-amber-500/[0.02] transition-all text-center">
                    <FileText className="w-8 h-8 text-amber-500" />
                    <span className="text-[11px] font-black">בקשה מותאמת אישית</span>
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
                    <div key={i} className="bg-[var(--background)] border border-amber-500/20 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pulse">
                       <div className="flex items-start gap-4">
                          <Clock className="w-5 h-5 text-amber-500 mt-1 shrink-0" />
                          <div>
                             <p className="text-sm font-black">
                                {r.type === 'stay' ? 'אישור שהייה חתום ידנית' : r.type === 'attendance' ? `דו״ח נוכחות חודשי - ${r.month}` : (r.customType || 'בקשה מיוחדת')}
                             </p>
                             <p className="text-[10px] text-[var(--muted)]">נשלח ב-{format(r.createdAt?.toDate() || new Date(), "dd/MM/yyyy")}</p>
                             {r.notes && (
                                <p className="text-xs text-amber-700/80 bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 mt-2 font-medium">
                                   הערה: {r.notes}
                                </p>
                             )}
                          </div>
                       </div>
                       <span className="text-[10px] font-black bg-amber-500/10 text-amber-500 px-3 py-1.5 rounded-full self-start sm:self-center shrink-0">בטיפול צוות</span>
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

      {/* ── PDF Templates — offscreen ── */}
      {patientData && (
        <div style={{ position: "fixed", left: -9999, top: -9999 }}>
          {/* 1. Stay (Participation) Certificate */}
          <div ref={stayReportRef} style={{
            width: "794px", height: "1123px", position: "relative", backgroundColor: "#ffffff",
            color: "#000000", fontFamily: "Arial, sans-serif", lineHeight: 1.6, direction: "rtl"
          }}>
            {/* Background Logo Page */}
            <img 
              src="/logopage.png" 
              style={{ 
                position: "absolute", 
                top: 0, 
                left: 0, 
                width: "100%", 
                height: "100%", 
                objectFit: "cover",
                zIndex: 0
              }} 
            />

            {/* Content Overlay */}
            <div style={{ 
              position: "relative", 
              zIndex: 1, 
              paddingTop: "180px", 
              paddingBottom: "120px", 
              paddingLeft: "75px", 
              paddingRight: "75px" 
            }}>
              {/* Document Meta (Date & Reference) */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", fontSize: "14px", color: "#64748b", fontWeight: 700 }}>
                <div>תאריך: {format(new Date(), "dd.MM.yyyy")}</div>
                <div>סימוכין: {patientData.id?.slice(-6).toUpperCase()}</div>
              </div>

              {/* Recipient */}
              <div style={{ fontSize: "16px", marginBottom: "28px", fontWeight: 700 }}>
                עבור: עו״ס אגף השיקום משרד הביטחון
              </div>

              {/* Title */}
              <div style={{ textAlign: "center", marginBottom: "48px" }}>
                <h3 style={{ fontSize: "26px", fontWeight: 900, margin: "0 0 16px 0", color: "#1e293b" }}>אישור השתתפות בחווה שיקומית</h3>
                <div style={{ width: "96px", height: "4px", backgroundColor: "#10b981", margin: "0 auto", borderRadius: "9999px" }} />
              </div>

              {/* Body */}
              <div style={{ fontSize: "16px", color: "#000000" }}>
                <p style={{ marginBottom: "16px" }}>הנדון: <strong>{patientData.firstName} {patientData.lastName}</strong></p>
                <p style={{ marginBottom: "24px" }}>ת.ז: <strong>{patientData.idNumber || "—"}</strong></p>
                
                <p style={{ marginBottom: "20px", lineHeight: 1.8 }}>
                  הרינו לאשר כי החל בהגעה לחווה מהתאריך <strong>{patientData.startDate ? format(parseISO(patientData.startDate), "dd.MM.yyyy") : "—"}</strong>.
                </p>
                <p style={{ marginBottom: "20px", lineHeight: 1.8 }}>
                  הפעילות בחווה בתוכנית חרבות ברזל מתקיימת בימים ב' ג' וד' בין השעות 9:00-15:00.
                </p>
                <p style={{ marginBottom: "36px", lineHeight: 1.8 }}>
                  הפעילויות השונות המתקיימות בחווה: עבודה חקלאית, גילוף בעץ ומלאכות קדומות, דיקור, יוגה, סדנאות שונות ושיחות קבוצתיות.
                </p>

                <p style={{ marginTop: "40px", marginBottom: "8px" }}>בברכה,</p>
                
                {/* Signature Area */}
                {swData?.signatureImage ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                    <img 
                      src={swData.signatureImage} 
                      alt="חתימה דיגיטלית" 
                      style={{ maxHeight: "64px", maxWidth: "160px", objectFit: "contain", alignSelf: "flex-start" }} 
                    />
                    <p style={{ fontWeight: 900, margin: "4px 0 2px 0", fontSize: "14px" }}>{swData.displayName || swData.name || "מורשה חתימה"}</p>
                    <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{swData.signatureTitle || "עו\"ס בחווה"}</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                    <div style={{ height: "48px", borderBottom: "1px dashed #cbd5e1", width: "160px", marginBottom: "8px" }} />
                    <p style={{ fontWeight: 900, margin: "4px 0 2px 0", fontSize: "14px" }}>{swData?.displayName || swData?.name || "צוות המרכז"}</p>
                    <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{swData?.signatureTitle || "עו\"ס בחווה"}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Monthly Attendance Report with Table */}
          <div ref={attendanceReportRef} style={{
            width: "794px", height: "1123px", position: "relative", backgroundColor: "#ffffff",
            color: "#000000", fontFamily: "Arial, sans-serif", lineHeight: 1.5, direction: "rtl"
          }}>
            {/* Background Logo Page */}
            <img 
              src="/logopage.png" 
              style={{ 
                position: "absolute", 
                top: 0, 
                left: 0, 
                width: "100%", 
                height: "100%", 
                objectFit: "cover",
                zIndex: 0
              }} 
            />

            {/* Content Overlay */}
            <div style={{ 
              position: "relative", 
              zIndex: 1, 
              paddingTop: "175px", 
              paddingBottom: "110px", 
              paddingLeft: "75px", 
              paddingRight: "75px" 
            }}>
              {/* Document Meta (Date & Reference) */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px", fontSize: "13px", color: "#64748b", fontWeight: 700 }}>
                <div>תאריך: {format(new Date(), "dd.MM.yyyy")}</div>
                <div>סימוכין: {patientData.id?.slice(-6).toUpperCase()}</div>
              </div>

              {/* Title */}
              <div style={{ textAlign: "center", marginBottom: "28px" }}>
                <h3 style={{ fontSize: "24px", fontWeight: 900, margin: "0 0 8px 0", color: "#0284c7" }}>דו״ח נוכחות חודשי מפורט</h3>
                <p style={{ fontSize: "14px", color: "#64748b", fontWeight: 700, margin: 0 }}>
                  חודש: {getHebrewMonthName(selectedReportMonth)}
                </p>
                <div style={{ width: "96px", height: "4px", backgroundColor: "#0284c7", margin: "8px auto 0 auto", borderRadius: "9999px" }} />
              </div>

              {/* Participant Details Card */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "16px 20px", backgroundColor: "#f8fafc", borderRadius: "16px", border: "1px solid #e2e8f0", marginBottom: "24px", fontSize: "13px" }}>
                <div>
                  <p style={{ margin: "0 0 4px 0" }}>שם המשתתף/ת: <strong>{patientData.firstName} {patientData.lastName}</strong></p>
                  <p style={{ margin: 0 }}>ת.ז: <strong>{patientData.idNumber || "—"}</strong></p>
                </div>
                <div>
                  <p style={{ margin: "0 0 4px 0" }}>קבוצה: <strong>{(() => { const name = groups.find(g => g.id === patientData.hosenType)?.name; if (!name) return "—"; return name.startsWith("תוכנית") ? name : `תוכנית ${name}`; })()}</strong></p>
                  <p style={{ margin: 0 }}>עובד/ת סוציאלי/ת מלווה: <strong>{swData?.displayName || swData?.name || "צוות המרכז"}</strong></p>
                </div>
              </div>

              {/* Stats box */}
              <div style={{ backgroundColor: "#f0f9ff", padding: "16px 20px", borderRadius: "16px", border: "1px solid #bae6fd", marginBottom: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "24px", fontWeight: 900, color: "#0369a1", margin: "0 0 2px 0" }}>{monthlyAttendance.filter(h => h.status === 'present').length}</p>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#0284c7", margin: 0 }}>ימי נוכחות בפועל</p>
                  </div>
                  <div style={{ width: "1px", height: "32px", backgroundColor: "#bae6fd" }} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "24px", fontWeight: 900, color: "#e11d48", margin: "0 0 2px 0" }}>{monthlyAttendance.filter(h => h.status === 'absent').length}</p>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#be123c", margin: 0 }}>ימי היעדרות</p>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflow: "hidden", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "28px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", direction: "rtl", textAlign: "right" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#0284c7", color: "#ffffff" }}>
                      <th style={{ padding: "10px 12px", fontWeight: 700 }}>תאריך</th>
                      <th style={{ padding: "10px 12px", fontWeight: 700 }}>יום בשבוע</th>
                      <th style={{ padding: "10px 12px", fontWeight: 700 }}>קבוצה</th>
                      <th style={{ padding: "10px 12px", fontWeight: 700, textAlign: "left" }}>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMonthlyAttendance.slice(0, 15).map((h, i) => ( // capped at 15 for premium single-page safety
                      <tr key={i} style={{ borderBottom: "1px solid #e2e8f0", backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 500 }}>{format(parseISO(h.date), "dd/MM/yyyy")}</td>
                        <td style={{ padding: "8px 12px", color: "#64748b" }}>{getDayName(h.date)}</td>
                        <td style={{ padding: "8px 12px", color: "#64748b" }}>{(() => { const name = groups.find(g => g.id === patientData.hosenType)?.name; if (!name) return "—"; return name.startsWith("תוכנית") ? name : `תוכנית ${name}`; })()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "left" }}>
                          <span style={{
                            fontSize: "10px", fontWeight: 900,
                            backgroundColor: h.status === 'present' ? '#d1fae5' : '#fee2e2',
                            color: h.status === 'present' ? '#065f46' : '#991b1b',
                            display: "inline-block", padding: "2px 8px", borderRadius: "6px"
                          }}>
                            {h.status === 'present' ? 'נוכח/ת' : 'נעדר/ת'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {sortedMonthlyAttendance.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>
                          אין רשומות נוכחות רשומות לחודש זה.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer Signatures */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "36px", fontSize: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
                <div>
                  <p style={{ margin: "0 0 2px 0", fontWeight: 700 }}>חתימת מלווה/מנחה:</p>
                  {swData?.signatureImage ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <img 
                        src={swData.signatureImage} 
                        alt="חתימה דיגיטלית" 
                        style={{ maxHeight: "36px", maxWidth: "120px", objectFit: "contain", alignSelf: "flex-start" }} 
                      />
                      <p style={{ fontWeight: 900, margin: "2px 0 0 0", fontSize: "11px" }}>{swData.displayName || swData.name || "מורשה חתימה"}</p>
                      <p style={{ fontSize: "10px", color: "#64748b", margin: 0 }}>{swData.signatureTitle || "עו\"ס בחווה"}</p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ width: "140px", height: "36px", borderBottom: "1px dashed #cbd5e1" }} />
                      <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 0 0" }}>{swData?.displayName || swData?.name || "צוות מרכז חוסן"}</p>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ margin: "0 0 2px 0", fontWeight: 700 }}>חותמת המרכז:</p>
                  <div style={{ width: "100px", height: "36px", borderBottom: "1px dashed #cbd5e1", marginLeft: "auto" }} />
                  <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 0 0" }}>מרכז חוסן חוות רום</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRequestModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] shadow-2xl overflow-hidden p-8 z-10"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    {reqType === 'stay' ? <Shield className="w-5 h-5" /> : reqType === 'attendance' ? <BarChart3 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-base font-black">בקשת מסמך חדשה</h3>
                    <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-wider">
                      {reqType === 'stay' ? 'אישור שהייה חתום ידנית' : reqType === 'attendance' ? 'דו״ח נוכחות חודשי מורכב' : 'בקשה מותאמת אישית'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {reqType === 'custom' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">סוג המסמך המבוקש</label>
                    <input
                      type="text"
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      placeholder="לדוגמה: מכתב סיכום טיפול, אישור מיוחד לביטוח לאומי"
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-amber-500 transition-all font-bold"
                    />
                  </div>
                )}

                {reqType === 'attendance' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">בחר חודש עבור הדו״ח</label>
                    <select
                      value={requestMonth}
                      onChange={(e) => setRequestMonth(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-amber-500 transition-all font-bold cursor-pointer"
                    >
                      {(() => {
                        const options = [];
                        for (let i = 0; i < 12; i++) {
                          const date = addMonths(new Date(), -i);
                          const val = format(date, "yyyy-MM");
                          options.push(
                            <option key={val} value={val}>
                              {format(date, "MMMM yyyy", { locale: he })}
                            </option>
                          );
                        }
                        return options;
                      })()}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">הערות או פרטים מיוחדים (אופציונלי)</label>
                  <textarea
                    value={requestNotes}
                    onChange={(e) => setRequestNotes(e.target.value)}
                    placeholder="פרט כאן כל מידע או הנחיה מיוחדת עבור הצוות לגבי הפקת המסמך..."
                    rows={4}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-amber-500 transition-all font-medium leading-relaxed resize-none"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => requestDoc(reqType, customType, requestNotes, requestMonth)}
                    disabled={docBusy || (reqType === 'custom' && !customType.trim())}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {docBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    שלח בקשה לצוות
                  </button>
                  <button
                    onClick={() => setShowRequestModal(false)}
                    className="flex-1 bg-[var(--background)] hover:bg-[var(--foreground)]/5 border border-[var(--border)] py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

