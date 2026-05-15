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
      <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-200 overflow-hidden flex flex-col">
        
        {/* Top Header */}
        <header className="h-16 border-b border-white/10 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 hover:bg-white/5 rounded-xl transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-black tracking-tight">מטריצת נוכחות חודשית</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="חיפוש לפי שם או ת.ז..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl pr-10 pl-4 py-2 text-sm outline-none focus:border-emerald-500/50 transition-all w-64"
              />
            </div>
            <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-all">
              <Download className="w-4 h-4" />
              ייצא לאקסל
            </button>
          </div>
        </header>

        {/* Excel Tabs (Years/Months) */}
        <div className="bg-slate-900 border-b border-white/10 px-6 py-2 flex items-center gap-6 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
            {years.map(y => (
              <button 
                key={y}
                onClick={() => setCurrentDate(new Date(y, getMonth(currentDate)))}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${getYear(currentDate) === y ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-white/5 text-slate-400'}`}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {months.map(m => (
              <button 
                key={m}
                onClick={() => setCurrentDate(new Date(getYear(currentDate), m))}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap ${getMonth(currentDate) === m ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'hover:bg-white/5 text-slate-500'}`}
              >
                {format(new Date(getYear(currentDate), m, 1), "MMMM", { locale: he })}
              </button>
            ))}
          </div>
        </div>

        {/* Matrix Container */}
        <div className="flex-1 overflow-auto relative bg-white p-4">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
              <p className="text-sm font-bold text-slate-400">טוען נתונים...</p>
            </div>
          ) : (
            <div className="inline-block min-w-full align-middle border border-slate-300">
              {(() => {
                // Determine the union of all active days
                const unionActiveDays = new Set<number>();
                programs.forEach(p => p.activeDays.forEach(d => unionActiveDays.add(d)));
                
                // Only show days that are active in AT LEAST one program
                const activeDates = daysInMonth.filter(day => unionActiveDays.has(getDay(day)));

                return (
                  <table className="border-collapse text-right w-full text-slate-900 text-xs">
                    <thead className="sticky top-0 z-30">
                      <tr className="bg-slate-100 shadow-[0_1px_0_0_#cbd5e1]">
                        <th className="sticky right-0 z-40 bg-slate-100 p-2 border-b border-l border-slate-300 font-bold min-w-[180px] shadow-[1px_0_0_0_#cbd5e1]">מטופל</th>
                        <th className="p-2 border-b border-l border-slate-300 font-bold min-w-[100px]">ת.ז</th>
                        <th className="p-2 border-b border-l border-slate-300 font-bold min-w-[120px]">תוכנית</th>
                        <th className="p-2 border-b border-l border-slate-300 font-bold min-w-[100px]">קבוצה</th>
                        
                        {activeDates.map(day => (
                          <th key={day.toISOString()} className="p-1 border-b border-l border-slate-300 text-center min-w-[35px] bg-slate-50">
                            <p className="text-[9px] font-medium text-slate-500 leading-none">{format(day, "EE", { locale: he })}</p>
                            <p className="text-sm font-black mt-0.5 text-slate-900">{format(day, "d")}</p>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {filteredPatients.map((p, idx) => {
                        const prog = getProgramForPatient(p);
                        const pActiveDays = prog?.activeDays || [];

                        return (
                          <tr key={p.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="sticky right-0 z-20 bg-inherit p-2 border-l border-slate-300 font-bold shadow-[1px_0_0_0_#cbd5e1]">
                              {p.firstName} {p.lastName}
                            </td>
                            <td className="p-2 border-l border-slate-300 text-slate-600">
                              {p.idNumber}
                            </td>
                            <td className="p-2 border-l border-slate-300 text-slate-700">
                              {prog?.name || "-"}
                            </td>
                            <td className="p-2 border-l border-slate-300 text-slate-600">
                              {getGroupName(p.hosenType)}
                            </td>

                            {activeDates.map(day => {
                              const dateStr = format(day, "yyyy-MM-dd");
                              const status = attendance[`${p.id}_${dateStr}`];
                              const isActiveForThisPatient = pActiveDays.includes(getDay(day));
                              
                              return (
                                <td 
                                  key={dateStr}
                                  className={`p-0 border-l border-slate-300 text-center ${!isActiveForThisPatient ? 'bg-slate-200/30' : ''}`}
                                >
                                  {!isActiveForThisPatient ? (
                                    <div className="w-full h-full flex items-center justify-center py-2 opacity-10">
                                      <Minus className="w-2.5 h-2.5" />
                                    </div>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center py-2">
                                      {status === 'present' ? (
                                        <Check className="w-4 h-4 text-emerald-600 font-black" />
                                      ) : status === 'absent' ? (
                                        <XIcon className="w-4 h-4 text-rose-600" />
                                      ) : (
                                        <div className="w-1 h-1 rounded-full bg-slate-300" />
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
        <footer className="h-10 border-t border-slate-300 bg-slate-100 flex items-center justify-between px-6 shrink-0 text-slate-600">
          <div className="flex items-center gap-6 text-[10px] font-bold">
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>נוכח</span>
            </div>
            <div className="flex items-center gap-2">
              <XIcon className="w-3.5 h-3.5 text-rose-600" />
              <span>נעדר</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-slate-400" />
              <span>טרם סומן</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-full h-2 px-2 bg-slate-200/50 border border-slate-300 text-[8px] flex items-center justify-center">
                <Minus className="w-2 h-2 opacity-20" />
              </div>
              <span>יום לא פעיל בתוכנית</span>
            </div>
          </div>

          <div className="text-[10px] font-bold">
            סה"כ מטופלים: {filteredPatients.length}
          </div>
        </footer>
      </div>
    </RoleGuard>
  );
}
