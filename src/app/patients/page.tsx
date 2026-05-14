"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useMemo, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, doc, deleteDoc } from "firebase/firestore";
import { 
  Users, Search, Plus, Filter, MoreHorizontal, 
  Trash2, User, ChevronLeft, LayoutGrid, List,
  Loader2, ExternalLink, Calendar, Shield, Phone,
  Briefcase, CalendarDays
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  hosenType: string;
  status: string;
  assignedWorkerId?: string;
  startDate?: string;
  endDate?: string;
  phone?: string;
  fullName?: string;
}

interface Group {
  id: string;
  name: string;
}

interface Staff {
  id: string;
  name: string;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pSnap, gSnap, uSnap] = await Promise.all([
          getDocs(collection(db, "patients")),
          getDocs(collection(db, "groups")),
          getDocs(collection(db, "users"))
        ]);
        
        setPatients(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
        setGroups(gSnap.docs.map(d => ({ id: d.id, name: d.data().name } as Group)));
        
        const staffMap: Record<string, string> = {};
        uSnap.forEach(d => {
          const data = d.data();
          staffMap[d.id] = data.displayName || data.name || data.email;
        });
        setStaff(staffMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    return patients.filter(p => {
      const nameMatch = `${p.firstName} ${p.lastName} ${p.idNumber} ${p.fullName || ""}`.toLowerCase().includes(searchTerm.toLowerCase());
      const groupMatch = selectedGroup === "all" || p.hosenType === selectedGroup || 
                         groups.find(g => g.id === selectedGroup)?.name === p.hosenType;
      return nameMatch && groupMatch;
    });
  }, [patients, searchTerm, selectedGroup, groups]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("האם אתה בטוח שברצונך למחוק מטופל זה?")) return;
    try {
      await deleteDoc(doc(db, "patients", id));
      setPatients(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert("שגיאה במחיקת המטופל");
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "dd/MM/yy", { locale: he });
    } catch {
      return dateStr;
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-8">
        
        {/* Page Header */}
        <div className="max-w-7xl mx-auto mb-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-1">
              <h1 className="text-3xl font-black tracking-tight">ניהול מטופלים</h1>
              <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                <Users className="w-3 h-3 text-emerald-500" />
                <span>{filtered.length} רשומות פעילות במערכת</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
               <div className="flex bg-[var(--foreground)]/5 p-1 rounded-xl border border-[var(--border)] mr-4">
                  <button onClick={() => setViewMode("table")} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'text-[var(--foreground)]/40'}`}>
                    <List className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewMode("cards")} className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'text-[var(--foreground)]/40'}`}>
                    <LayoutGrid className="w-4 h-4" />
                  </button>
               </div>

               <button 
                onClick={() => router.push("/patients/new")}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl text-sm font-black transition-all shadow-xl shadow-emerald-600/20"
               >
                 <Plus className="w-4 h-4" />
                 מטופל חדש
               </button>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 relative group">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/20 group-focus-within:text-emerald-500 transition-colors" />
              <input 
                type="text" 
                placeholder="חיפוש לפי שם או תעודת זהות..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl pr-12 pl-4 py-3.5 text-sm font-bold outline-none focus:border-emerald-500/50 transition-all"
              />
            </div>
            
            <div className="md:col-span-3">
              <select 
                value={selectedGroup}
                onChange={e => setSelectedGroup(e.target.value)}
                className="w-full bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl px-4 py-3.5 text-sm font-bold outline-none appearance-none cursor-pointer"
              >
                <option value="all">כל התוכניות</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-20">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest">טוען נתונים...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-40 bg-[var(--card-bg)] border border-dashed border-[var(--border)] rounded-[3rem] opacity-20">
              <p className="text-lg font-bold italic">לא נמצאו מטופלים העונים לחיפוש</p>
            </div>
          ) : viewMode === "table" ? (
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/10">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-[var(--foreground)]/[0.03] border-b border-[var(--border)]">
                      <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30">מטופל</th>
                      <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30">תעודת זהות</th>
                      <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30">עו"ס מלווה</th>
                      <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30">תוכנית</th>
                      <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30">תאריך התחלה</th>
                      <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30">תאריך סיום</th>
                      <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30">סטטוס</th>
                      <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filtered.map((p) => (
                      <tr 
                        key={p.id} 
                        onClick={() => router.push(`/patients/${p.id}`)}
                        className="hover:bg-[var(--foreground)]/[0.02] transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-black text-xs">
                              {p.firstName?.[0]}{p.lastName?.[0]}
                            </div>
                            <span className="font-black text-sm group-hover:text-emerald-500 transition-colors">
                              {p.firstName} {p.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-xs font-bold font-mono opacity-60">{p.idNumber}</td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                             <Briefcase className="w-3.5 h-3.5 text-emerald-500/40" />
                             <span className="text-xs font-bold">{staff[p.assignedWorkerId || ""] || "לא שובץ"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="px-3 py-1 rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[10px] font-black">
                            {groups.find(g => g.id === p.hosenType)?.name || p.hosenType || "כללי"}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-xs font-bold opacity-60">{formatDate(p.startDate)}</td>
                        <td className="px-6 py-5 text-xs font-bold opacity-60">{formatDate(p.endDate)}</td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-400'}`} />
                            <span className="text-xs font-bold">{p.status === 'active' ? 'פעיל' : 'לא פעיל'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-left">
                          <button 
                            onClick={(e) => handleDelete(p.id, e)}
                            className="p-2 hover:bg-rose-500/10 text-[var(--foreground)]/20 hover:text-rose-500 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((p) => (
                <motion.div 
                  key={p.id}
                  layout
                  onClick={() => router.push(`/patients/${p.id}`)}
                  className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] p-6 cursor-pointer hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-black/20 transition-all group relative overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 text-xl font-black">
                      {p.firstName?.[0]}{p.lastName?.[0]}
                    </div>
                    <button onClick={(e) => handleDelete(p.id, e)} className="p-2 text-[var(--foreground)]/10 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-1 mb-6">
                    <h3 className="text-lg font-black tracking-tight">{p.firstName} {p.lastName}</h3>
                    <p className="text-[10px] font-black text-[var(--foreground)]/30 uppercase tracking-widest">{p.idNumber}</p>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]/60">
                       <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
                       {staff[p.assignedWorkerId || ""] || "לא שובץ"}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-[var(--foreground)]/30">
                       <CalendarDays className="w-3.5 h-3.5" />
                       {formatDate(p.startDate)} - {formatDate(p.endDate)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-6">
                     <span className="px-3 py-1 rounded-lg bg-[var(--foreground)]/5 text-[9px] font-black uppercase tracking-widest border border-[var(--border)]">
                       {groups.find(g => g.id === p.hosenType)?.name || p.hosenType || "כללי"}
                     </span>
                     <div className={`px-3 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                       {p.status === 'active' ? 'פעיל' : 'ממתין'}
                     </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                    <div className="flex items-center gap-2 text-[var(--foreground)]/40">
                       <Phone className="w-3.5 h-3.5" />
                       <span className="text-[10px] font-bold">{p.phone || "—"}</span>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-emerald-500" />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}
