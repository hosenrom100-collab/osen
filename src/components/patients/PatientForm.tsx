"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, addDoc, serverTimestamp, getDocs,
  query, orderBy
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  UserPlus, Calendar, CreditCard, User,
  ArrowRight, Loader2, CheckCircle, Briefcase, Layers, Users,
  ClipboardList, ShieldCheck, Phone
} from "lucide-react";

interface Program { id: string; name: string }
interface Group   { id: string; name: string; programId?: string }

const FIELD = "w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3.5 text-sm font-bold outline-none focus:border-emerald-500/50 transition-all text-[var(--foreground)]";
const LABEL = "text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/40 mb-2 mr-1 flex items-center gap-2";

export function PatientForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [programs,      setPrograms]      = useState<Program[]>([]);
  const [allGroups,     setAllGroups]     = useState<Group[]>([]);
  const [socialWorkers, setSocialWorkers] = useState<{ id: string; name: string }[]>([]);

  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [formData, setFormData] = useState({
    firstName:        "",
    lastName:         "",
    idNumber:         "",
    phone:            "",
    startDate:        new Date().toISOString().split("T")[0],
    endDate:          "",
    hosenType:        "",   
    programId:        "",   
    status:           "active" as const,
    assignedWorkerId: "",
  });

  const set = (patch: Partial<typeof formData>) =>
    setFormData(f => ({ ...f, ...patch }));

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
        if (["social_worker","admin","manager"].includes(data.role))
          workers.push({ id: d.id, name: data.displayName || data.name || data.email });
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
    if (!formData.hosenType) { return; }
    setLoading(true);
    try {
      await addDoc(collection(db, "patients"), {
        ...formData,
        fullName:  `${formData.firstName} ${formData.lastName}`,
        createdAt: serverTimestamp(),
      });
      router.push("/patients");
    } catch {
      alert("שגיאה בהוספת מטופל");
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
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className={LABEL}><Users className="w-3 h-3" /> קבוצה</label>
            <select required value={formData.hosenType} onChange={e => set({ hosenType: e.target.value })} className={FIELD} disabled={!selectedProgramId && ungroupedGroups.length === 0}>
              <option value="">בחר קבוצה...</option>
              {(selectedProgramId ? programGroups : ungroupedGroups).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
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
          <input required type="date" value={formData.startDate} onChange={e => set({ startDate: e.target.value })} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}><Calendar className="w-3 h-3" /> תאריך סיום משוער</label>
          <input type="date" value={formData.endDate} onChange={e => set({ endDate: e.target.value })} className={FIELD} />
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

      <button 
        type="submit" 
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
        פתיחת תיק מטופל
      </button>
    </form>
  );
}
