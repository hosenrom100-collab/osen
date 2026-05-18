"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useMemo, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, doc, deleteDoc } from "firebase/firestore";
import { 
  Users, Search, Plus, Filter, MoreHorizontal, 
  Trash2, User, ChevronLeft, LayoutGrid, List,
  Loader2, ExternalLink, Calendar, Shield, Phone,
  Briefcase, CalendarDays, Check, ChevronDown, X
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
  programId?: string;
  programIds?: string[];
  groupIds?: string[];
}

interface Group {
  id: string;
  name: string;
  programId?: string;
}

interface Staff {
  id: string;
  name: string;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<{ programs: string[]; groups: string[] }>({
    programs: [],
    groups: []
  });
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setViewMode("cards");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hosen_patients_selected_filters");
      if (saved) {
        try {
          setSelectedFilters(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pSnap, gSnap, prSnap, uSnap] = await Promise.all([
          getDocs(collection(db, "patients")),
          getDocs(collection(db, "groups")),
          getDocs(collection(db, "programs")),
          getDocs(collection(db, "users"))
        ]);
        
        const pts = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));
        pts.sort((a, b) => {
          const lnA = a.lastName || "";
          const lnB = b.lastName || "";
          const cmp = lnA.localeCompare(lnB, 'he');
          if (cmp !== 0) return cmp;
          return (a.firstName || "").localeCompare(b.firstName || "", 'he');
        });
        setPatients(pts);
        setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
        setPrograms(prSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
        
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

  const handleToggleProgramFilter = (id: string) => {
    setSelectedFilters(prev => {
      const nextPrograms = prev.programs.includes(id)
        ? prev.programs.filter(x => x !== id)
        : [...prev.programs, id];
      const next = { ...prev, programs: nextPrograms };
      localStorage.setItem("hosen_patients_selected_filters", JSON.stringify(next));
      return next;
    });
  };

  const handleToggleGroupFilter = (id: string) => {
    setSelectedFilters(prev => {
      const nextGroups = prev.groups.includes(id)
        ? prev.groups.filter(x => x !== id)
        : [...prev.groups, id];
      const next = { ...prev, groups: nextGroups };
      localStorage.setItem("hosen_patients_selected_filters", JSON.stringify(next));
      return next;
    });
  };

  const handleClearFilters = () => {
    const next = { programs: [], groups: [] };
    setSelectedFilters(next);
    localStorage.setItem("hosen_patients_selected_filters", JSON.stringify(next));
  };

  const filtered = useMemo(() => {
    return patients.filter(p => {
      const nameMatch = `${p.firstName} ${p.lastName} ${p.idNumber} ${p.fullName || ""}`.toLowerCase().includes(searchTerm.toLowerCase());
      
      const noFilters = selectedFilters.programs.length === 0 && selectedFilters.groups.length === 0;
      if (noFilters) return nameMatch;

      const patientPrograms = p.programIds || (p.programId ? [p.programId] : []);
      const patientGroups = p.groupIds || (p.hosenType ? [p.hosenType] : []);

      const matchesProgram = patientPrograms.some((id: string) => selectedFilters.programs.includes(id));
      const matchesGroup = patientGroups.some((id: string) => selectedFilters.groups.includes(id));

      return nameMatch && (matchesProgram || matchesGroup);
    });
  }, [patients, searchTerm, selectedFilters]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("האם אתה בטוח שברצונך למחוק משתתף זה?")) return;
    try {
      await deleteDoc(doc(db, "patients", id));
      setPatients(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert("שגיאה במחיקת המשתתף");
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight">ניהול משתתפים</h1>
            <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
              <Users className="w-3 h-3 text-emerald-500" />
              <span>{filtered.length} רשומות פעילות</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[var(--foreground)]/5 p-1 rounded-lg border border-[var(--border)] mr-4">
              <button 
                onClick={() => setViewMode("table")} 
                title="תצוגת טבלה"
                className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'text-[var(--foreground)]/40'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setViewMode("cards")} 
                title="תצוגת כרטיסים"
                className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'text-[var(--foreground)]/40'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>

            <button 
              onClick={() => router.push("/patients/new")}
              title="הוספת משתתף חדש למערכת"
              className="flex items-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-5 py-2.5 rounded-xl text-xs font-black transition-all hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              משתתף חדש
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-12 gap-2 relative z-50">
          <div className="md:col-span-7 relative group">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/40" />
            <input 
              type="text" 
              placeholder="חיפוש לפי שם או תעודת זהות..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl pr-11 pl-4 py-2.5 text-xs font-bold outline-none focus:border-[var(--muted)]/50 transition-all"
            />
          </div>
          
          <div className="md:col-span-5 relative">
            <button
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl px-4 py-2.5 text-xs font-black flex items-center justify-between transition-all hover:bg-[var(--foreground)]/[0.08] active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-emerald-500" />
                <span>{selectedFilters.programs.length + selectedFilters.groups.length > 0 
                  ? `סינון פעיל (${selectedFilters.programs.length + selectedFilters.groups.length})` 
                  : "כל התוכניות והקבוצות"}</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${filterDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Click backdrop to close */}
            {filterDropdownOpen && (
              <div 
                className="fixed inset-0 z-40 bg-transparent" 
                onClick={() => setFilterDropdownOpen(false)} 
              />
            )}

            {/* Dropdown Popover */}
            <AnimatePresence>
              {filterDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 md:left-auto md:w-[380px] top-full mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-4 z-50 text-right overflow-hidden flex flex-col"
                  dir="rtl"
                >
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
                    <span className="text-xs font-black text-[var(--foreground)]">סינון לפי תוכניות וקבוצות</span>
                    {(selectedFilters.programs.length > 0 || selectedFilters.groups.length > 0) && (
                      <button 
                        onClick={handleClearFilters}
                        className="text-[10px] font-black text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        נקה הכל
                      </button>
                    )}
                  </div>

                  <div className="overflow-y-auto max-h-[320px] pr-1 space-y-4 no-scrollbar">
                    {/* Programs Section */}
                    {programs.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider mb-2 pr-1 border-r-2 border-emerald-500">תוכניות</h4>
                        <div className="grid grid-cols-1 gap-1">
                          {programs.map(p => {
                            const isSelected = selectedFilters.programs.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                onClick={() => handleToggleProgramFilter(p.id)}
                                className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between active:scale-[0.98] ${
                                  isSelected 
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                    : 'hover:bg-[var(--foreground)]/5 border border-transparent'
                                }`}
                              >
                                <span>{p.name.startsWith("תוכנית") ? p.name : `תוכנית ${p.name}`}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Groups Section */}
                    {groups.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider mb-2 pr-1 border-r-2 border-indigo-500">קבוצות</h4>
                        <div className="grid grid-cols-1 gap-1">
                          {groups.map(g => {
                            const prog = programs.find(p => p.id === g.programId);
                            const displayName = prog ? `${prog.name} - ${g.name}` : g.name;
                            const isSelected = selectedFilters.groups.includes(g.id);
                            return (
                              <button
                                key={g.id}
                                onClick={() => handleToggleGroupFilter(g.id)}
                                className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between active:scale-[0.98] ${
                                  isSelected 
                                    ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20' 
                                    : 'hover:bg-[var(--foreground)]/5 border border-transparent'
                                }`}
                              >
                                <span className="truncate max-w-[280px]">{displayName}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500 stroke-[3]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-20">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest">טוען נתונים...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-40 bg-[var(--foreground)]/5 border border-dashed border-[var(--border)] rounded-[3rem] opacity-20">
              <p className="text-lg font-bold italic">לא נמצאו משתתפים העונים לחיפוש</p>
            </div>
          ) : viewMode === "table" ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-[var(--foreground)]/5 border-b border-[var(--border)]">
                      <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">משתתף</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">תעודת זהות</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">עו"ס מלווה</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">תוכנית</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">תאריך התחלה</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">תאריך סיום</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">סטטוס</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] w-16"></th>
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
                            {(() => {
                              const patientProgs = p.programIds || (p.programId ? [p.programId] : []);
                              const patientGrps = p.groupIds || (p.hosenType ? [p.hosenType] : []);
                              
                              if (patientProgs.length === 0 && patientGrps.length === 0) return "כללי";
                              
                              const grpNames = patientGrps.map((gId: string) => {
                                const g = groups.find(x => x.id === gId);
                                if (!g) return gId;
                                const prog = programs.find(x => x.id === g.programId);
                                return prog ? `${prog.name} - ${g.name}` : g.name;
                              });

                              const progNames = patientProgs.filter((pId: string) => {
                                const hasGroupShown = groups.some(g => g.programId === pId && patientGrps.includes(g.id));
                                return !hasGroupShown;
                              }).map((pId: string) => {
                                const prog = programs.find(x => x.id === pId);
                                return prog ? prog.name : pId;
                              });

                              const allNames = [...progNames, ...grpNames];
                              const display = allNames.join(", ");
                              if (display && display !== "כללי" && !display.startsWith("תוכנית")) {
                                return `תוכנית ${display}`;
                              }
                              return display || "כללי";
                            })()}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-xs font-bold opacity-60">{formatDate(p.startDate)}</td>
                        <td className="px-6 py-5 text-xs font-bold opacity-60">{formatDate(p.endDate)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-emerald-500' : 'bg-[var(--muted)]/30'}`} />
                            <span className="text-xs font-bold">{p.status === 'active' ? 'פעיל' : 'לא פעיל'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-left">
                          <button 
                            onClick={(e) => handleDelete(p.id, e)}
                            title="מחיקת משתתף"
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
            <div className="space-y-2">
              {filtered.map((p) => (
                <motion.div 
                  key={p.id}
                  layout
                  onClick={() => router.push(`/patients/${p.id}`)}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-4 active:bg-[var(--foreground)]/5 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-[var(--foreground)]/5 flex items-center justify-center text-[var(--muted)]/50 text-sm font-black shrink-0">
                    {p.firstName?.[0]}{p.lastName?.[0]}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-black text-[var(--foreground)] group-hover:text-emerald-500 transition-colors truncate">
                        {p.firstName} {p.lastName}
                      </h3>
                      <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-emerald-500' : 'bg-[var(--muted)]/30'}`} />
                    </div>
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] font-bold text-[var(--muted)]/60 whitespace-nowrap">
                        {(() => {
                          const patientProgs = p.programIds || (p.programId ? [p.programId] : []);
                          const patientGrps = p.groupIds || (p.hosenType ? [p.hosenType] : []);
                          
                          if (patientProgs.length === 0 && patientGrps.length === 0) return "כללי";
                          
                          const grpNames = patientGrps.map((gId: string) => {
                            const g = groups.find(x => x.id === gId);
                            if (!g) return gId;
                            const prog = programs.find(x => x.id === g.programId);
                            return prog ? `${prog.name} - ${g.name}` : g.name;
                          });

                          const progNames = patientProgs.filter((pId: string) => {
                            const hasGroupShown = groups.some(g => g.programId === pId && patientGrps.includes(g.id));
                            return !hasGroupShown;
                          }).map((pId: string) => {
                            const prog = programs.find(x => x.id === pId);
                            return prog ? prog.name : pId;
                          });

                          const allNames = [...progNames, ...grpNames];
                          const display = allNames.join(", ");
                          if (display && display !== "כללי" && !display.startsWith("תוכנית")) {
                            return `תוכנית ${display}`;
                          }
                          return display || "כללי";
                        })()}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-[var(--border)] shrink-0" />
                      <span className="text-[10px] font-bold text-[var(--muted)]/60 truncate">
                        {staff[p.assignedWorkerId || ""] || "לא שובץ"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    {p.phone && (
                      <a 
                        href={`tel:${p.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2.5 text-[var(--muted)]/40 hover:text-emerald-500 transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    <div className="p-2.5 text-[var(--muted)]/20">
                      <ChevronLeft className="w-4 h-4" />
                    </div>
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
