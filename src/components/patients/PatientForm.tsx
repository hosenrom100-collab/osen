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

  const [selectedProgramId, setSelectedProgramId] = useState(initialData?.programId || "");
  const [formData, setFormData] = useState({
    firstName:          initialData?.firstName || "",
    lastName:           initialData?.lastName || "",
    idNumber:           initialData?.idNumber || "",
    phone:              initialData?.phone || "",
    startDate:          initialData?.startDate || new Date().toISOString().split("T")[0],
    endDate:            initialData?.endDate || autoEndDate(new Date().toISOString().split("T")[0]),
    hosenType:          initialData?.hosenType || "",
    programId:          initialData?.programId || "",
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

  const programGroups = allGroups.filter(g => g.programId === selectedProgramId);
  const ungroupedGroups = allGroups.filter(g => !g.programId);

  const handleProgramChange = (progId: string) => {
    setSelectedProgramId(progId);
    set({ programId: progId, hosenType: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasGroups = programGroups.length > 0;
    if (hasGroups && !formData.hosenType) { 
      alert("נא לבחור קבוצה");
      return; 
    }
    setLoading(true);
    try {
      if (patientId) {
        const { doc, updateDoc } = await import("firebase/firestore");
        await updateDoc(doc(db, "patients", patientId), {
          ...formData,
          fullName: `${formData.firstName} ${formData.lastName}`,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "patients"), {
          ...formData,
          fullName:  `${formData.firstName} ${formData.lastName}`,
          createdAt: serverTimestamp(),
        });
      }
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/patients");
      }
    } catch {
      alert(patientId ? "שגיאה בעדכון מטופל" : "שגיאה בהוספת מטופל");
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={LABEL}><Layers className="w-3 h-3" /> תוכנית</label>
            <select required value={selectedProgramId} onChange={e => handleProgramChange(e.target.value)} className={FIELD}>
              <option value="">בחר תוכנית...</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name.startsWith("תוכנית") ? p.name : `תוכנית ${p.name}`}</option>)}
            </select>
          </div>

          <div>
            <label className={LABEL}><Users className="w-3 h-3" /> קבוצה</label>
            <select 
              required={programGroups.length > 0} 
              value={formData.hosenType} 
              onChange={e => set({ hosenType: e.target.value })} 
              className={FIELD} 
              disabled={!selectedProgramId || (selectedProgramId && programGroups.length === 0)}
            >
              <option value="">{programGroups.length === 0 ? "אין קבוצות בתוכנית זו" : "בחר קבוצה..."}</option>
              {programGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name.startsWith("תוכנית") ? g.name : `תוכנית ${g.name}`}</option>
              ))}
            </select>
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
          <label className={LABEL}><Calendar className="w-3 h-3" /> תאריך תחילת טיפול</label>
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
        {patientId ? "שמירת שינויים" : "פתיחת תיק מטופל"}
      </button>
    </form>
  );
}
