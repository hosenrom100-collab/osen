"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, addDoc, serverTimestamp, getDocs,
  query, orderBy, where
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  UserPlus, Calendar, CreditCard, User,
  ArrowRight, Loader2, CheckCircle, Briefcase, Layers, Users
} from "lucide-react";

interface Program { id: string; name: string }
interface Group   { id: string; name: string; programId?: string }

const FIELD = "w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-all text-white [color-scheme:dark]";
const LABEL = "text-sm font-medium text-slate-400 flex items-center gap-2 mb-2";

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
    startDate:        new Date().toISOString().split("T")[0],
    endDate:          "",
    hosenType:        "",   // group ID
    programId:        "",   // program ID (denormalised for fast queries)
    status:           "active" as const,
    assignedWorkerId: "",
  });

  const set = (patch: Partial<typeof formData>) =>
    setFormData(f => ({ ...f, ...patch }));

  /* ── Load reference data ── */
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
          workers.push({ id: d.id, name: data.name || data.email });
      });
      setSocialWorkers(workers);
    };
    load();
  }, []);

  /* ── Derived ── */
  const programGroups = allGroups.filter(g => g.programId === selectedProgramId);
  // Groups without any programId (legacy data or manually created)
  const ungroupedGroups = allGroups.filter(g => !g.programId);

  const handleProgramChange = (progId: string) => {
    setSelectedProgramId(progId);
    set({ programId: progId, hosenType: "" }); // reset group when program changes
  };

  /* ── Submit ── */
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
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-5">

      {/* ── Program ── */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 space-y-3">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-violet-400" /> שיבוץ תוכנית וקבוצה
        </p>

        {/* Program selector */}
        {programs.length > 0 && (
          <div>
            <label className={LABEL}><Layers className="w-4 h-4" /> תוכנית</label>
            <div className="flex flex-wrap gap-2">
              {programs.map(p => (
                <button key={p.id} type="button" onClick={() => handleProgramChange(p.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                    selectedProgramId === p.id
                      ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-600/20"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Group selector — filtered by program */}
        <div>
          <label className={LABEL}><Users className="w-4 h-4" /> קבוצה *</label>
          {(programGroups.length > 0 || ungroupedGroups.length > 0) ? (
            <div className="flex flex-wrap gap-2">
              {(selectedProgramId ? programGroups : ungroupedGroups).map(g => (
                <button key={g.id} type="button"
                  onClick={() => set({ hosenType: g.id })}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                    formData.hosenType === g.id
                      ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}>
                  {g.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 text-sm italic">
              {selectedProgramId ? "אין קבוצות לתוכנית זו" : "בחר תוכנית כדי לראות קבוצות, או הוסף קבוצות ב'ניהול תוכניות'"}
            </p>
          )}
          {!formData.hosenType && (
            <p className="text-rose-400 text-[11px] mt-1.5">* יש לבחור קבוצה</p>
          )}
        </div>
      </div>

      {/* ── Personal info ── */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 space-y-4">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-blue-400" /> פרטים אישיים
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}><User className="w-4 h-4" /> שם פרטי</label>
            <input required type="text" value={formData.firstName}
              onChange={e => set({ firstName: e.target.value })}
              placeholder="ישראל" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}><User className="w-4 h-4" /> שם משפחה</label>
            <input required type="text" value={formData.lastName}
              onChange={e => set({ lastName: e.target.value })}
              placeholder="ישראלי" className={FIELD} />
          </div>
        </div>

        <div>
          <label className={LABEL}><CreditCard className="w-4 h-4" /> תעודת זהות</label>
          <input required type="text" pattern="[0-9]*" maxLength={9}
            value={formData.idNumber} onChange={e => set({ idNumber: e.target.value })}
            placeholder="000000000" className={FIELD} />
        </div>
      </div>

      {/* ── Assignment & Status ── */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 space-y-4">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Briefcase className="w-3.5 h-3.5 text-emerald-400" /> שיבוץ וסטטוס
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}><CheckCircle className="w-4 h-4" /> סטטוס</label>
            <select value={formData.status} onChange={e => set({ status: e.target.value as any })} className={FIELD}>
              <option value="active">פעיל</option>
              <option value="waiting_intake">ממתין לאינטייק</option>
              <option value="waiting_start">ממתין להתחלה</option>
              <option value="finished">סיום</option>
            </select>
          </div>
          <div>
            <label className={LABEL}><Briefcase className="w-4 h-4" /> עו״ס מטפל</label>
            <select value={formData.assignedWorkerId} onChange={e => set({ assignedWorkerId: e.target.value })} className={FIELD}>
              <option value="">בחר עו״ס...</option>
              {socialWorkers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}><Calendar className="w-4 h-4" /> תאריך התחלה</label>
            <input required type="date" value={formData.startDate}
              onChange={e => set({ startDate: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}><Calendar className="w-4 h-4" /> תאריך סיום</label>
            <input type="date" value={formData.endDate}
              onChange={e => set({ endDate: e.target.value })} className={FIELD} />
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button type="button" onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
          <ArrowRight className="w-4 h-4" /> ביטול
        </button>
        <button type="submit" disabled={loading || !formData.hosenType}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 px-8 rounded-2xl hover:opacity-90 transition-all disabled:opacity-40 shadow-lg shadow-purple-500/20">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
          הוסף מטופל
        </button>
      </div>
    </form>
  );
}
