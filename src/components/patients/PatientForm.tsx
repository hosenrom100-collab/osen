"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, addDoc, serverTimestamp, getDocs,
  query, orderBy
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  Calendar, Loader2, CheckCircle, Briefcase, Layers, Users,
  ShieldCheck, Phone
} from "lucide-react";

interface Program { id: string; name: string }
interface Group   { id: string; name: string; programId?: string }

const FIELD = "w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3.5 text-sm font-bold outline-none focus:border-emerald-500/50 transition-all text-[var(--foreground)]";
const LABEL = "text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/40 mb-2 mr-1 flex items-center gap-2";

function autoEndDate(startDate: string): string {
  if (!startDate) return "";
  try {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split("T")[0];
  } catch { return ""; }
}

interface PatientFormProps {
  patientId?: string;
  initialData?: any;
  onSuccess?: () => void;
}

export function PatientForm({ patientId, initialData, onSuccess }: PatientFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [programs,      setPrograms]      = useState<Program[]>([]);
  const [allGroups,     setAllGroups]     = useState<Group[]>([]);
  const [socialWorkers, setSocialWorkers] = useState<{ id: string; name: string }[]>([]);

  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>(
    initialData?.programIds || (initialData?.programId ? [initialData.programId] : [])
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initialData?.groupIds || (initialData?.hosenType ? [initialData.hosenType] : [])
  );
  const [formData, setFormData] = useState({
    firstName:          initialData?.firstName || "",
    lastName:           initialData?.lastName || "",
    idNumber:           initialData?.idNumber || "",
    phone:              initialData?.phone || "",
    startDate:          initialData?.startDate || new Date().toISOString().split("T")[0],
    endDate:            initialData?.endDate || autoEndDate(new Date().toISOString().split("T")[0]),
    status:             (initialData?.status || "active") as any,
    assignedWorkerId:   initialData?.assignedWorkerId || "",
    rehabPlanCompleted: initialData?.rehabPlanCompleted || false,
  });

  const set = (patch: Partial<typeof formData>) =>
    setFormData(f => ({ ...f, ...patch }));

  const handleStartDateChange = (val: string) => {
    const patch: Partial<typeof formData> = { startDate: val };
    if (!formData.endDate || formData.endDate === autoEndDate(formData.startDate)) {
      patch.endDate = autoEndDate(val);
    }
    set(patch);
  };

  useEffect(() => {
    const load = async () => {
      const [progSnap, groupSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, "programs"), orderBy("name"))),
        getDocs(query(collection(db, "groups"),   orderBy("name"))),
        getDocs(collection(db, "users")),
      ]);
      setPrograms(progSnap.docs.map(d => ({ id: d.id, ...d.data() as any })));
      setAllGroups(groupSnap.docs.map(d => ({ id: d.id, ...d.data() as any })));
      const workers: { id: string; name: string }[] = [];
      usersSnap.forEach(d => {
        const data = d.data();
        const userRoles = (data.roles as string[]) || (data.role ? [data.role] : []);
        const isWorker = userRoles.some(r => ["social_worker", "admin", "manager"].includes(r));
        
        if (isWorker) {
          workers.push({ id: d.id, name: data.displayName || data.name || data.email });
        }
      });
      setSocialWorkers(workers);
    };
    load();
  }, []);

  const handleToggleProgram = (pId: string) => {
    setSelectedProgramIds(prev => {
      const next = prev.includes(pId) ? prev.filter(id => id !== pId) : [...prev, pId];
      if (prev.includes(pId)) {
        const pGroupIds = allGroups.filter(g => g.programId === pId).map(g => g.id);
        setSelectedGroupIds(gPrev => gPrev.filter(id => !pGroupIds.includes(id)));
      }
      return next;
    });
  };

  const handleToggleGroup = (gId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(gId) ? prev.filter(id => id !== gId) : [...prev, gId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProgramIds.length === 0) {
      alert("אנא בחר לפחות תוכנית אחת משויכת");
      return;
    }
    // Check that each selected program which has groups has at least one group selected in it
    for (const pId of selectedProgramIds) {
      const pGroups = allGroups.filter(g => g.programId === pId);
      if (pGroups.length > 0) {
        const hasSelectedGroupInProg = pGroups.some(g => selectedGroupIds.includes(g.id));
        if (!hasSelectedGroupInProg) {
          const progName = programs.find(p => p.id === pId)?.name || "";
          alert(`אנא בחר לפחות קבוצה אחת עבור תוכנית ${progName}`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const finalPayload = {
        ...formData,
        programIds: selectedProgramIds,
        groupIds: selectedGroupIds,
        programId: selectedProgramIds[0] || "",
        hosenType: selectedGroupIds[0] || "",
        fullName: `${formData.firstName} ${formData.lastName}`,
      };

      if (patientId) {
        const { doc, updateDoc } = await import("firebase/firestore");
        await updateDoc(doc(db, "patients", patientId), {
          ...finalPayload,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "patients"), {
          ...finalPayload,
          createdAt: serverTimestamp(),
        });
      }
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/patients");
      }
    } catch {
      alert(patientId ? "שגיאה בעדכון משתתף" : "שגיאה בהוספת משתתף");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 pb-10">
      
      {/* ── Personal Info ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className={LABEL}>שם פרטי</label>
          <input required type="text" value={formData.firstName} onChange={e => set({ firstName: e.target.value })} className={FIELD} placeholder="ישראל" />
        </div>
        <div>
          <label className={LABEL}>שם משפחה</label>
          <input required type="text" value={formData.lastName} onChange={e => set({ lastName: e.target.value })} className={FIELD} placeholder="ישראלי" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className={LABEL}>מספר תעודת זהות</label>
          <input required type="text" value={formData.idNumber} onChange={e => set({ idNumber: e.target.value })} className={FIELD} placeholder="000000000" />
        </div>
        <div>
          <label className={LABEL}><Phone className="w-3 h-3" /> מספר טלפון</label>
          <input type="text" value={formData.phone} onChange={e => set({ phone: e.target.value })} className={FIELD} placeholder="050-0000000" />
        </div>
      </div>

      {/* ── Assignment ── */}
      <div className="bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-[2.5rem] p-8 space-y-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-2">שיבוץ לתוכנית וקבוצה</h3>
        
        <div className="space-y-4">
          <label className={LABEL}><Layers className="w-3.5 h-3.5 text-emerald-500" /> תוכניות וקבוצות משויכות</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {programs.map(p => {
              const pGroups = allGroups.filter(g => g.programId === p.id);
              const isSelected = selectedProgramIds.includes(p.id);
              
              return (
                <div key={p.id} className={`border rounded-2xl p-4 transition-all ${
                  isSelected 
                    ? "border-emerald-500/30 bg-emerald-500/[0.02]" 
                    : "border-[var(--border)] bg-transparent hover:bg-[var(--foreground)]/[0.01]"
                }`}>
                  <label className="flex items-center gap-2 cursor-pointer font-black text-sm select-none">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => handleToggleProgram(p.id)}
                      className="rounded border-[var(--border)] text-emerald-500 focus:ring-emerald-500 w-4 h-4 ml-2"
                    />
                    {p.name.startsWith("תוכנית") ? p.name : `תוכנית ${p.name}`}
                  </label>
                  
                  {isSelected && pGroups.length > 0 && (
                    <div className="mt-3 mr-6 space-y-2 border-r border-[var(--border)] pr-3">
                      <p className="text-[10px] font-bold text-[var(--muted)] mb-1">בחר קבוצות משויכות:</p>
                      {pGroups.map(g => {
                        const isGroupSelected = selectedGroupIds.includes(g.id);
                        return (
                          <label key={g.id} className="flex items-center gap-2 cursor-pointer text-xs font-semibold select-none">
                            <input 
                              type="checkbox" 
                              checked={isGroupSelected}
                              onChange={() => handleToggleGroup(g.id)}
                              className="rounded border-[var(--border)] text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5 ml-2"
                            />
                            {g.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className={LABEL}><Briefcase className="w-3 h-3" /> עו"ס מלווה</label>
          <select required value={formData.assignedWorkerId} onChange={e => set({ assignedWorkerId: e.target.value })} className={FIELD}>
            <option value="">בחר עובד...</option>
            {socialWorkers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      {/* ── Dates & Status ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className={LABEL}><Calendar className="w-3 h-3" /> תאריך תחילת השתתפות</label>
          <input required type="date" value={formData.startDate} onChange={e => handleStartDateChange(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}><Calendar className="w-3 h-3" /> תאריך סיום (אוטומטי: 3 חודשים)</label>
          <input type="date" value={formData.endDate} onChange={e => set({ endDate: e.target.value })} className={FIELD} />
          <p className="text-[10px] text-[var(--foreground)]/30 mt-1 mr-1">מחושב אוטומטית — ניתן לשינוי ידני</p>
        </div>
      </div>

      <div>
        <label className={LABEL}><ShieldCheck className="w-3 h-3" /> סטטוס נוכחי</label>
        <select value={formData.status} onChange={e => set({ status: e.target.value as any })} className={FIELD}>
          <option value="active">פעיל</option>
          <option value="pending">ממתין</option>
          <option value="inactive">לא פעיל</option>
        </select>
      </div>

      {/* ── Rehab Plan ── */}
      <div
        className="flex items-center gap-4 bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-2xl p-5 cursor-pointer group select-none"
        onClick={() => set({ rehabPlanCompleted: !formData.rehabPlanCompleted })}
      >
        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
          formData.rehabPlanCompleted
            ? "bg-teal-500 border-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.3)]"
            : "border-[var(--border)] group-hover:border-teal-500/50"
        }`}>
          {formData.rehabPlanCompleted && <CheckCircle className="w-4 h-4 text-white" />}
        </div>
        <div>
          <p className="text-sm font-black">תוכנית שיקום</p>
          <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-0.5">
            סמן כאשר תוכנית השיקום הוצאה ואושרה
          </p>
        </div>
      </div>

      <button 
        type="submit" 
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
        {patientId ? "שמירת שינויים" : "פתיחת תיק משתתף"}
      </button>
    </form>
  );
}
