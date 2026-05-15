"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { Calendar, Search, ArrowRight, Filter, User, Check, X, Loader2, ChevronLeft, MapPin } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface AttendanceRecord {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  status: string;
  hosenType: string;
}

interface Group {
  id: string;
  name: string;
}

import { Suspense } from "react";

function AttendanceLogPageContent() {
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterHosen, setFilterHosen] = useState(searchParams.get("group") || "all");
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch groups
      const groupsSnap = await getDocs(query(collection(db, "groups"), orderBy("name")));
      const groupList: Group[] = [];
      groupsSnap.forEach(doc => groupList.push({ id: doc.id, name: doc.data().name }));
      setGroups(groupList);

      // 2. Fetch patients
      const patientsSnap = await getDocs(collection(db, "patients"));
      const patientsMap: Record<string, {name: string, hosenType: string}> = {};
      patientsSnap.forEach(doc => {
        const data = doc.data();
        const group = groupList.find(g => g.id === data.hosenType);
        patientsMap[doc.id] = {
          name: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : (data.fullName || data.name || doc.id),
          hosenType: group ? group.name : (data.hosenType || "כללי")
        };
      });

      // 3. Fetch attendance
      const attendanceSnap = await getDocs(query(collection(db, "attendance"), orderBy("date", "desc")));
      const allRecords: AttendanceRecord[] = [];
      attendanceSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === "unset") return;
        
        const patientInfo = patientsMap[data.patientId] || { name: "מטופל לא ידוע", hosenType: "unknown" };
        allRecords.push({
          id: doc.id,
          patientId: data.patientId,
          patientName: patientInfo.name,
          date: data.date,
          status: data.status,
          hosenType: patientInfo.hosenType
        });
      });

      setRecords(allRecords);
    } catch (error) {
      console.error("Error fetching attendance log:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = records.filter(r => {
    const matchesSearch = r.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = filterDate ? r.date === filterDate : true;
    const matchesHosen = filterHosen === "all" ? true : (r.hosenType === filterHosen || r.hosenType === groups.find(g => g.id === filterHosen)?.name);
    return matchesSearch && matchesDate && matchesHosen;
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 pb-20">
      <header className="mb-8 sticky top-0 bg-slate-950/80 backdrop-blur-md z-40 py-2 pt-4">
        <div className="flex items-center gap-3 mb-6">
          <button 
            onClick={() => router.push("/")}
            className="p-2.5 bg-white/5 border border-white/10 rounded-2xl active:scale-95 transition-all"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">היסטוריית נוכחות</h1>
            <p className="text-[10px] text-slate-500 font-medium">מעקב אחר הגעת מטופלים למרכז</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="חיפוש מטופל..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-[1.25rem] py-3 pr-11 pl-4 text-sm focus:outline-none focus:border-blue-500 transition-all shadow-lg shadow-black/20"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400" />
              <input 
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-9 pl-3 text-[10px] font-bold focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex-1 relative">
              <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" />
              <select 
                value={filterHosen}
                onChange={(e) => setFilterHosen(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-9 pl-3 text-[10px] font-bold focus:outline-none focus:border-blue-500 appearance-none"
              >
                <option value="all">כל המסגרות</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-slate-500 text-xs animate-pulse">טוען יומן נוכחות...</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((record) => (
              <motion.div
                key={record.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[1.5rem] p-4 flex items-center justify-between group active:bg-[var(--foreground)]/10 transition-colors"
              >
                <div className="flex items-center gap-4 overflow-hidden">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    record.status === "present" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                  }`}>
                    {record.status === "present" ? <Check className="w-6 h-6" /> : <X className="w-6 h-6" />}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-bold text-sm truncate">{record.patientName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-500 font-mono">{record.date}</span>
                      <div className="w-1 h-1 rounded-full bg-slate-700" />
                      <span className="text-[10px] text-blue-400 font-bold">
                        {groups.find(g => g.id === record.hosenType || g.name === record.hosenType)?.name || record.hosenType}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                  record.status === "present" ? "text-emerald-400 bg-emerald-500/5" : "text-rose-400 bg-rose-500/5"
                }`}>
                  {record.status === "present" ? "נוכח" : "נעדר"}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="text-center py-20 bg-white/5 border border-dashed border-white/10 rounded-[2.5rem]">
              <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">לא נמצאו תוצאות לסינון זה</p>
              <button 
                onClick={() => {setSearchTerm(""); setFilterDate(""); setFilterHosen("all");}}
                className="mt-4 text-blue-400 text-xs font-bold"
              >
                נקה הכל
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function AttendanceLogPage() {
  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee"]} redirectTo="/">
      <Suspense fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      }>
        <AttendanceLogPageContent />
      </Suspense>
    </RoleGuard>
  );
}
