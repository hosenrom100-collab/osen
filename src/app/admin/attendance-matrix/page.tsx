"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { 
  Loader2, ChevronRight, ChevronLeft, Download, 
  Search, Filter, Calendar as CalendarIcon,
  Check, X as XIcon, Minus, Info
} from "lucide-react";
import { useRouter } from "next/navigation";
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameDay, parseISO, getDay, getYear, getMonth,
  addMonths, subMonths, isWithinInterval
} from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  programId?: string;
  hosenType?: string; // Group ID
}

interface Program {
  id: string;
  name: string;
  activeDays: number[];
}

interface Group {
  id: string;
  name: string;
  programId: string;
}

interface AttendanceMap {
  [key: string]: "present" | "absent"; // Key: patientId_yyyy-MM-dd
}

export default function AttendanceMatrixPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate)
    });
  }, [currentDate]);

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");

      const [pSnap, progSnap, groupSnap, attSnap] = await Promise.all([
        getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
        getDocs(collection(db, "programs")),
        getDocs(collection(db, "groups")),
        getDocs(query(
          collection(db, "attendance"), 
          where("date", ">=", monthStart),
          where("date", "<=", monthEnd)
        ))
      ]);

      const pList = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'he'));
      
      setPatients(pList);
      setPrograms(progSnap.docs.map(d => ({ id: d.id, ...d.data() } as Program)));
      setGroups(groupSnap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));

      const aMap: AttendanceMap = {};
      attSnap.forEach(d => {
        const data = d.data();
        aMap[`${data.patientId}_${data.date}`] = data.status;
      });
      setAttendance(aMap);
    } catch (err) {
      console.error("Error fetching matrix data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getProgramForPatient = (p: Patient) => {
    return programs.find(pr => pr.id === p.programId);
  };

  const getGroupName = (groupId?: string) => {
    return groups.find(g => g.id === groupId)?.name || "-";
  };

  const filteredPatients = patients.filter(p => 
    `${p.firstName} ${p.lastName} ${p.idNumber}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const years = [2026, 2027, 2028, 2029, 2030];
  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <RoleGuard allowedRoles={["admin", "manager"]}>
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden flex flex-col">
        
        {/* Top Header */}
        <header className="h-20 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="w-10 h-10 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl flex items-center justify-center hover:bg-[var(--foreground)]/10 transition-all text-[var(--foreground)]">
              <ChevronRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black tracking-tight">מטריצת נוכחות חודשית</h1>
              <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-0.5">Monthly Attendance Matrix</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/30" />
              <input 
                type="text" 
                placeholder="חיפוש לפי שם או ת.ז..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl pr-10 pl-4 py-2.5 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all w-64 text-[var(--foreground)] placeholder:text-[var(--foreground)]/30"
              />
            </div>
            <button className="flex items-center gap-2 bg-[var(--primary)] hover:opacity-90 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-md shadow-[var(--primary)]/10 active:scale-95">
              <Download className="w-4 h-4" />
              ייצא לאקסל
            </button>
          </div>
        </header>

        {/* Excel Tabs (Years/Months) */}
        <div className="bg-[var(--surface)] border-b border-[var(--border-subtle)] px-6 py-3 flex items-center gap-6 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 bg-[var(--foreground)]/5 p-1 rounded-xl border border-[var(--border-subtle)]">
            {years.map(y => (
              <button 
                key={y}
                onClick={() => setCurrentDate(new Date(y, getMonth(currentDate)))}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${getYear(currentDate) === y ? 'bg-[var(--primary)] text-white shadow-md' : 'hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/50'}`}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-[var(--border)]" />

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {months.map(m => (
              <button 
                key={m}
                onClick={() => setCurrentDate(new Date(getYear(currentDate), m))}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap ${getMonth(currentDate) === m ? 'bg-[var(--primary-faint)] text-[var(--primary)] border border-[var(--primary)]/20' : 'hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/40'}`}
              >
                {format(new Date(getYear(currentDate), m, 1), "MMMM", { locale: he })}
              </button>
            ))}
          </div>
        </div>

        {/* Matrix Container */}
        <div className="flex-1 overflow-auto relative p-6 bg-[var(--background)]">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--background)]">
              <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
              <p className="text-xs font-bold text-[var(--foreground)]/40">טוען נתונים...</p>
            </div>
          ) : (
            <div className="inline-block min-w-full align-middle border border-[var(--border)] rounded-[2rem] overflow-hidden bg-[var(--card-bg)] shadow-sm">
              {(() => {
                // Determine the union of all active days
                const unionActiveDays = new Set<number>();
                programs.forEach(p => p.activeDays.forEach(d => unionActiveDays.add(d)));
                
                // Only show days that are active in AT LEAST one program
                const activeDates = daysInMonth.filter(day => unionActiveDays.has(getDay(day)));

                return (
                  <table className="border-collapse text-right w-full text-[var(--foreground)] text-xs">
                    <thead className="sticky top-0 z-30">
                      <tr className="bg-[var(--foreground)]/[0.03] shadow-[0_1px_0_0_var(--border)]">
                        <th className="sticky right-0 z-40 bg-[var(--card-bg)] p-3.5 border-b border-l border-[var(--border)] font-black min-w-[180px] shadow-[1px_0_0_0_var(--border)]">משתתף</th>
                        <th className="p-3.5 border-b border-l border-[var(--border)] font-black min-w-[100px]">ת.ז</th>
                        <th className="p-3.5 border-b border-l border-[var(--border)] font-black min-w-[120px]">תוכנית</th>
                        <th className="p-3.5 border-b border-l border-[var(--border)] font-black min-w-[100px]">קבוצה</th>
                        
                        {activeDates.map(day => (
                          <th key={day.toISOString()} className="p-2 border-b border-l border-[var(--border)] text-center min-w-[38px] bg-[var(--foreground)]/[0.01]">
                            <p className="text-[9px] font-bold text-[var(--foreground)]/40 leading-none">{format(day, "EE", { locale: he })}</p>
                            <p className="text-xs font-black mt-1 text-[var(--foreground)]">{format(day, "d")}</p>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {filteredPatients.map((p, idx) => {
                        const prog = getProgramForPatient(p);
                        const pActiveDays = prog?.activeDays || [];

                        return (
                          <tr key={p.id} className="hover:bg-[var(--foreground)]/[0.01] transition-colors">
                            <td className="sticky right-0 z-20 bg-[var(--card-bg)] p-3 border-l border-[var(--border)] font-black shadow-[1px_0_0_0_var(--border)]">
                              {p.firstName} {p.lastName}
                            </td>
                            <td className="p-3 border-l border-[var(--border)] text-[var(--foreground)]/60 font-medium">
                              {p.idNumber}
                            </td>
                            <td className="p-3 border-l border-[var(--border)] text-[var(--foreground)]/70 font-semibold">
                              {prog?.name || "-"}
                            </td>
                            <td className="p-3 border-l border-[var(--border)] text-[var(--foreground)]/60 font-medium">
                              {getGroupName(p.hosenType)}
                            </td>

                            {activeDates.map(day => {
                              const dateStr = format(day, "yyyy-MM-dd");
                              const status = attendance[`${p.id}_${dateStr}`];
                              const isActiveForThisPatient = pActiveDays.includes(getDay(day));
                              
                              return (
                                <td 
                                  key={dateStr}
                                  className={`p-0 border-l border-[var(--border)] text-center ${!isActiveForThisPatient ? 'bg-[var(--foreground)]/[0.03]' : ''}`}
                                >
                                  {!isActiveForThisPatient ? (
                                    <div className="w-full h-full flex items-center justify-center py-2.5 opacity-20">
                                      <Minus className="w-2.5 h-2.5" />
                                    </div>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center py-2.5">
                                      {status === 'present' ? (
                                        <Check className="w-4 h-4 text-emerald-500 font-black" />
                                      ) : status === 'absent' ? (
                                        <XIcon className="w-4 h-4 text-rose-500" />
                                      ) : (
                                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--foreground)]/20" />
                                      )}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}
        </div>

        {/* Legend / Footer */}
        <footer className="h-12 border-t border-[var(--border-subtle)] bg-[var(--foreground)]/[0.02] flex items-center justify-between px-6 shrink-0 text-[var(--foreground)]/60 font-semibold text-[10px]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 font-bold" />
              <span>נוכח</span>
            </div>
            <div className="flex items-center gap-2">
              <XIcon className="w-4 h-4 text-rose-500" />
              <span>נעדר</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--foreground)]/30" />
              <span>טרם סומן</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-2 py-0.5 bg-[var(--foreground)]/[0.03] border border-[var(--border)] text-[8px] flex items-center justify-center rounded">
                <Minus className="w-2 h-2 opacity-30" />
              </div>
              <span>יום לא פעיל בתוכנית</span>
            </div>
          </div>

          <div className="font-bold">
            סה"כ משתתפים: {filteredPatients.length}
          </div>
        </footer>
      </div>
    </RoleGuard>
  );
}
