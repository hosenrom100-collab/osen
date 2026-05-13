"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, orderBy } from "firebase/firestore";
import { ClipboardList, ArrowRight, Calendar as CalendarIcon, Search, Loader2, Send, CheckCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AttendanceItem } from "@/components/admin/attendance/AttendanceItem";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { sendPush } from "@/lib/notify";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  hosenType: string;
}

interface Group {
  id: string;
  name: string;
}

interface AttendanceRecord {
  [patientId: string]: "present" | "absent" | "unset";
}

import { Suspense } from "react";

function AttendancePageContent() {
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>(searchParams.get("group") || "");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sendingSummary, setSendingSummary] = useState(false);
  const [summarySent, setSummarySent] = useState(false);
  const router = useRouter();
  
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchData();
    }
  }, [selectedGroup]);

  const fetchGroups = async () => {
    try {
      const groupsSnap = await getDocs(query(collection(db, "groups"), orderBy("name")));
      const groupList: Group[] = [];
      groupsSnap.forEach(doc => groupList.push({ id: doc.id, name: doc.data().name }));
      setGroups(groupList);

      if (!selectedGroup && groupList.length > 0) {
        setSelectedGroup(groupList[0].id);
      } else if (groupList.length === 0) {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching groups:", error);
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const groupObj = groups.find(g => g.id === selectedGroup);
      const groupName = groupObj?.name || "";

      // Fetch ALL patients for debugging and filtering
      const patientsSnap = await getDocs(collection(db, "patients"));
      const patientsList: Patient[] = [];
      
      patientsSnap.forEach(doc => {
        const data = doc.data();
        // Be more inclusive: check if they belong to the group, status is a secondary filter
        const matchesGroup = data.hosenType === selectedGroup || data.hosenType === groupName;
        
        if (matchesGroup) {
          patientsList.push({ id: doc.id, ...data } as Patient);
        }
      });
      
      // Sort patients by name
      patientsList.sort((a, b) => a.firstName.localeCompare(b.firstName, "he"));
      setPatients(patientsList);

      // Fetch today's attendance
      const attendanceQuery = query(
        collection(db, "attendance"),
        where("date", "==", today)
      );
      const attendanceSnap = await getDocs(attendanceQuery);
      const records: AttendanceRecord = {};
      attendanceSnap.forEach(doc => {
        const data = doc.data();
        records[data.patientId] = data.status;
      });
      setAttendance(records);
    } catch (error) {
      console.error("Error fetching attendance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAttendance = async (patientId: string, status: "present" | "absent") => {
    try {
      // Optimistic update for better UX
      setAttendance(prev => ({ ...prev, [patientId]: status }));

      const docId = `${today}_${patientId}`;
      await setDoc(doc(db, "attendance", docId), {
        date: today,
        patientId,
        status,
        hosenType: selectedGroup,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error("Error updating attendance:", error);
      // Revert on error
      fetchData();
    }
  };

  const filteredPatients = patients.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: patients.length,
    present: patients.filter(p => attendance[p.id] === "present").length,
    absent: patients.filter(p => attendance[p.id] === "absent").length,
    missing: patients.filter(p => !attendance[p.id] || attendance[p.id] === "unset").length
  };

  const handleSendSummary = async () => {
    setSendingSummary(true);
    const groupName = groups.find(g => g.id === selectedGroup)?.name || selectedGroup;
    const dateStr = format(new Date(), "d/M/yyyy");
    await sendPush({
      role: ["admin", "manager"],
      title: `סיכום נוכחות – ${groupName}`,
      body: `${dateStr}: ${stats.present} נוכחים מתוך ${stats.total} (${stats.missing} טרם נסמנו)`,
      link: "/admin/patient-attendance",
    });
    setSendingSummary(false);
    setSummarySent(true);
    setTimeout(() => setSummarySent(false), 3000);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 pb-28">
      <header className="max-w-4xl mx-auto mb-8 sticky top-0 bg-slate-950/80 backdrop-blur-md z-40 py-2 pt-4">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="p-2.5 bg-white/5 border border-white/10 rounded-2xl active:scale-95 transition-all flex-shrink-0"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">נוכחות מטופלים</h1>
            <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold mt-0.5">
              <CalendarIcon className="w-3 h-3" />
              {format(new Date(), "EEEE, d בMMMM yyyy", { locale: he })}
            </div>
          </div>
          <button
            onClick={handleSendSummary}
            disabled={sendingSummary || stats.total === 0}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-bold transition-all flex-shrink-0 ${
              summarySent
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 disabled:opacity-40"
            }`}
          >
            {sendingSummary ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : summarySent ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {summarySent ? "נשלח" : "שלח סיכום"}
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-center">
            <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">סה״כ</p>
            <h3 className="text-2xl font-bold text-white">{stats.total}</h3>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-2xl text-center">
            <p className="text-emerald-500 text-[10px] font-bold uppercase mb-1">נוכחים</p>
            <h3 className="text-2xl font-bold text-emerald-400">{stats.present}</h3>
          </div>
          <div className="bg-rose-500/5 border border-rose-500/10 p-3 rounded-2xl text-center">
            <p className="text-rose-500 text-[10px] font-bold uppercase mb-1">נעדרים</p>
            <h3 className="text-2xl font-bold text-rose-400">{stats.absent}</h3>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/10 p-3 rounded-2xl text-center">
            <p className="text-blue-500 text-[10px] font-bold uppercase mb-1">נותרו</p>
            <h3 className="text-2xl font-bold text-blue-400">{stats.missing}</h3>
          </div>
        </div>

        {/* Progress Bar */}
        {stats.total > 0 && (
          <div className="mb-4">
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((stats.present / stats.total) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-600 font-bold mt-1 text-left">
              {Math.round((stats.present / stats.total) * 100)}% נוכחות
            </p>
          </div>
        )}

        {/* Group Chips - Horizontal Scroll */}
        <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 mb-4">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group.id)}
              className={`flex-shrink-0 px-6 py-3 rounded-2xl text-xs font-black transition-all border-2 ${
                selectedGroup === group.id 
                  ? "bg-emerald-600 border-emerald-400 text-white shadow-xl shadow-emerald-600/30 scale-105" 
                  : "bg-white/5 border-white/10 text-slate-500"
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="חיפוש מטופל ברשימה..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-[1.25rem] py-4 pr-11 pl-4 text-sm focus:outline-none focus:border-emerald-500 transition-all shadow-2xl shadow-black/40"
          />
        </div>
      </header>

      <div className="max-w-4xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-slate-500 text-xs animate-pulse">טוען רשימת מטופלים...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredPatients.map((patient) => (
                <motion.div
                  key={patient.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <AttendanceItem
                    patient={patient}
                    status={attendance[patient.id] || "unset"}
                    onToggle={(status) => handleToggleAttendance(patient.id, status)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredPatients.length === 0 && (
              <div className="text-center py-20 bg-white/5 border border-dashed border-white/10 rounded-[2.5rem]">
                <ClipboardList className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <p className="text-slate-500 text-sm">לא נמצאו מטופלים רלוונטיים</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function AttendancePage() {
  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "employee"]} redirectTo="/">
      <Suspense fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      }>
        <AttendancePageContent />
      </Suspense>
    </RoleGuard>
  );
}
